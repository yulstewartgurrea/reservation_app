"""Per-unit inter-unit buffer for multi-unit (sequential quantity) bookings.

`Service.inter_unit_buffer_minutes` adds a gap between consecutive units of a
multi-unit booking so jobs like "5 aircon units" reserve realistic time to
move/reset between units. Rules implemented and asserted here:

- effective_duration = duration * N + inter_unit_buffer * (N - 1)
- At N=1 the gap term is 0 -> a single-unit booking is byte-for-byte
  unchanged even when inter_unit_buffer_minutes is non-zero (regression guard).
- end_at reflects effective_duration; the end-of-job buffer_minutes is still
  applied ONCE to the block/conflict window only, never to end_at.
- Price is duration-independent: total_price = unit_price * N (gap is free).
"""

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.core.test_factories import (
    future_dt,
    make_customer,
    make_service,
    make_shop,
    make_shop_owner,
)
from apps.reservations.availability import (
    compute_slots,
    compute_slots_any,
    effective_duration_minutes,
)
from apps.reservations.models import Reservation
from apps.reservations.services import (
    create_customer_reservation,
    create_walk_in,
    reschedule,
    transition,
)


class EffectiveDurationHelperTests(TestCase):
    """The single source of truth for the N-unit duration formula."""

    def test_single_unit_ignores_gap(self):
        s = make_service(duration=30, inter_unit_buffer_minutes=15)
        self.assertEqual(effective_duration_minutes(s, 1), 30)

    def test_quantity_below_one_clamped_to_one(self):
        s = make_service(duration=30, inter_unit_buffer_minutes=15)
        self.assertEqual(effective_duration_minutes(s, 0), 30)

    def test_n_units_add_n_minus_one_gaps(self):
        s = make_service(duration=30, inter_unit_buffer_minutes=15)
        # 5 * 30 + 4 * 15 = 150 + 60 = 210
        self.assertEqual(effective_duration_minutes(s, 5), 210)

    def test_zero_gap_is_pure_linear(self):
        s = make_service(duration=30, inter_unit_buffer_minutes=0)
        self.assertEqual(effective_duration_minutes(s, 5), 150)


class SingleUnitRegressionTests(TestCase):
    """A non-zero gap must NOT affect a 1-unit booking in any way."""

    def test_n1_endat_and_block_identical_with_or_without_gap(self):
        start = future_dt(48)

        # Distinct shops so the two single-unit bookings at the same time
        # don't conflict with each other; we only compare their geometry.
        shop_plain = make_shop()
        plain = make_service(
            shop=shop_plain, duration=60, buffer_=10, price="500.00"
        )
        plain.max_quantity = 5
        plain.save()
        r_plain = create_customer_reservation(
            customer=make_customer(),
            shop=shop_plain,
            service=plain,
            start_at=start,
            quantity=1,
        )

        shop_gapped = make_shop()
        gapped = make_service(
            shop=shop_gapped,
            duration=60,
            buffer_=10,
            price="500.00",
            inter_unit_buffer_minutes=45,
        )
        gapped.max_quantity = 5
        gapped.save()
        r_gapped = create_customer_reservation(
            customer=make_customer(),
            shop=shop_gapped,
            service=gapped,
            start_at=start,
            quantity=1,
        )

        # Byte-for-byte identical end_at and total_price for N=1.
        self.assertEqual(r_plain.end_at, r_gapped.end_at)
        self.assertEqual(
            r_gapped.end_at - r_gapped.start_at, timedelta(minutes=60)
        )
        self.assertEqual(r_gapped.total_price, Decimal("500.00"))


class MultiUnitDurationAndPriceTests(TestCase):
    def setUp(self):
        self.customer = make_customer()
        self.shop = make_shop()
        self.service = make_service(
            shop=self.shop,
            duration=30,
            buffer_=10,
            price="200.00",
            inter_unit_buffer_minutes=15,
        )
        self.service.max_quantity = 8
        self.service.save()

    def test_n5_endat_is_5_durations_plus_4_gaps(self):
        start = future_dt(48)
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            start_at=start,
            quantity=5,
        )
        # 5*30 + 4*15 = 210 minutes visible duration.
        self.assertEqual(r.end_at - r.start_at, timedelta(minutes=210))
        # The end-of-job buffer is NOT folded into end_at.
        self.assertEqual(r.end_at, start + timedelta(minutes=210))

    def test_total_price_scales_only_with_quantity_not_gap(self):
        r = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            start_at=future_dt(48),
            quantity=5,
        )
        # 200 * 5 = 1000; the 4 gaps add no cost.
        self.assertEqual(r.total_price, Decimal("1000.00"))

    def test_block_window_adds_buffer_once_on_top_of_gapped_duration(self):
        """end_at carries duration+gaps only; the end-of-job buffer is added
        once to the conflict window of the *new* booking, never to stored
        end_at. Proven by where the next booking is/ isn't allowed."""
        start = future_dt(48)
        first = create_customer_reservation(
            customer=self.customer,
            shop=self.shop,
            service=self.service,
            start_at=start,
            quantity=5,
        )
        # Stored end_at is exactly +210 (5*30 + 4*15); buffer is NOT in it.
        self.assertEqual(first.end_at, start + timedelta(minutes=210))

        # A booking whose own block window (start + dur + buffer) reaches back
        # into the stored [start, +210] interval conflicts: starting at +209
        # overlaps the stored end at +210.
        with self.assertRaises(Exception):
            create_customer_reservation(
                customer=make_customer(),
                shop=self.shop,
                service=self.service,
                start_at=start + timedelta(minutes=209),
                quantity=1,
            )
        # Starting exactly at the stored end (+210) is free — back-to-back is
        # allowed; the end-of-job buffer pads the *new* booking forward only.
        ok = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=start + timedelta(minutes=210),
            quantity=1,
        )
        self.assertIsNotNone(ok.id)


class CommissionUnaffectedByGapTests(TestCase):
    def test_commission_derives_from_total_price_scaled_by_quantity(self):
        owner = make_shop_owner()
        shop = make_shop(owner=owner, commission_rate=Decimal("0.10"))
        service = make_service(
            shop=shop,
            duration=30,
            buffer_=10,
            price="200.00",
            inter_unit_buffer_minutes=20,
        )
        service.max_quantity = 5
        service.save()
        r = create_customer_reservation(
            customer=make_customer(),
            shop=shop,
            service=service,
            start_at=future_dt(48),
            quantity=4,
            payment_method=Reservation.PaymentMethod.ONLINE,
        )
        transition(
            reservation=r, to_status=Reservation.Status.CONFIRMED, actor=owner
        )
        transition(
            reservation=r, to_status=Reservation.Status.COMPLETED, actor=owner
        )
        r.refresh_from_db()
        # total_price = 200 * 4 = 800 (gap-free); commission = 10% = 80.
        self.assertEqual(r.total_price, Decimal("800.00"))
        self.assertEqual(r.commission_amount, Decimal("80.00"))


class AvailabilityHonorsGapTests(TestCase):
    """Slots must shrink/shift when the gap lengthens the required block."""

    def setUp(self):
        self.shop = make_shop()  # open 08:00-20:00 (720 min)

    def _service(self, gap):
        s = make_service(
            shop=self.shop,
            duration=60,
            buffer_=0,
            price="500.00",
            inter_unit_buffer_minutes=gap,
        )
        s.max_quantity = 6
        s.save()
        return s

    def test_gap_yields_fewer_and_earlier_latest_slots_for_n_gt_1(self):
        target = (timezone.now() + timedelta(days=3)).date()

        no_gap = self._service(0)
        with_gap = self._service(30)

        slots0 = compute_slots(self.shop, no_gap, None, target, quantity=4)
        slots1 = compute_slots(self.shop, with_gap, None, target, quantity=4)

        self.assertGreater(len(slots0), 0)
        self.assertGreater(len(slots1), 0)
        # Longer required block -> strictly fewer slots fit before close.
        self.assertGreater(len(slots0), len(slots1))
        # And the latest offered start must move earlier.
        self.assertLess(
            slots1[-1].start_at, slots0[-1].start_at
        )

    def test_returned_slot_end_at_reflects_the_gap(self):
        target = (timezone.now() + timedelta(days=3)).date()
        s = self._service(30)
        slots = compute_slots(self.shop, s, None, target, quantity=4)
        first = slots[0]
        # 4*60 + 3*30 = 240 + 90 = 330 minutes visible duration.
        self.assertEqual(
            first.end_at - first.start_at, timedelta(minutes=330)
        )

    def test_n1_availability_unchanged_by_gap(self):
        target = (timezone.now() + timedelta(days=3)).date()
        no_gap = self._service(0)
        with_gap = self._service(45)
        s0 = compute_slots(self.shop, no_gap, None, target, quantity=1)
        s1 = compute_slots(self.shop, with_gap, None, target, quantity=1)
        self.assertEqual(len(s0), len(s1))
        self.assertEqual(
            s1[0].end_at - s1[0].start_at, timedelta(minutes=60)
        )

    def test_compute_slots_any_honors_gap(self):
        target = (timezone.now() + timedelta(days=3)).date()
        # compute_slots_any unions across the shop's Resource(s); the inter-unit
        # gap geometry is independent of how many Resources exist.
        s = make_service(
            shop=self.shop,
            duration=60,
            buffer_=0,
            price="500.00",
            inter_unit_buffer_minutes=30,
        )
        s.max_quantity = 6
        s.save()
        slots = compute_slots_any(self.shop, s, target, quantity=3)
        self.assertGreater(len(slots), 0)
        # 3*60 + 2*30 = 240 minutes.
        self.assertEqual(
            slots[0].end_at - slots[0].start_at, timedelta(minutes=240)
        )


class GapPushesBackToBackConflictTests(TestCase):
    """A booking allowed at gap=0 must be rejected once the gap lengthens
    the prior booking's block past the next start."""

    def test_back_to_back_rejected_when_gap_pushes_block_end(self):
        shop = make_shop()
        gap_free = make_service(
            shop=shop, duration=30, buffer_=0, price="100.00"
        )
        gap_free.max_quantity = 5
        gap_free.save()
        start = future_dt(48)

        # gap=0: q=3 -> block ends at +90. A booking at +90 is fine.
        create_customer_reservation(
            customer=make_customer(),
            shop=shop,
            service=gap_free,
            start_at=start,
            quantity=3,
        )
        ok = create_customer_reservation(
            customer=make_customer(),
            shop=shop,
            service=gap_free,
            start_at=start + timedelta(minutes=90),
            quantity=1,
        )
        self.assertIsNotNone(ok.id)

        # Same shape but with a 20-min gap: q=3 -> 3*30 + 2*20 = 130. A second
        # booking at +90 (which was free above) now lands inside the block.
        shop2 = make_shop()
        gapped = make_service(
            shop=shop2,
            duration=30,
            buffer_=0,
            price="100.00",
            inter_unit_buffer_minutes=20,
        )
        gapped.max_quantity = 5
        gapped.save()
        create_customer_reservation(
            customer=make_customer(),
            shop=shop2,
            service=gapped,
            start_at=start,
            quantity=3,
        )
        with self.assertRaises(Exception):
            create_customer_reservation(
                customer=make_customer(),
                shop=shop2,
                service=gapped,
                start_at=start + timedelta(minutes=90),
                quantity=1,
            )


class WalkInAndRescheduleGapTests(TestCase):
    def setUp(self):
        self.owner = make_shop_owner()
        self.shop = make_shop(owner=self.owner)
        self.service = make_service(
            shop=self.shop,
            duration=30,
            buffer_=10,
            price="200.00",
            inter_unit_buffer_minutes=15,
        )
        self.service.max_quantity = 6
        self.service.save()

    def test_walk_in_path_honors_gap(self):
        start = future_dt(48)
        r = create_walk_in(
            shop_owner=self.owner,
            shop=self.shop,
            service=self.service,
            start_at=start,
            guest_name="Jane",
            quantity=4,
        )
        # 4*30 + 3*15 = 120 + 45 = 165 minutes.
        self.assertEqual(r.end_at - r.start_at, timedelta(minutes=165))
        self.assertEqual(r.total_price, Decimal("800.00"))

    def test_reschedule_preserves_quantity_and_applies_gap(self):
        r = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=future_dt(48),
            quantity=4,
        )
        reschedule(reservation=r, new_start=future_dt(96), actor=self.owner)
        r.refresh_from_db()
        self.assertEqual(r.quantity, 4)
        # Gap still applied after the move: 4*30 + 3*15 = 165.
        self.assertEqual(r.end_at - r.start_at, timedelta(minutes=165))
        self.assertEqual(r.total_price, Decimal("800.00"))

    def test_reschedule_change_quantity_recomputes_gapped_duration(self):
        r = create_customer_reservation(
            customer=make_customer(),
            shop=self.shop,
            service=self.service,
            start_at=future_dt(48),
            quantity=4,
        )
        reschedule(
            reservation=r,
            new_start=future_dt(96),
            actor=self.owner,
            quantity=2,
        )
        r.refresh_from_db()
        self.assertEqual(r.quantity, 2)
        # 2*30 + 1*15 = 75 minutes.
        self.assertEqual(r.end_at - r.start_at, timedelta(minutes=75))
        self.assertEqual(r.total_price, Decimal("400.00"))

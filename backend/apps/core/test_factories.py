"""Reusable test fixture builders.

Keep tests readable: every test spells out the *intent* (`make_customer()`,
`make_shop_with_hours()`); the boilerplate of who-references-what lives here.
"""

from __future__ import annotations

from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


def make_user(*, role, email=None, password="testpw1234"):
    email = email or f"{role}-{User.objects.count()}@example.com"
    return User.objects.create_user(
        username=email.split("@")[0],
        email=email,
        password=password,
        role=role,
    )


def make_customer(**kwargs):
    return make_user(role=User.Role.CUSTOMER, **kwargs)


def make_shop_owner(**kwargs):
    return make_user(role=User.Role.SHOP_OWNER, **kwargs)


def make_admin(**kwargs):
    user = make_user(role=User.Role.ADMIN, **kwargs)
    user.is_staff = True
    user.is_superuser = True
    user.save()
    return user


def make_shop(
    *,
    owner=None,
    name="Test Shop",
    city="Cebu",
    country="PH",
    status=None,
    open_all_week=True,
    commission_rate=None,
    cancellation_window_hours=None,
):
    from apps.shops.models import Shop, WeekdayHours

    owner = owner or make_shop_owner()
    shop = Shop.objects.create(
        owner=owner,
        name=name,
        address_line="1 Test Lane",
        city=city,
        country=country,
        status=status or Shop.Status.ACTIVE,
        commission_rate=commission_rate,
        cancellation_window_hours=cancellation_window_hours,
    )
    if open_all_week:
        for wd in range(7):
            WeekdayHours.objects.create(
                shop=shop,
                weekday=wd,
                is_closed=False,
                open_time=time(8, 0),
                close_time=time(20, 0),
            )
    return shop


def make_service(*, shop=None, name="Haircut", duration=60, buffer_=0, price="500.00"):
    from apps.services.models import Service

    shop = shop or make_shop()
    return Service.objects.create(
        shop=shop,
        name=name,
        duration_minutes=duration,
        buffer_minutes=buffer_,
        price=Decimal(price),
    )


def make_staff(*, shop=None, name="Alex"):
    from apps.shops.models import Staff, StaffWorkingHours

    shop = shop or make_shop()
    staff = Staff.objects.create(shop=shop, name=name, is_active=True)
    for wd in range(7):
        StaffWorkingHours.objects.create(
            staff=staff,
            weekday=wd,
            is_off=False,
            start_time=time(8, 0),
            end_time=time(20, 0),
        )
    return staff


def future_dt(hours_ahead: int = 48):
    return timezone.now().replace(microsecond=0) + timedelta(hours=hours_ahead)


def make_reservation(
    *,
    customer=None,
    shop=None,
    service=None,
    staff=None,
    start_at=None,
    payment_method=None,
):
    """Create a pending customer reservation via the production service."""
    from apps.reservations.models import Reservation
    from apps.reservations.services import create_customer_reservation

    customer = customer or make_customer()
    if service is None and shop is None:
        service = make_service()
        shop = service.shop
    elif service is None:
        service = make_service(shop=shop)
    else:
        shop = shop or service.shop

    return create_customer_reservation(
        customer=customer,
        shop=shop,
        service=service,
        staff=staff,
        start_at=start_at or future_dt(48),
        payment_method=payment_method or Reservation.PaymentMethod.PAY_ON_ARRIVAL,
    )

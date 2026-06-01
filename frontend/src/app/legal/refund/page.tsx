import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — BookMe",
  description:
    "Cancellation windows, no-show handling, and how refunds work on the BookMe platform.",
};

/**
 * NOTE: Working draft to be reviewed by counsel. Cancellation windows and
 * penalties below reflect the current product behaviour; update them in
 * lockstep with any change to the reservation/cancellation rules in code.
 */
export default function RefundPolicyPage() {
  return (
    <>
      <h1>Refund &amp; Cancellation Policy</h1>
      <p className="text-sm text-slate-500">Last updated: 31 May 2026</p>

      <p>
        This policy explains how cancellations, no-shows, and refunds work on BookMe. It applies
        to all reservations made through the Service and is part of our{" "}
        <a href="/legal/terms">Terms of Service</a>.
      </p>

      <h2>1. Current payment model</h2>
      <p>
        At this time, all reservations on BookMe are paid <strong>directly to the shop on
        arrival</strong>. BookMe does not collect payment from customers at the time of booking
        and therefore does not process refunds in cash. Any monetary refund that may be due is
        handled by the shop directly, in accordance with its own policies and Philippine consumer
        law.
      </p>
      <p>
        Once online payment through PayMongo is introduced, this section will be updated to
        explain how refunds are processed back to the original payment method.
      </p>

      <h2>2. Cancelling a reservation</h2>

      <h3>2.1 Customer-initiated cancellation</h3>
      <p>
        You can cancel a reservation at any time from{" "}
        <a href="/reservations">My Reservations</a>, up until the reservation start time.
        Cancellations made <strong>at least 2 hours</strong> before the reservation start time
        are free of charge.
      </p>
      <p>
        Cancellations made <strong>less than 2 hours</strong> before the reservation start time
        are considered late. Shops may decline future bookings from customers with a pattern of
        late cancellations or no-shows.
      </p>

      <h3>2.2 Shop-initiated cancellation</h3>
      <p>
        A shop may cancel a confirmed reservation in exceptional circumstances (for example,
        staff illness, equipment failure, force majeure). When this happens, BookMe will notify
        you by email and in-app notification. You will not be charged, and we will help you
        rebook with the same or another shop where possible.
      </p>

      <h3>2.3 No-shows</h3>
      <p>
        If you do not arrive within a reasonable window of your reservation start time (typically
        15 minutes, unless the shop&rsquo;s policy says otherwise), the shop may mark the booking
        as a no-show. Repeated no-shows may result in restrictions on your account.
      </p>

      <h2>3. Refunds</h2>

      <h3>3.1 Pay-on-arrival</h3>
      <p>
        Because BookMe does not collect the payment, refunds for pay-on-arrival bookings are
        between you and the shop. If a service was not delivered as described, you should first
        raise the issue with the shop, and may then escalate it to BookMe through the in-app{" "}
        <a href="/support">Support</a> page. We will assist in mediating where appropriate but
        the legal remedy lies between you and the shop.
      </p>

      <h3>3.2 Online payments (future)</h3>
      <p>
        Once online payment is enabled, refunds for eligible reservations will be processed back
        to the original payment method, typically within 5&ndash;10 business days, depending on
        your bank or card issuer. Eligibility rules and any retained processing fees will be
        disclosed at checkout.
      </p>

      <h2>4. Disputes</h2>
      <p>
        If you have a complaint about a reservation, please raise it through{" "}
        <a href="/support">Support</a> within 7 days of the reservation date so we have enough
        context to help. Keep any photos, receipts, or chat messages related to the issue.
      </p>

      <h2>5. Force majeure</h2>
      <p>
        Neither BookMe nor any shop is responsible for cancellations caused by events outside
        reasonable control, including natural disasters, government orders, public-health
        emergencies, or major outages of telecommunications or power infrastructure.
      </p>

      <h2>6. Changes to this policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be announced in the
        app or by email at least 14 days before they take effect.
      </p>

      <h2>7. Contact</h2>
      <p>
        Questions about a specific booking are best raised through{" "}
        <a href="/support">Support</a>. General questions about this policy can be sent to{" "}
        <strong>[support@bookme.example]</strong>.
      </p>
    </>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — BookMe",
  description:
    "How BookMe collects, uses, and protects personal information of customers and shop owners.",
};

/**
 * NOTE: This document is a working draft intended to be reviewed by counsel
 * before public launch. Fill in the bracketed placeholders ([Legal entity
 * name], [Registered address], [DPO contact]) once the business permit and
 * NPC registration are issued. Update the "Last updated" date whenever the
 * substance changes.
 */
export default function PrivacyPolicyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-slate-500">Last updated: 31 May 2026</p>

      <p>
        BookMe (&ldquo;BookMe,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates a service
        reservation platform that connects customers with local shops in the Philippines. This
        Privacy Policy explains what personal information we collect, why we collect it, how we use
        and share it, and the rights you have under the Philippine Data Privacy Act of 2012
        (Republic Act No. 10173, the &ldquo;DPA&rdquo;) and its implementing rules and regulations.
      </p>

      <p>
        By creating an account or otherwise using BookMe, you confirm that you have read and
        understood this Privacy Policy.
      </p>

      <h2>1. Who we are</h2>
      <p>
        The platform is operated by <strong>[Legal entity name]</strong>, with registered office at{" "}
        <strong>[Registered address]</strong>. For privacy-related questions you may contact our
        Data Protection Officer at <strong>[dpo@bookme.example]</strong>.
      </p>

      <h2>2. Information we collect</h2>

      <h3>2.1 Information you provide</h3>
      <ul>
        <li>
          <strong>Account details</strong> — name, email address, mobile number, password (stored
          hashed), profile photo, and role (customer or shop owner).
        </li>
        <li>
          <strong>Shop details</strong> (shop owners only) — shop name, description, address and
          coordinates, opening hours, services and pricing, staff names, photos.
        </li>
        <li>
          <strong>Booking details</strong> — the shop, service, date, time, party size, and any
          notes you include with a reservation.
        </li>
        <li>
          <strong>Support and chat content</strong> — messages you send through in-app chat or
          support tickets, including any attachments.
        </li>
        <li>
          <strong>Reviews and ratings</strong> — content you post about shops you have visited.
        </li>
      </ul>

      <h3>2.2 Information collected automatically</h3>
      <ul>
        <li>
          <strong>Device and log data</strong> — IP address, browser/user-agent, pages viewed, and
          timestamps, used for security, debugging, and abuse prevention.
        </li>
        <li>
          <strong>Approximate location</strong> — derived from IP, or precise location if you
          explicitly grant your browser the permission, used only to surface nearby shops. We do
          not store continuous location history.
        </li>
        <li>
          <strong>Cookies and similar technologies</strong> — session cookies for authentication
          and a small number of preference cookies. We do not currently use third-party advertising
          cookies.
        </li>
      </ul>

      <h3>2.3 Information from third parties</h3>
      <p>
        If a payment processor is enabled in the future (see Section 5), we may receive transaction
        confirmations and limited payer details from that processor. We do not store full card
        numbers.
      </p>

      <h2>3. How we use your information</h2>
      <ul>
        <li>To create and manage your account and authenticate you when you log in.</li>
        <li>
          To allow shops to fulfil your reservations, including showing the shop your name, contact
          number, and booking details.
        </li>
        <li>To send transactional messages — booking confirmations, reminders, status changes,
          password resets, and security notices — by email or in-app notification.</li>
        <li>To provide customer support and respond to your enquiries.</li>
        <li>To detect, investigate, and prevent fraud, abuse, and violations of our Terms.</li>
        <li>To improve the service, including aggregated analytics that do not identify you.</li>
        <li>To comply with legal, tax, accounting, and regulatory obligations.</li>
      </ul>

      <h2>4. Legal bases for processing</h2>
      <p>Under the DPA we rely on one or more of the following bases:</p>
      <ul>
        <li>
          <strong>Contract</strong> — to perform the reservation service you have requested.
        </li>
        <li>
          <strong>Consent</strong> — for optional features such as marketing emails or precise
          location, which you may withdraw at any time.
        </li>
        <li>
          <strong>Legitimate interests</strong> — to keep the platform secure, prevent fraud, and
          improve the product, provided your rights and freedoms do not override these interests.
        </li>
        <li>
          <strong>Legal obligation</strong> — to comply with applicable Philippine law and lawful
          requests from authorities.
        </li>
      </ul>

      <h2>5. Payments</h2>
      <p>
        At present, all reservations on BookMe are paid <strong>directly to the shop on arrival</strong>.
        We do not process payments through the platform and do not collect card details.
      </p>
      <p>
        In the future we plan to offer optional online payment through PayMongo, a licensed
        Philippine payment service provider. When that is enabled, your payment details will be
        provided directly to PayMongo and will be handled under PayMongo&rsquo;s privacy notice and
        applicable card-network rules. We will receive a transaction reference and status only.
      </p>

      <h2>6. How we share information</h2>
      <p>We do not sell personal information. We share information only as follows:</p>
      <ul>
        <li>
          <strong>With the shop you book with</strong> — your name, contact number, and booking
          details, so the shop can prepare for and contact you about the reservation.
        </li>
        <li>
          <strong>With service providers</strong> — including our cloud hosting and email delivery
          provider (Amazon Web Services, including SES), under contracts that require them to
          protect your information and process it only on our instructions.
        </li>
        <li>
          <strong>With payment processors</strong> — once online payments are enabled, with
          PayMongo as described above.
        </li>
        <li>
          <strong>With authorities</strong> — when we are legally required to do so, or to protect
          the rights, property, or safety of users or the public.
        </li>
        <li>
          <strong>In a corporate transaction</strong> — if BookMe is involved in a merger,
          acquisition, or sale of assets, information may be transferred subject to the same
          protections set out here.
        </li>
      </ul>

      <h2>7. International transfers</h2>
      <p>
        Our infrastructure runs in the AWS Asia Pacific (Singapore) region. Limited operational
        data (for example, system logs and support correspondence) may be accessed from other
        countries by our service providers. Where personal information is transferred outside the
        Philippines we take steps required by the DPA to ensure a comparable level of protection.
      </p>

      <h2>8. How long we keep information</h2>
      <ul>
        <li>Account data is kept while your account is active and for up to 24 months after
          deletion or prolonged inactivity, to handle disputes and meet regulatory obligations.</li>
        <li>Booking records are retained for at least 10 years where required by Philippine tax
          and accounting law.</li>
        <li>Support tickets and chat messages are retained for up to 24 months.</li>
        <li>Backups are overwritten on a rolling schedule, typically within 35 days.</li>
      </ul>

      <h2>9. Your rights under the DPA</h2>
      <p>Subject to the limits of the law, you have the right to:</p>
      <ul>
        <li>be informed of the processing of your personal data;</li>
        <li>access your personal data and obtain a reasonable copy;</li>
        <li>request correction of inaccurate or incomplete data;</li>
        <li>object to processing or withdraw consent where consent is the basis;</li>
        <li>request erasure or blocking of data that is unlawful, unnecessary, or outdated;</li>
        <li>request data portability in a structured, commonly-used electronic format;</li>
        <li>be indemnified for damages caused by inaccurate or unlawful processing; and</li>
        <li>lodge a complaint with the National Privacy Commission (https://privacy.gov.ph).</li>
      </ul>
      <p>
        To exercise any of these rights, email <strong>[dpo@bookme.example]</strong>. We may need
        to verify your identity before acting on the request.
      </p>

      <h2>10. Security</h2>
      <p>
        We use industry-standard technical and organisational measures to protect personal
        information, including TLS encryption in transit, encrypted backups, hashed passwords,
        role-based access control, and audit logging of administrative actions. No system is
        perfectly secure; if you believe your account has been compromised, contact us
        immediately.
      </p>

      <h2>11. Children</h2>
      <p>
        BookMe is not directed at children under 18. We do not knowingly collect personal
        information from children. If you believe a child has provided us with personal
        information, please contact us so we can delete it.
      </p>

      <h2>12. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. Material changes will be announced
        in the app or by email at least 14 days before they take effect. The &ldquo;Last
        updated&rdquo; date at the top reflects the latest version.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions, requests, or complaints about this policy can be sent to{" "}
        <strong>[support@bookme.example]</strong> or, for privacy-specific matters, to our Data
        Protection Officer at <strong>[dpo@bookme.example]</strong>.
      </p>
    </>
  );
}

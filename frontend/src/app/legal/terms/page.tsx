import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — BookMe",
  description:
    "The agreement between you and BookMe for using the reservation platform as a customer or shop owner.",
};

/**
 * NOTE: Working draft — review with counsel before launch. Fill in bracketed
 * placeholders ([Legal entity name], [Registered address]) once the business
 * permit is issued. Update the "Last updated" date when substance changes.
 */
export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-sm text-slate-500">Last updated: 31 May 2026</p>

      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the BookMe reservation
        platform (the &ldquo;Service&rdquo;), operated by <strong>[Legal entity name]</strong> with
        registered office at <strong>[Registered address]</strong> (&ldquo;BookMe,&rdquo;
        &ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account or using the Service you agree
        to these Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        BookMe is a marketplace that allows customers to discover and reserve services from
        independent shops (&ldquo;Shops&rdquo;) in the Philippines, and allows Shops to publish and
        manage their services and bookings. <strong>BookMe is not a party to the contract between
        a customer and a Shop.</strong> The Shop is solely responsible for the quality, safety,
        and performance of the service it provides.
      </p>

      <h2>2. Eligibility and accounts</h2>
      <ul>
        <li>You must be at least 18 years old to create an account.</li>
        <li>You agree to provide accurate, current, and complete information and to keep it up
          to date.</li>
        <li>You are responsible for keeping your password confidential and for all activity that
          occurs under your account.</li>
        <li>You must notify us promptly of any unauthorised use of your account.</li>
      </ul>

      <h2>3. Customer terms</h2>

      <h3>3.1 Making a reservation</h3>
      <p>
        When you place a booking, you are making an offer to the Shop. The reservation is
        confirmed once the Shop accepts it (or automatically if the Shop has enabled auto-accept).
        A confirmation email and an entry in your <a href="/reservations">My Reservations</a> page
        will indicate the current status.
      </p>

      <h3>3.2 Payment</h3>
      <p>
        Unless stated otherwise on a specific booking, payment is made <strong>directly to the
        Shop at the time of service</strong> (&ldquo;pay-on-arrival&rdquo;). Pricing shown on the
        Service is set by the Shop and may include taxes; the final amount payable is the amount
        the Shop charges on the day. Online payment through PayMongo will be introduced as an
        optional method once enabled, subject to additional terms presented at checkout.
      </p>

      <h3>3.3 Cancellations, no-shows, and refunds</h3>
      <p>
        Cancellation and refund rules are set out in our{" "}
        <a href="/legal/refund">Refund &amp; Cancellation Policy</a>, which forms part of these
        Terms.
      </p>

      <h3>3.4 Reviews</h3>
      <p>
        You may post a review of a Shop you have actually visited. Reviews must be honest, your
        own, and free of unlawful, defamatory, harassing, discriminatory, or sexually explicit
        content. We may remove reviews that violate these Terms.
      </p>

      <h2>4. Shop owner terms</h2>

      <h3>4.1 Listing your shop</h3>
      <ul>
        <li>You confirm that you are authorised to list the Shop and to offer the services
          advertised.</li>
        <li>You must hold all licences, permits, and insurance required by Philippine law to
          operate your business.</li>
        <li>Listings must be accurate. Prices, services, opening hours, and availability shown on
          BookMe must match what you actually deliver.</li>
      </ul>

      <h3>4.2 Fulfilling bookings</h3>
      <ul>
        <li>You agree to honour confirmed reservations on time and at the price quoted.</li>
        <li>You must not contact customers obtained through BookMe for purposes unrelated to
          fulfilling their booking, or attempt to circumvent the platform for commission-bearing
          bookings.</li>
        <li>You are solely responsible for the service provided, for issuing official receipts
          where required, and for resolving customer complaints relating to the service.</li>
      </ul>

      <h3>4.3 Commission</h3>
      <p>
        BookMe charges a commission on completed reservations paid online through the platform
        (currently 10%, indicative and subject to change with notice). Walk-ins and pay-on-arrival
        bookings are not commissioned in the current version of the platform. Commission rates
        and billing terms applicable to your Shop are shown on your{" "}
        <a href="/owner/billing">Billing</a> page and may be updated from time to time with
        reasonable notice.
      </p>

      <h3>4.4 Taxes</h3>
      <p>
        You are responsible for determining, collecting, reporting, and remitting all taxes due on
        your services. BookMe does not provide tax advice.
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>use the Service for any unlawful purpose or in violation of these Terms;</li>
        <li>impersonate any person or misrepresent your affiliation;</li>
        <li>upload viruses, malware, or content you do not have the right to share;</li>
        <li>scrape, crawl, or copy the Service except where expressly permitted;</li>
        <li>interfere with the operation or security of the Service, or attempt to gain
          unauthorised access;</li>
        <li>use the Service to send unsolicited communications or to harass other users.</li>
      </ul>

      <h2>6. Content you submit</h2>
      <p>
        You retain ownership of content you submit (shop photos, reviews, messages). You grant
        BookMe a worldwide, royalty-free, non-exclusive licence to host, store, reproduce,
        adapt, and display that content solely to operate, promote, and improve the Service. You
        confirm you have all rights necessary to grant this licence.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        The Service, including its software, design, logos, and branding, is owned by BookMe or
        its licensors and is protected by Philippine and international intellectual property
        laws. You may not use BookMe&rsquo;s name or logo without our prior written permission.
      </p>

      <h2>8. Suspension and termination</h2>
      <p>
        We may suspend or terminate your access to the Service, with or without notice, if you
        breach these Terms, if your account is involved in fraud or abuse, or if we are required
        to do so by law. You may close your account at any time from your profile page.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To
        the maximum extent permitted by law, BookMe disclaims all warranties, express or implied,
        including warranties of merchantability, fitness for a particular purpose, and
        non-infringement. We do not warrant that the Service will be uninterrupted, error-free,
        or that any defects will be corrected. We do not warrant the quality, safety, or legality
        of services provided by Shops.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, BookMe shall not be liable for any indirect,
        incidental, special, consequential, or punitive damages, or for any loss of profits,
        revenues, data, or goodwill, arising out of or in connection with your use of the
        Service. Our aggregate liability for any claim arising under these Terms shall not
        exceed the greater of (a) the commission BookMe received from you (for Shops) or the
        amount you paid to BookMe (for customers) in the 12 months preceding the claim, or (b)
        PHP 5,000.
      </p>

      <h2>11. Indemnity</h2>
      <p>
        You agree to indemnify and hold BookMe and its officers, employees, and agents harmless
        from any claim, loss, or expense (including reasonable legal fees) arising from your use
        of the Service, your content, or your breach of these Terms.
      </p>

      <h2>12. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of the Republic of the Philippines. Any dispute
        arising out of or in connection with these Terms shall be brought exclusively before the
        competent courts of <strong>[City of registered office]</strong>, Philippines, without
        prejudice to mandatory consumer protections that may give you the right to bring an
        action in your place of residence.
      </p>

      <h2>13. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be announced in the
        app or by email at least 14 days before they take effect. Continued use of the Service
        after the effective date constitutes acceptance of the updated Terms.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these Terms can be sent to <strong>[support@bookme.example]</strong> or
        through the in-app <a href="/support">Support</a> page.
      </p>
    </>
  );
}

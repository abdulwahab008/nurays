import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, ContactUs, Operator } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service | Nuray',
  description: 'The terms for buying from, selling on and delivering with Nuray.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="24 October 2026">
      <p>
        These terms are an agreement between you and <Operator /> (&quot;Nuray&quot;, &quot;we&quot;). Nuray is an online
        marketplace in Pakistan: it connects people who order home-cooked food (&quot;customers&quot;) with independent home
        kitchens (&quot;sellers&quot;) in their community, and with delivery riders. By creating an account or placing an
        order you agree to these terms, the <Link href="/privacy" className="underline">Privacy Policy</Link> and the{' '}
        <Link href="/refund-policy" className="underline">Refund &amp; Cancellation Policy</Link>. Agreeing online is as
        valid as signing on paper (Electronic Transactions Ordinance, 2002).
      </p>

      <h2>1. Who sells the food</h2>
      <p>
        Each kitchen is an independent business that prepares, prices and sells its own food. The kitchen is responsible
        for that food: its preparation, hygiene, ingredients and allergen information, and for any registration or licence
        its provincial food authority requires (for example the Punjab Food Authority or the Sindh Food Authority). Nuray
        checks sellers before approving them and may remove listings, but Nuray does not cook the food and cannot inspect
        every dish.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must be at least 18, or use Nuray with a parent or guardian.</li>
        <li>Give accurate details and keep your password and one-time codes private. You are responsible for what is done with your account.</li>
        <li>We may verify your e-mail address and phone number, and may suspend accounts used for fraud, abuse or breaches of these terms.</li>
        <li>Sellers and riders are approved by Nuray before they can sell or deliver, and must keep their documents (such as CNIC and licences) up to date.</li>
      </ul>

      <h2>3. Orders</h2>
      <ul>
        <li>An order is from one kitchen. Prices are in Pakistani rupees, and the price, delivery fee and any tax are shown before you confirm. The kitchen sets its prices and its delivery fee for your community.</li>
        <li>An order is accepted when the kitchen confirms it. If the kitchen does not confirm it in time, it is cancelled automatically and any payment is refunded.</li>
        <li>Each order has a 4-digit handover code shown only to you. Give it to whoever hands you the order (the rider, the kitchen or the pickup counter) only after you have received it; it confirms delivery.</li>
        <li>Delivery times are estimates, not promises.</li>
        <li>Cancellations and refunds follow the <Link href="/refund-policy" className="underline">Refund &amp; Cancellation Policy</Link>.</li>
      </ul>

      <h2>4. Payment</h2>
      <ul>
        <li><strong>Cash on delivery</strong>: you pay whoever hands over the order (a Nuray rider, or the kitchen if it delivers itself or you collect it).</li>
        <li><strong>Transfer to the kitchen</strong> (JazzCash, EasyPaisa or bank): you pay the kitchen&apos;s own account shown on your order and upload the receipt; the kitchen confirms it before preparing the order for handover. Only transfer to the account shown on the order page.</li>
        <li><strong>Online payment</strong> (card or mobile wallet through our payment provider) and <strong>Nuray Wallet</strong> balance: the payment is received by Nuray, which then pays the kitchen its share.</li>
        <li>An order not paid within the time shown may be cancelled automatically.</li>
      </ul>

      <h2>5. Sellers</h2>
      <ul>
        <li>Sellers must describe their food truthfully (including ingredients and allergens), keep stock and opening hours accurate, and only accept orders they can fulfil.</li>
        <li>Sellers must follow the food safety rules of their province and are responsible for their own taxes on what they earn.</li>
        <li>Nuray charges sellers the commission shown in their dashboard on each sale. On money the seller collects directly (cash or a transfer into their account) the seller owes Nuray that commission, Nuray&apos;s delivery fee where a Nuray rider delivered, tax collected, and any refund Nuray paid the customer; these are deducted from what Nuray owes the seller.</li>
        <li>Sellers who deliver themselves keep the delivery fee they charge and must complete handovers with the customer&apos;s code.</li>
        <li>Sellers may not order from their own kitchen or place orders to inflate sales, reviews or payouts.</li>
      </ul>

      <h2>6. Riders</h2>
      <p>
        Riders deliver the orders they choose to accept. They must hold a valid driving licence, follow traffic laws,
        complete each delivery with the customer&apos;s handover code, and hand over cash collected for Nuray as instructed.
      </p>

      <h2>7. Reviews and content</h2>
      <p>
        Reviews must be honest and about a real order. You keep ownership of photos and text you upload, and allow Nuray to
        show them on the service. We may remove content that is unlawful, misleading or abusive.
      </p>

      <h2>8. Acceptable use</h2>
      <p>
        Do not misuse the service: no fraud, fake orders or reviews, attempts to get into other people&apos;s accounts or
        data, automated scraping, or interference with the service. Some of these are offences under the Prevention of
        Electronic Crimes Act, 2016, and we may report them to the authorities.
      </p>

      <h2>9. Liability</h2>
      <p>
        We work to keep Nuray running and accurate, but we cannot promise it will always be available or free of errors.
        To the extent the law allows, Nuray is not liable for the food itself (which is the seller&apos;s responsibility) or
        for indirect losses. Nothing in these terms takes away rights you have under the consumer protection law of your
        province (for example the Punjab Consumer Protection Act, 2005, the Sindh Consumer Protection Act, 2014, or the
        Islamabad Consumer Protection Act, 1995).
      </p>

      <h2>10. Complaints and disputes</h2>
      <p>
        If something goes wrong, contact us first through <ContactUs />, and we will try to put it right. These terms are
        governed by the laws of Pakistan, and disputes are for the courts and consumer courts of Pakistan that have
        jurisdiction.
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these terms; the date above shows the latest version, and important changes will be announced in the
        app before they apply.
      </p>
    </LegalPage>
  );
}

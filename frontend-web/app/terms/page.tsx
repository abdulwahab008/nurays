import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LEGAL } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Service | Nuray',
  description: 'The terms for buying from, selling on and delivering with Nuray.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="2 October 2026">
      <p>
        Nuray is operated by {LEGAL.company} ({LEGAL.address}) (&quot;Nuray&quot;, &quot;we&quot;). Nuray is a marketplace:
        it connects people who order food (&quot;customers&quot;) with independent home kitchens (&quot;sellers&quot;) in their
        community, and with delivery riders. By creating an account or placing an order you agree to these terms, the{' '}
        <Link href="/privacy" className="underline">Privacy Policy</Link> and the{' '}
        <Link href="/refund-policy" className="underline">Refund &amp; Cancellation Policy</Link>.
      </p>

      <h2>1. Who sells the food</h2>
      <p>
        Each kitchen is an independent business that prepares, prices and sells its own food. The kitchen is responsible
        for the food it sells: its preparation, hygiene, ingredients and allergen information, and for holding any licence
        or registration the law requires. Nuray checks sellers before approving them and reviews listings, but does not
        cook, inspect every dish or guarantee it.
      </p>

      <h2>2. Accounts</h2>
      <ul>
        <li>You must give accurate details and keep your password and one-time codes private. You are responsible for activity on your account.</li>
        <li>We may verify your email address and phone number, and may suspend accounts used for fraud, abuse or breaches of these terms.</li>
        <li>Sellers and riders are approved by Nuray before they can sell or deliver, and must keep their documents up to date.</li>
      </ul>

      <h2>3. Orders</h2>
      <ul>
        <li>An order is from one kitchen. Prices, delivery fees and tax are shown before you confirm. The kitchen sets its prices and its delivery fee for your community.</li>
        <li>An order is accepted when the kitchen confirms it. If the kitchen does not confirm it in time, it is cancelled automatically and any payment is refunded.</li>
        <li>Each order has a 4-digit handover code shown only to you. Give it to whoever hands you the order (the rider, the kitchen or the pickup counter) only after you have received it; it confirms delivery.</li>
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
        <li>Nuray charges sellers the commission shown in their dashboard on each sale. On money the seller collects directly (cash or a transfer into their account) the seller owes Nuray that commission, Nuray&apos;s delivery fee where a Nuray rider delivered, tax collected, and any refund Nuray paid the customer; these are deducted from what Nuray owes the seller.</li>
        <li>Sellers who deliver themselves keep the delivery fee they charge and must complete handovers with the customer&apos;s code.</li>
        <li>Sellers may not order from their own kitchen or place orders to inflate sales, reviews or payouts.</li>
      </ul>

      <h2>6. Riders</h2>
      <p>
        Riders deliver orders they choose to accept, must complete each delivery with the customer&apos;s handover code, and
        must hand over cash collected on behalf of Nuray as instructed.
      </p>

      <h2>7. Reviews and content</h2>
      <p>
        Reviews must be honest and about a real order. You keep ownership of photos and text you upload, and give Nuray a
        licence to display them on the service. We may remove content that is unlawful, misleading or abusive.
      </p>

      <h2>8. Acceptable use</h2>
      <p>
        Do not misuse the service: no fraud, fake orders or reviews, attempts to access other people&apos;s accounts or
        data, automated scraping, or interference with the service.
      </p>

      <h2>9. Liability</h2>
      <p>
        Nuray provides the marketplace &quot;as is&quot;. To the extent the law allows, Nuray is not liable for the food
        itself (which is the seller&apos;s responsibility) or for indirect losses. Nothing in these terms limits rights you
        have under applicable consumer protection law.
      </p>

      <h2>10. Changes and contact</h2>
      <p>
        We may update these terms; the date above shows the latest version, and material changes will be announced in the
        app. These terms are governed by the laws of Pakistan. Questions: {LEGAL.email} or the{' '}
        <Link href="/support" className="underline">support page</Link>.
      </p>
    </LegalPage>
  );
}

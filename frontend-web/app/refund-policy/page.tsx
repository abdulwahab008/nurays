import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LEGAL } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy | Nuray',
  description: 'When orders can be cancelled and how refunds are paid on Nuray.',
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy" updated="2 October 2026">
      <h2>Cancelling an order</h2>
      <ul>
        <li><strong>You</strong> can cancel an order yourself until the kitchen accepts it, from the order page.</li>
        <li>After the kitchen accepts it, the food is being prepared; contact support through the order page if something is wrong, and we will work it out with the kitchen.</li>
        <li><strong>The kitchen</strong> may reject an order (for example if an item has run out), or cancel individual items. You are refunded for what was cancelled.</li>
        <li>An order is <strong>cancelled automatically</strong> if the kitchen does not accept it in time, or if an online or transfer payment is not completed in time.</li>
      </ul>

      <h2>When you get money back</h2>
      <ul>
        <li>A cancelled order that you had paid for is refunded in full.</li>
        <li>If only some items are cancelled, you are refunded for those items (including their share of tax and any discount), and for the delivery fee if nothing is left to deliver.</li>
        <li>If an order was not delivered (a failed delivery that is not retried), or what arrived was wrong, damaged or unsafe, contact support with photos within 24 hours of delivery; refunds in these cases are decided case by case.</li>
        <li>Cash-on-delivery orders that are cancelled before delivery have nothing to refund.</li>
      </ul>

      <h2>How refunds are paid</h2>
      <ul>
        <li><strong>Paid with Nuray Wallet</strong>: refunded to your wallet straight away.</li>
        <li><strong>Paid online or by transfer</strong>: refunded by transfer to you, normally within 3 to 7 working days. If you reported a transfer that the kitchen never received, we check before refunding.</li>
      </ul>

      <h2>Questions</h2>
      <p>
        Use the <Link href="/support" className="underline">support page</Link> or write to {LEGAL.email}. Rights you have under
        consumer protection law are not affected by this policy.
      </p>
    </LegalPage>
  );
}

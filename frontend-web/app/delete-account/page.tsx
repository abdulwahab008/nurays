import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, LEGAL } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Delete your account | Nuray',
  description: 'How to delete your Nuray account and what happens to your data.',
};

/** The public page the app stores link to: how an account is deleted and what is kept. */
export default function DeleteAccountPage() {
  return (
    <LegalPage title="Delete your account" updated="9 October 2026">
      <p>You can close your Nuray account yourself, from inside the app, at any time.</p>

      <h2>How to delete your account</h2>
      <ol>
        <li>Sign in and open <Link href="/profile" className="underline">your profile</Link>.</li>
        <li>Scroll to <strong>Danger zone</strong> and tap <strong>Delete account</strong>.</li>
        <li>Type <strong>DELETE</strong> to confirm, and enter your password if your account has one.</li>
      </ol>
      <p>
        The account is closed immediately and you are signed out everywhere. If you cannot sign in, email{' '}
        <a href={`mailto:${LEGAL.email}`} className="underline">{LEGAL.email}</a> from the address on the account, or use the{' '}
        <Link href="/support" className="underline">support page</Link>, and we will close it for you.
      </p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your name, photo, email address, phone number and password.</li>
        <li>Saved delivery addresses and map pins, your cart, favourites and notification subscriptions.</li>
        <li>Identity documents uploaded for a kitchen or rider application.</li>
      </ul>

      <h2>What is kept, and why</h2>
      <p>
        Orders, payments, refunds, payouts and the accounting ledger are kept for the period the law requires (tax and
        consumer-protection rules), as described in the <Link href="/privacy" className="underline">Privacy Policy</Link>.
        They no longer carry your name or contact details. Reviews you wrote stay on the kitchens&apos; pages without your name.
      </p>

      <h2>Before you delete</h2>
      <p>
        An account cannot be closed while an order is still on its way, while there is money in your Nuray wallet, or, for
        riders and kitchens, while cash, pay or a payout is still to be settled. Finish or cancel the order, and contact
        support to settle any balance, then try again.
      </p>
    </LegalPage>
  );
}

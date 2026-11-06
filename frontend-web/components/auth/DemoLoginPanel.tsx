'use client';

// The one-click demo accounts: a development aid with a shared password. The sign-in page loads this file only in a build
// that switches them on (NEXT_PUBLIC_DEMO_LOGIN, set in next.config.ts). In any other build that condition is a constant
// false, the require is dropped, and none of these e-mail addresses or the password reach a visitor's browser.
// The accounts are created by backend/scripts/seed-ideal-flow-users.ts (npm run seed:demo in backend/).
import { useState } from 'react';
import Link from 'next/link';
import { Layers } from 'lucide-react';

interface DemoAccount {
  id: string;
  role: string;
  name: string;
  email: string;
  /** Where to land instead of the role's usual home (an applicant's page), if anywhere. */
  target?: string;
}

const DEMO_PASSWORD = 'Password123!';

const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: 'customer', role: 'Customer', name: 'Ayesha Khan', email: 'customer@nuray.test' },
  { id: 'seller', role: 'Kitchen', name: "Saima Baig's Kitchen", email: 'seller@nuray.test' },
  { id: 'seller-pending', role: 'Kitchen under review', name: 'Ahmed Tikka & Karahi', email: 'seller.pending@nuray.test', target: '/sellers/register' },
  { id: 'seller-rejected', role: 'Kitchen to fix and resend', name: 'Bilal Shawarma', email: 'seller.rejected@nuray.test', target: '/sellers/register' },
  { id: 'rider', role: 'Rider', name: 'Imran Ali', email: 'rider@nuray.test' },
  { id: 'admin', role: 'Admin', name: 'Nuray admin', email: 'admin@frozennuray.com' },
];

export function DemoDevLink() {
  return (
    <Link
      href="/dev-login"
      className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl border border-line text-sm font-medium text-muted hover:text-ink hover:bg-raised"
    >
      <Layers className="w-4 h-4" aria-hidden="true" />
      <span>Several roles at once</span>
    </Link>
  );
}

export function DemoPasswordHint() {
  return <span className="text-xs text-muted">Demo password: {DEMO_PASSWORD}</span>;
}

/**
 * Development only: sign in as a demo account in one tap, through the page's own sign-in (so an admin still gets the
 * two-step check). `onFill` only puts the account into the form.
 */
export function DemoLoginPanel({
  onSignIn,
  onFill,
  busy,
}: {
  onSignIn: (email: string, password: string, target?: string) => Promise<void>;
  onFill: (email: string, password: string) => void;
  busy: boolean;
}) {
  const [signingIn, setSigningIn] = useState<string | null>(null);

  const signIn = async (acc: DemoAccount) => {
    setSigningIn(acc.id);
    try {
      await onSignIn(acc.email, DEMO_PASSWORD, acc.target);
    } finally {
      setSigningIn(null);
    }
  };

  return (
    <section aria-labelledby="demo-title" className="lg:col-span-7 rounded-[20px] border border-dashed border-line-strong p-5 sm:p-6">
      <h2 id="demo-title" className="text-sm font-semibold text-ink">Demo accounts</h2>
      <p className="text-sm text-muted mt-1">Development only. Every account uses the password {DEMO_PASSWORD}.</p>
      <ul className="mt-4 divide-y divide-line">
        {DEMO_ACCOUNTS.map((acc) => (
          <li key={acc.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-ink">{acc.role}</p>
              <p className="text-sm text-muted truncate">
                {acc.name}, <span data-ltr>{acc.email}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => onFill(acc.email, DEMO_PASSWORD)}
              className="min-h-11 px-3 rounded-xl text-sm font-medium text-muted hover:text-ink hover:bg-raised"
            >
              Fill
            </button>
            <button
              type="button"
              onClick={() => void signIn(acc)}
              disabled={busy || signingIn !== null}
              aria-label={`Sign in as ${acc.role}`}
              className="min-h-11 min-w-[5.5rem] px-4 rounded-xl text-sm font-semibold bg-brand text-on-brand hover:bg-brand-500 disabled:opacity-50"
            >
              {signingIn === acc.id ? 'Signing in…' : 'Sign in'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

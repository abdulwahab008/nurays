import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Company details for the legal pages. Set these at build time; until they are set
 * the pages show visible placeholders so nobody mistakes them for final text.
 */
export const LEGAL = {
  company: process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME || '[Company legal name]',
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || '[Registered address]',
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '[support email]',
  reviewed: process.env.NEXT_PUBLIC_LEGAL_REVIEWED === 'true',
};

/** Whether a support e-mail address has been configured (until then the pages show a bracketed placeholder). */
export const supportEmailIsSet = !LEGAL.email.startsWith('[');

/**
 * The page frame for the public text pages. `legalText` is true for the terms, the privacy and refund policies and
 * the like, which carry the draft notice until a lawyer has reviewed them; the help page is not a legal text.
 */
export function LegalPage({ title, updated, children, legalText = true }: { title: string; updated: string; children: ReactNode; legalText?: boolean }) {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10">
        <Link href="/" className="text-sm text-slate-500 hover:underline">← Nuray</Link>
        <h1 className="mt-4 text-2xl sm:text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated: {updated}</p>
        {legalText && !LEGAL.reviewed && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Draft: this text describes how Nuray works today and must be reviewed by a qualified lawyer (and the
            placeholders in brackets filled in) before launch.
          </p>
        )}
        <div className="mt-6 space-y-6 text-[15px] leading-7 text-slate-700 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mt-8 [&_ul]:list-disc [&_ul]:ps-6 [&_ul]:space-y-1">
          {children}
        </div>
        <nav className="mt-10 pt-6 border-t border-slate-100 flex flex-wrap gap-4 text-sm text-slate-600">
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/refund-policy" className="hover:underline">Refund &amp; Cancellation Policy</Link>
          <Link href="/help" className="hover:underline">Help &amp; contact</Link>
        </nav>
      </article>
    </div>
  );
}

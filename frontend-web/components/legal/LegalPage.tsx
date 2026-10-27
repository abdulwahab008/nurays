import Link from 'next/link';
import type { ReactNode } from 'react';

const setting = (value: string | undefined) => value?.trim() || null;

/**
 * Who runs Nuray, for the legal pages, set at build time. Each one is optional: a sole trader may have no company
 * name or published address yet, and the pages then leave that detail out (never a bracketed placeholder). Without a
 * support e-mail the pages point to the support page instead.
 */
export const LEGAL = {
  company: setting(process.env.NEXT_PUBLIC_LEGAL_COMPANY_NAME),
  address: setting(process.env.NEXT_PUBLIC_LEGAL_ADDRESS),
  email: setting(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
  reviewed: process.env.NEXT_PUBLIC_LEGAL_REVIEWED === 'true',
};

/** Whether a support e-mail address has been configured. */
export const supportEmailIsSet = LEGAL.email != null;

/** "Nuray", or "Nuray, run by <company>, <address>" when those are set. */
export function Operator() {
  if (!LEGAL.company) return <>Nuray</>;
  return <>Nuray, run by {LEGAL.company}{LEGAL.address ? <> ({LEGAL.address})</> : null}</>;
}

/** How to reach us in a sentence: the support e-mail as a link and the support page, or the support page alone. */
export function ContactUs() {
  const page = <Link href="/support" className="underline">support page</Link>;
  if (!LEGAL.email) return <>the {page}</>;
  return <><a href={`mailto:${LEGAL.email}`} className="underline">{LEGAL.email}</a> or the {page}</>;
}

/**
 * The page frame for the public text pages. `legalText` is true for the terms, the privacy and refund policies and
 * the like, which carry a notice until a lawyer has reviewed them (NEXT_PUBLIC_LEGAL_REVIEWED); the help page is not a legal text.
 */
export function LegalPage({ title, updated, children, legalText = true }: { title: string; updated: string; children: ReactNode; legalText?: boolean }) {
  return (
    <div className="min-h-screen bg-page py-8 sm:py-12 px-4">
      <article className="max-w-3xl mx-auto bg-surface rounded-[24px] border border-line p-6 sm:p-10">
        <Link href="/" className="text-sm font-bold text-brand-ink hover:underline">← Nuray</Link>
        <h1 className="mt-4 text-[28px] sm:text-[36px] leading-tight font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">Last updated: {updated}</p>
        {legalText && !LEGAL.reviewed && (
          <p className="mt-4 rounded-2xl bg-accent-soft p-3 text-sm text-accent-soft-ink">
            This text describes how Nuray works today. It has not yet been reviewed by a lawyer; if anything is
            unclear, contact us before you order.
          </p>
        )}
        <div className="mt-6 space-y-6 text-[15px] leading-7 text-ink [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-ink [&_h2]:mt-8 [&_ul]:list-disc [&_ul]:ps-6 [&_ul]:space-y-1">
          {children}
        </div>
        <nav className="mt-10 pt-6 border-t border-line flex flex-wrap gap-4 text-sm font-semibold text-brand-ink">
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/refund-policy" className="hover:underline">Refund &amp; Cancellation Policy</Link>
          <Link href="/help" className="hover:underline">Help &amp; contact</Link>
        </nav>
      </article>
    </div>
  );
}

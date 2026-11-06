'use client';

import { useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { BrandLockup } from '@/components/ui/Mark';

/**
 * The shared frame of the account pages (sign in, sign up, password reset, email verification). They open most often
 * inside the store apps' edge-to-edge web view, so the padding keeps clear of the notch and the home bar.
 */
export const authShell =
  'min-h-dvh bg-page px-5 pt-[calc(2rem+var(--safe-top))] pb-[calc(2.5rem+var(--safe-bottom))] sm:flex sm:items-center sm:justify-center sm:px-6 sm:pt-[calc(3rem+var(--safe-top))] sm:pb-[calc(3rem+var(--safe-bottom))]';
export const authColumn =
  'mx-auto w-full max-w-sm sm:max-w-md sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:p-10 sm:shadow-[var(--shadow-card)]';
export const authHeading = 'text-2xl font-bold leading-tight tracking-tight text-ink';
export const authLede = 'mt-2 text-[15px] leading-relaxed text-muted';
export const authLabel = 'mb-1.5 block text-sm font-medium text-ink';
export const authHelper = 'mt-1.5 text-[13px] leading-snug text-muted';
export const authFieldError = 'mt-1.5 text-[13px] leading-snug text-red-700';
export const authLink =
  'rounded font-semibold text-brand-ink underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40';
/**
 * .nuray-input is plain (unlayered) CSS, so it beats Tailwind's utilities: the error colours need `!` to show. Red-600 in
 * light; in the dark theme the same salmon the site uses for red text.
 */
export const authInput =
  'nuray-input aria-invalid:border-red-600! aria-invalid:focus:shadow-[0_0_0_3px_rgb(220_38_38/0.18)]! [:root[data-theme=dark]_&]:aria-invalid:border-[#FFB4AC]!';
export const authSubmit = 'w-full h-12 min-h-12 text-[15px] font-bold';
/** A link that goes somewhere but looks like the main button (a <button> inside a link is not valid HTML). */
export const authLinkButton =
  'inline-flex h-12 w-full items-center justify-center rounded-xl bg-brand px-6 text-[15px] font-bold tracking-tight text-on-brand transition-colors hover:bg-brand-500 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40';

export function AuthLogo() {
  return (
    <Link href="/" className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40">
      <BrandLockup markSize={28} wordSize={20} />
    </Link>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-muted">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

/** One option of a segmented control (sign-in method, account type). */
export const authSegment = (active: boolean) =>
  `min-h-11 rounded-[10px] px-1 text-[13px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 sm:text-sm ${
    active ? 'bg-surface text-ink shadow-xs ring-1 ring-line-strong' : 'text-muted hover:text-ink'
  }`;

/**
 * iOS's "next" key only relabels Return: pressed, it still submits the form. This moves to the next field instead.
 * Composition is skipped so an Urdu keyboard's Return can still confirm a word.
 */
export const focusNextOnEnter = (nextId: string) => ({
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    document.getElementById(nextId)?.focus();
  },
});

/**
 * Google, and Apple inside the store app, under a quiet "or". The app's own buttons render nothing when the phone has no
 * provider set up; the separator then hides with them.
 */
export function AuthSocial({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-6 has-[[data-social]:empty]:hidden">
      <OrDivider label={label} />
      <div data-social className="mt-6">
        {children}
      </div>
    </div>
  );
}

/** A password field with a Show / Hide button inside its end edge. */
export function PasswordInput({
  showLabel,
  hideLabel,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; showLabel: string; hideLabel: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={`${authInput} pe-[4.5rem] ${className}`}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-controls={props.id}
        className="absolute inset-y-0 end-0 flex min-w-11 items-center justify-center rounded-e-xl px-4 text-sm font-semibold text-brand-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
      >
        {shown ? hideLabel : showLabel}
      </button>
    </div>
  );
}

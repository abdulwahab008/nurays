'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { reportClientError } from '@/lib/error-reporting';

/** A page crashed: report it and offer a way back instead of a blank screen. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, { boundary: 'route', digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-surface border border-line rounded-[24px] p-8 sm:p-10">
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-ink">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-muted">
          It has been reported. You can try again, or go back to the home page.
        </p>
        {error.digest && <p className="mt-3 text-xs text-muted">Reference: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center h-11 px-5 rounded-xl bg-brand text-on-brand text-sm font-extrabold hover:bg-brand-500"
          >
            Try again
          </button>
          <Link href="/" className="inline-flex items-center h-11 px-4 rounded-xl border border-line-strong text-sm font-bold text-ink hover:bg-raised">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

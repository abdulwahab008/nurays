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
      <div className="max-w-md w-full text-center bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-slate-600">
          It has been reported. You can try again, or go back to the home page.
        </p>
        {error.digest && <p className="mt-3 text-xs text-slate-400">Reference: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-xl bg-[#FF5500] text-white text-sm font-semibold hover:bg-[#e04400]"
          >
            Try again
          </button>
          <Link href="/" className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

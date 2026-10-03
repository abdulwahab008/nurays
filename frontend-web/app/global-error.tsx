'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/error-reporting';

/** The root layout itself failed: report it and render a minimal page of our own. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, { boundary: 'global', digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f8fafc', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 32 }}>
            <h1 style={{ fontSize: 20, margin: 0, color: '#0f172a' }}>Nuray ran into a problem</h1>
            <p style={{ color: '#475569', fontSize: 14 }}>It has been reported. Please try again.</p>
            {error.digest && <p style={{ color: '#94a3b8', fontSize: 12 }}>Reference: {error.digest}</p>}
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: 12, padding: '8px 16px', borderRadius: 12, border: 0, background: '#FF5500', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

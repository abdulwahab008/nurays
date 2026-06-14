import Link from 'next/link';
import { WifiOff } from 'lucide-react';

export const metadata = { title: "You're offline — Nuray" };

export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex items-center justify-center px-6" style={{ background: 'var(--bg-page)' }}>
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl mx-auto grid place-items-center" style={{ background: 'var(--accent-soft)' }}>
          <WifiOff className="w-8 h-8 text-brand-500" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-ink-900">You&apos;re offline</h1>
        <p className="mt-2 text-ink-500">
          We can&apos;t reach Nuray right now. Check your connection and try again.
        </p>
        <Link href="/" className="nuray-btn nuray-btn-primary mt-6">
          Try again
        </Link>
      </div>
    </div>
  );
}

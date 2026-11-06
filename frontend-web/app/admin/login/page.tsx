'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginUrlFor, safeNextPath } from '@/lib/auth-redirect';
import { useT } from '@/lib/i18n';
import { guardMessages } from '@/components/auth/guard-messages';

// Staff sign in on the one sign-in page (/login), which also runs their two-step check. This address is kept for old
// links and bookmarks: it goes there and brings the person back to the admin page they asked for.
export default function AdminLoginPage() {
  const router = useRouter();
  const t = useT(guardMessages);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = safeNextPath(params.get('next') ?? params.get('redirect')) ?? '/admin/dashboard';
    router.replace(loginUrlFor(next));
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-page" role="status">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand-ink" aria-hidden="true" />
        {t('loading')}
      </div>
    </div>
  );
}

'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useAuthInit } from '@/lib/hooks/use-auth-init';
import { loginUrlHere } from '@/lib/auth-redirect';
import { homeFor } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { guardMessages } from '@/components/auth/guard-messages';
import { useShallow } from 'zustand/react/shallow';

type Role = 'customer' | 'seller' | 'admin' | 'rider' | 'hub_manager';

interface RoleGuardProps {
  allowedRoles: Role[];
  /** Where to send unauthenticated users. */
  redirectUnauthenticated: string;
  /** Where to send users with the wrong role. Defaults to their own home (homeFor), with a short note. */
  redirectWrongRole?: string;
  /** Let signed-out visitors in (a guest's tray); only signed-in accounts of another role are sent away. */
  allowGuests?: boolean;
  children: ReactNode;
}

const FOR_ROLE: Record<Role, keyof (typeof guardMessages)['en']> = {
  customer: 'forCustomer',
  seller: 'forSeller',
  rider: 'forRider',
  admin: 'forAdmin',
  hub_manager: 'forHub',
};

/**
 * Client-side role gate. Renders children only after auth init is complete
 * AND the user is authenticated AND their role matches `allowedRoles`.
 * Until that's confirmed, shows a loading state — never the protected UI.
 *
 * NOTE: This is a defense-in-depth layer. Server-side checks on every API
 * route are the actual security boundary; this just prevents premature
 * rendering of admin/seller UI to wrong-role users.
 */
export function RoleGuard({
  allowedRoles,
  redirectUnauthenticated,
  redirectWrongRole,
  allowGuests = false,
  children,
}: RoleGuardProps) {
  const router = useRouter();
  const t = useT(guardMessages);
  const { showToast } = useToast();
  const { initialized } = useAuthInit();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));

  // Worked out from the current state on every render, so protected UI can never show on a stale decision.
  const role = user?.userType ?? user?.user_type;
  const decision: 'pending' | 'allow' | 'deny' = !initialized
    ? 'pending'
    : allowGuests && !isAuthenticated
      ? 'allow'
      : !isAuthenticated || !role || !allowedRoles.includes(role as Role)
      ? 'deny'
      : 'allow';
  const wrongRoleNote = t(FOR_ROLE[allowedRoles[0]]);

  // The redirect is the only side effect: a signed-out visitor goes to sign in, a signed-in one of the wrong role to
  // their own home with a note saying why.
  useEffect(() => {
    if (decision !== 'deny') return;
    if (!isAuthenticated) {
      // A signed-out visitor is sent to sign in and brought back to this page afterwards.
      router.replace(/^\/(admin\/)?login$/.test(redirectUnauthenticated) ? loginUrlHere(redirectUnauthenticated) : redirectUnauthenticated);
      return;
    }
    showToast(wrongRoleNote, 'info');
    router.replace(redirectWrongRole ?? homeFor(role));
  }, [decision, isAuthenticated, role, router, redirectUnauthenticated, redirectWrongRole, showToast, wrongRoleNote]);

  if (decision !== 'allow') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page" role="status">
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand-ink" aria-hidden="true" />
          {t('loading')}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

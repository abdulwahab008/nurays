'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useAuthInit } from '@/lib/hooks/use-auth-init';

interface RoleGuardProps {
  allowedRoles: Array<'customer' | 'seller' | 'admin'>;
  /** Where to send unauthenticated users. */
  redirectUnauthenticated: string;
  /** Where to send users with the wrong role. */
  redirectWrongRole: string;
  children: ReactNode;
}

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
  children,
}: RoleGuardProps) {
  const router = useRouter();
  const { initialized } = useAuthInit();
  const { isAuthenticated, user } = useAuthStore();
  const [decision, setDecision] = useState<'pending' | 'allow' | 'deny'>('pending');

  useEffect(() => {
    if (!initialized) return;

    if (!isAuthenticated) {
      setDecision('deny');
      router.replace(redirectUnauthenticated);
      return;
    }

    const role = user?.userType ?? user?.user_type;
    if (!role || !allowedRoles.includes(role as 'customer' | 'seller' | 'admin')) {
      setDecision('deny');
      router.replace(redirectWrongRole);
      return;
    }

    setDecision('allow');
  }, [initialized, isAuthenticated, user, allowedRoles, router, redirectUnauthenticated, redirectWrongRole]);

  if (decision !== 'allow') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

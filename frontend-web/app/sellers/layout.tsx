'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGuard } from '@/components/RoleGuard';

// /sellers/register is the public seller onboarding form — anyone can apply.
const PUBLIC_PATHS = new Set(['/sellers/register']);

export default function SellersLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname && PUBLIC_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  return (
    <RoleGuard
      allowedRoles={['seller']}
      redirectUnauthenticated="/login"
      redirectWrongRole="/dashboard"
    >
      {children}
    </RoleGuard>
  );
}

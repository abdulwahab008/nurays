'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGuard } from '@/components/RoleGuard';

const PUBLIC_PATHS = new Set(['/admin/login']);

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname && PUBLIC_PATHS.has(pathname)) {
    return <>{children}</>;
  }

  return (
    <RoleGuard
      allowedRoles={['admin']}
      redirectUnauthenticated="/admin/login"
      redirectWrongRole="/products"
    >
      {children}
    </RoleGuard>
  );
}

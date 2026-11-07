'use client';

import { ReactNode } from 'react';
import { RoleGuard } from '@/components/RoleGuard';

export default function RidersLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['rider']} redirectUnauthenticated="/login">
      {children}
    </RoleGuard>
  );
}

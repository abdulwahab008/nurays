'use client';

import { ReactNode } from 'react';
import { RoleGuard } from '@/components/RoleGuard';

export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['hub_manager']} redirectUnauthenticated="/login" redirectWrongRole="/products">
      {children}
    </RoleGuard>
  );
}

'use client';

import { ReactNode } from 'react';
import { RoleGuard } from '@/components/RoleGuard';

export default function HubLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['hub_manager']} redirectUnauthenticated="/login">
      {/* The hub console is written in English only, like the admin pages: it reads left to right in either language. */}
      <div dir="ltr" lang="en">{children}</div>
    </RoleGuard>
  );
}

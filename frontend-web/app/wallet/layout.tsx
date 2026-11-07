import { ReactNode } from 'react';
import { RoleGuard } from '@/components/RoleGuard';

// A customer's Nuray wallet. Kitchens, riders and staff are sent to their home.
export default function WalletLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['customer']} redirectUnauthenticated="/login">
      {children}
    </RoleGuard>
  );
}

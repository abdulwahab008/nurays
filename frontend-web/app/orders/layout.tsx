import { ReactNode } from 'react';
import { RoleGuard } from '@/components/RoleGuard';

// A customer's orders. Kitchens, riders and staff have their own order screens and are sent to their home.
export default function OrdersLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['customer']} redirectUnauthenticated="/login">
      {children}
    </RoleGuard>
  );
}

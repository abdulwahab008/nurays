import { ReactNode } from 'react';
import { RoleGuard } from '@/components/RoleGuard';

// Placing an order is for customers. Kitchens, riders and staff are sent to their home.
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['customer']} redirectUnauthenticated="/login">
      {children}
    </RoleGuard>
  );
}

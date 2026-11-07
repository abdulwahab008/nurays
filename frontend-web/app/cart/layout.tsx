import { ReactNode } from 'react';
import { RoleGuard } from '@/components/RoleGuard';

// The tray is open to guests (it is kept in the browser); signed-in kitchens, riders and staff are sent to their home.
export default function CartLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['customer']} redirectUnauthenticated="/login" allowGuests>
      {children}
    </RoleGuard>
  );
}

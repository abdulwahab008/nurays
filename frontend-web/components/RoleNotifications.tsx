'use client';

import dynamic from 'next/dynamic';
import { useAuthStore } from '@/lib/store/auth-store';

// Each role's live-notification component (socket listeners, chime, Urdu/English messages)
// is loaded only for a signed-in user of that role, not shipped to every visitor of every page.
const SellerNewOrderNotification = dynamic(
  () => import('@/components/SellerNewOrderNotification').then((m) => m.SellerNewOrderNotification),
  { ssr: false }
);
const RiderNewJobNotification = dynamic(
  () => import('@/components/RiderNewJobNotification').then((m) => m.RiderNewJobNotification),
  { ssr: false }
);
const CustomerOrderNotification = dynamic(
  () => import('@/components/CustomerOrderNotification').then((m) => m.CustomerOrderNotification),
  { ssr: false }
);

export function RoleNotifications() {
  const userType = useAuthStore((s) => s.user?.userType ?? s.user?.user_type);
  if (userType === 'seller') return <SellerNewOrderNotification />;
  if (userType === 'rider') return <RiderNewJobNotification />;
  if (userType === 'customer') return <CustomerOrderNotification />;
  return null;
}

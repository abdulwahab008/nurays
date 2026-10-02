'use client';

import { ReactNode, useState, useEffect } from 'react';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardNavbar } from './DashboardNavbar';

export interface SubItem {
  name: string;
  href: string;
  icon?: string;
  badge?: number;
}

export interface SidebarItem {
  name: string;
  href: string;
  icon: string;
  badge?: number;
  subItems?: SubItem[];
}

export const CUSTOMER_SIDEBAR_ITEMS: SidebarItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  {
    name: 'Kitchens & Menus',
    href: '/products',
    icon: 'kitchens',
    subItems: [
      { name: 'Dishes & Menus', href: '/products', icon: 'products' },
      { name: 'Verified Kitchens', href: '/kitchens', icon: 'kitchens' },
    ],
  },
  { name: 'Favorite Kitchens', href: '/favorites', icon: 'favorites' },
  { name: 'My Orders', href: '/orders', icon: 'orders' },
  { name: 'Nuray Wallet', href: '/wallet', icon: 'earnings' },
  { name: 'My Cart', href: '/cart', icon: 'cart' },
  { name: 'My Profile', href: '/profile', icon: 'profile' },
  { name: 'Saved Addresses', href: '/profile/addresses', icon: 'addresses' },
  { name: 'Help & Support', href: '/support', icon: 'support' },
];

export const RIDER_SIDEBAR_ITEMS: SidebarItem[] = [
  { name: 'Fleet Dashboard', href: '/riders/dashboard', icon: 'dashboard' },
  { name: 'Active Runs', href: '/riders/dashboard#active', icon: 'orders' },
  { name: 'Available Pool', href: '/riders/dashboard#available', icon: 'addresses' },
  { name: 'Cash in Hand', href: '/riders/dashboard#cash', icon: 'earnings' },
  { name: 'Help & Support', href: '/support', icon: 'support' },
];

export const SELLER_SIDEBAR_ITEMS: SidebarItem[] = [
  { name: 'Dashboard', href: '/sellers/dashboard', icon: 'dashboard' },
  { name: 'Orders', href: '/sellers/orders', icon: 'orders' },
  {
    name: 'Products',
    href: '/sellers/products',
    icon: 'products',
    subItems: [
      { name: 'All Products', href: '/sellers/products', icon: 'products' },
      { name: 'Inventory', href: '/sellers/products?view=inventory', icon: 'inventory' },
      { name: 'Discounts', href: '/sellers/promotions', icon: 'promotions' },
    ],
  },
  { name: 'Delivery', href: '/sellers/delivery', icon: 'delivery' },
  { name: 'Earnings', href: '/sellers/earnings', icon: 'earnings' },
  { name: 'Analytics', href: '/sellers/analytics', icon: 'analytics' },
  { name: 'Notifications', href: '/sellers/notifications', icon: 'notifications' },
  { name: 'Settings', href: '/sellers/settings', icon: 'settings' },
];

interface DashboardShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  sidebarItems: SidebarItem[];
  userType: 'customer' | 'seller' | 'admin' | 'rider';
}

export function DashboardShell({
  children,
  title,
  subtitle,
  sidebarItems,
  userType,
}: DashboardShellProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#0F172A]">
      <DashboardNavbar
        title={title}
        subtitle={subtitle}
        userType={userType}
        onMenuToggle={() => setOpen((v) => !v)}
        drawerOpen={open}
      />
      <div className="pt-16">
        <div
          onClick={() => setOpen(false)}
          aria-hidden={!open}
          className="lg:hidden fixed inset-0 z-40 transition-opacity duration-200"
          style={{
            background: 'rgba(15,23,42,0.6)',
            opacity: open ? 1 : 0,
            pointerEvents: open ? 'auto' : 'none',
          }}
        />
        <div
          className="nuray-drawer fixed top-16 bottom-0 left-0 z-50 w-64"
          data-open={open ? 'true' : 'false'}
          onClick={() => setOpen(false)}
        >
          <DashboardSidebar items={sidebarItems} userType={userType} />
        </div>

        <main
          className="lg:ml-64 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 min-h-[calc(100vh-4rem)] bg-[#FAFAFA]"
        >
          {title && (
            <div className="mb-6 sm:mb-8">
              <h1
                className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight"
              >
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm text-slate-500 font-medium">
                  {subtitle}
                </p>
              )}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

// Backwards-compatible alias
export { DashboardShell as DashboardLayout };

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
  /** Staff permission needed to see this item (admin menu only). */
  needs?: string;
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
  { name: 'Earnings & Cash', href: '/riders/earnings', icon: 'earnings' },
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

/** Every admin page, one menu for all of them. */
export const ADMIN_SIDEBAR_ITEMS: SidebarItem[] = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: 'dashboard', needs: 'read.finance' },
  { name: 'Approvals', href: '/admin/approvals', icon: 'inventory' },
  {
    name: 'Orders',
    href: '/admin/orders',
    icon: 'orders',
    subItems: [
      { name: 'All orders', href: '/admin/orders' },
      { name: 'Transfers to check', href: '/admin/orders?paymentStatus=disputed' },
      { name: 'Refunds', href: '/admin/refunds' },
    ],
  },
  {
    name: 'Kitchens',
    href: '/admin/sellers',
    icon: 'kitchens',
    subItems: [
      { name: 'All kitchens', href: '/admin/sellers' },
      { name: 'Applications', href: '/admin/pending-sellers' },
      { name: 'Dishes', href: '/admin/products' },
      { name: 'Categories', href: '/admin/categories' },
      { name: 'Category requests', href: '/admin/category-requests' },
    ],
  },
  {
    name: 'Riders',
    href: '/admin/riders',
    icon: 'delivery',
    subItems: [
      { name: 'Riders & cash', href: '/admin/riders' },
      { name: 'Applications', href: '/admin/riders?tab=applications' },
    ],
  },
  { name: 'People', href: '/admin/users', icon: 'profile', needs: 'read.core' },
  {
    name: 'Hubs',
    href: '/admin/hubs',
    icon: 'coldchain',
    subItems: [
      { name: 'Operations', href: '/admin/hubs' },
      { name: 'Hubs & managers', href: '/admin/hubs/manage' },
    ],
  },
  { name: 'Communities', href: '/admin/communities', icon: 'addresses' },
  { name: 'Promo codes', href: '/admin/promotions', icon: 'promotions', needs: 'read.core' },
  { name: 'Payouts', href: '/admin/payouts', icon: 'earnings', needs: 'read.finance' },
  { name: 'Support', href: '/admin/support', icon: 'support' },
  { name: 'Analytics', href: '/admin/analytics', icon: 'analytics', needs: 'read.finance' },
  { name: 'Audit log', href: '/admin/audit-log', icon: 'inventory', needs: 'audit.read' },
  { name: 'Settings', href: '/admin/settings', icon: 'settings', needs: 'read.finance' },
  { name: 'Staff', href: '/admin/staff', icon: 'profile', needs: 'staff.manage' },
];

/** The admin menu limited to what this staff member may open. */
export function adminSidebarFor(permissions: string[] | undefined): SidebarItem[] {
  const has = (needs?: string) => !needs || (permissions ?? []).includes(needs);
  return ADMIN_SIDEBAR_ITEMS.filter((i) => has(i.needs));
}

export const HUB_MANAGER_SIDEBAR_ITEMS: SidebarItem[] = [
  { name: 'My hubs', href: '/hub', icon: 'coldchain' },
  { name: 'Help & Support', href: '/support', icon: 'support' },
];

interface DashboardShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  sidebarItems: SidebarItem[];
  userType: 'customer' | 'seller' | 'admin' | 'rider' | 'hub_manager';
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
          className="nuray-drawer fixed top-16 bottom-0 start-0 z-50 w-64"
          data-open={open ? 'true' : 'false'}
          onClick={() => setOpen(false)}
        >
          <DashboardSidebar items={sidebarItems} userType={userType} />
        </div>

        <main
          className="lg:ms-64 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 min-h-[calc(100vh-4rem)] bg-[#FAFAFA]"
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

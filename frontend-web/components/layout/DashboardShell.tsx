'use client';

import { StackedTables } from './StackedTables';
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
  /** Also a tab in the phone tab bar, so the phone menu leaves it out. */
  phoneTab?: boolean;
}

// The tray is not here: the top bar has it from md and the phone tab bar below that.
export const CUSTOMER_SIDEBAR_ITEMS: SidebarItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: 'dashboard' },
  {
    name: 'Kitchens & menus',
    href: '/products',
    icon: 'kitchens',
    subItems: [
      { name: 'Dishes & menus', href: '/products', icon: 'products' },
      { name: 'Verified kitchens', href: '/kitchens', icon: 'kitchens' },
    ],
  },
  { name: 'Saved kitchens', href: '/favorites', icon: 'favorites' },
  { name: 'My orders', href: '/orders', icon: 'orders', phoneTab: true },
  { name: 'Nuray wallet', href: '/wallet', icon: 'earnings' },
  { name: 'My profile', href: '/profile', icon: 'profile', phoneTab: true },
  { name: 'Saved addresses', href: '/profile/addresses', icon: 'addresses' },
  { name: 'Help and support', href: '/support', icon: 'support' },
];

export const RIDER_SIDEBAR_ITEMS: SidebarItem[] = [
  { name: 'Deliveries', href: '/riders/dashboard', icon: 'dashboard', phoneTab: true },
  { name: 'Earnings and cash', href: '/riders/earnings', icon: 'earnings', phoneTab: true },
  { name: 'Settings', href: '/riders/settings', icon: 'settings', phoneTab: true },
  { name: 'Help and support', href: '/support', icon: 'support' },
];

export const SELLER_SIDEBAR_ITEMS: SidebarItem[] = [
  { name: 'Your kitchen', href: '/sellers/dashboard', icon: 'dashboard', phoneTab: true },
  { name: 'Orders', href: '/sellers/orders', icon: 'orders', phoneTab: true },
  // Not a phoneTab although the Menu tab covers it: the phone menu is the only way to Discounts.
  {
    name: 'Menu',
    href: '/sellers/products',
    icon: 'products',
    subItems: [
      { name: 'Dishes', href: '/sellers/products', icon: 'products' },
      { name: 'Discounts', href: '/sellers/promotions', icon: 'promotions' },
    ],
  },
  { name: 'Delivery', href: '/sellers/delivery', icon: 'delivery' },
  { name: 'Earnings', href: '/sellers/earnings', icon: 'earnings', phoneTab: true },
  { name: 'Reports', href: '/sellers/analytics', icon: 'analytics' },
  { name: 'Notifications', href: '/sellers/notifications', icon: 'notifications' },
  { name: 'Settings', href: '/sellers/settings', icon: 'settings', phoneTab: true },
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
  { name: 'Reviews', href: '/admin/reviews', icon: 'reviews', needs: 'support.handle' },
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
  { name: 'Help and support', href: '/support', icon: 'support' },
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
    <div className="min-h-screen bg-page text-ink">
      <DashboardNavbar
        userType={userType}
        onMenuToggle={() => setOpen((v) => !v)}
        drawerOpen={open}
      />
      <div className="relative pt-(--header-offset)">
        {/* The fixed menu is one screen tall; this column behind it runs the page's full length, so a long page printed
            or captured whole keeps the menu's background down to its end. */}
        <div aria-hidden className="absolute inset-y-0 start-0 hidden w-64 border-e border-line bg-surface lg:block" />
        <div
          onClick={() => setOpen(false)}
          aria-hidden={!open}
          className={`lg:hidden fixed inset-0 z-40 bg-ink/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        />
        <div
          className="nuray-drawer fixed top-(--header-offset) bottom-0 start-0 z-50 w-64"
          data-open={open ? 'true' : 'false'}
          onClick={() => setOpen(false)}
        >
          <DashboardSidebar items={sidebarItems} userType={userType} />
        </div>

        <StackedTables />

        <main
          className="lg:ms-64 px-4 sm:px-6 lg:px-10 py-5 lg:py-8 min-h-[calc(100vh-var(--header-offset))] bg-page"
        >
          {/* Customers read one column; the staff screens use the whole width for their tables. The admin pages are English
              only (see AdminShell): left to right in either language. */}
          <div
            className={userType === 'customer' ? 'max-w-[1120px] mx-auto' : undefined}
            dir={userType === 'admin' ? 'ltr' : undefined}
            lang={userType === 'admin' ? 'en' : undefined}
          >
            {title && (
              <div className="mb-5 sm:mb-6">
                <h1 className="text-2xl lg:text-[28px] leading-tight font-extrabold text-ink tracking-tight">
                  {title}
                </h1>
                {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// Backwards-compatible alias
export { DashboardShell as DashboardLayout };

'use client';

import { StackedTables } from './StackedTables';
import { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { DashboardSidebar } from './DashboardSidebar';
import { adminSidebarFor } from './DashboardShell';
import { DashboardNavbar } from './DashboardNavbar';
import { useAuthStore } from '@/lib/store/auth-store';
import { useEffect, useState } from 'react';
import { useHydrated } from '@/lib/hooks/use-hydrated';
import { BrandLockup } from '@/components/ui/Mark';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';

interface SidebarItem {
  name: string;
  href: string;
  icon: string;
  badge?: number;
}

interface UserLayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  showNavbar?: boolean;
}

export function UserLayout({ children, showSidebar = true, showNavbar = true }: UserLayoutProps) {
  const { user, isAuthenticated } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  const t = useT(shellMessages);
  const mounted = useHydrated();
  // The phone menu belongs to the page it was opened on, so navigating closes it without an effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath !== null && drawerPath === pathname;

  // Stop the page scrolling behind the menu while it is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // Determine user type and sidebar items
  const userType = user?.userType || user?.user_type || 'customer';
  
  const customerSidebarItems: SidebarItem[] = [
    { name: 'Dashboard', href: '/dashboard', icon: '📊' },
    { name: 'Browse Products', href: '/products', icon: '🛍️' },
    { name: 'My Orders', href: '/orders', icon: '📦' },
    { name: 'My Cart', href: '/cart', icon: '🛒' },
    { name: 'My Profile', href: '/profile', icon: '👤' },
    { name: 'Addresses', href: '/profile/addresses', icon: '📍' },
  ];

  const sellerSidebarItems: SidebarItem[] = [
    { name: 'Dashboard', href: '/sellers/dashboard', icon: '📊' },
    { name: 'Orders', href: '/sellers/orders', icon: '📦' },
    { name: 'Products', href: '/sellers/products', icon: '🍽️' },
    { name: 'Earnings', href: '/sellers/earnings', icon: '💰' },
    { name: 'Analytics', href: '/sellers/analytics', icon: '📈' },
    { name: 'Settings', href: '/sellers/settings', icon: '⚙️' },
  ];

  const riderSidebarItems: SidebarItem[] = [
    { name: 'Dashboard', href: '/riders/dashboard', icon: '📊' },
  ];

  const adminSidebarItems = adminSidebarFor(user?.permissions);

  // Get appropriate sidebar items based on user type
  const getSidebarItems = (): SidebarItem[] => {
    if (userType === 'admin') return adminSidebarItems;
    if (userType === 'seller') return sellerSidebarItems;
    if (userType === 'rider') return riderSidebarItems;
    return customerSidebarItems;
  };

  // For public pages (products, login, register), show minimal layout
  const isPublicPage = pathname?.startsWith('/login') || 
                      pathname?.startsWith('/register') || 
                      pathname?.startsWith('/verify-email') ||
                      pathname === '/';

  // Wait for mount to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream-50)' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--forest-500)' }}></div>
      </div>
    );
  }

  // If not authenticated and not a public page, don't show layout
  if (!isAuthenticated && !isPublicPage) {
    return <>{children}</>;
  }

  // For public pages, show simple layout without sidebar
  if (isPublicPage || !showSidebar) {
    const userType = user?.userType || user?.user_type;
    const dashboardPath =
      userType === 'admin' ? '/admin/dashboard' : userType === 'seller' ? '/sellers/dashboard' : '/dashboard';
    const linkClass =
      'text-[13px] font-medium text-[var(--ink-800)] hover:text-[var(--forest-700)] tracking-tight transition-colors';
    return (
      <div className="min-h-screen" style={{ background: 'var(--cream-50)' }}>
        {showNavbar && (
          <nav
            className="sticky top-0 z-50 backdrop-blur-md"
            style={{
              background: 'rgba(251,248,241,0.94)',
              borderBottom: '1px solid var(--ink-100)',
            }}
          >
            <div className="max-w-[1440px] mx-auto px-6 md:px-12 h-[72px] flex items-center justify-between">
              <Link href="/" className="flex items-center gap-3">
                <BrandLockup markSize={32} wordSize={26} />
              </Link>
              <div className="hidden md:flex items-center gap-7">
                <Link href="/products" className={linkClass}>
                  {t('todaysPlates')}
                </Link>
                <Link href="/products?productType=frozen" className={linkClass}>
                  {t('pantry')}
                </Link>
                <Link href="/products?productType=fresh" className={linkClass}>
                  {t('fresh')}
                </Link>
                {isAuthenticated && (
                  <Link href={dashboardPath} className={linkClass}>
                    {t('dashboard')}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                <LanguageSwitcher />
                {isAuthenticated ? (
                  <>
                    <Link href="/orders" className={`${linkClass} px-3 py-2`}>
                      {t('orders')}
                    </Link>
                    <Link href="/cart" className={`${linkClass} px-3 py-2`}>
                      {t('bag')}
                    </Link>
                    <Link href="/profile" className={`${linkClass} px-3 py-2`}>
                      {t('you')}
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/login" className={`${linkClass} px-3 py-2`}>
                      {t('signInLower')}
                    </Link>
                    <Link href="/register">
                      <button className="h-10 px-5 rounded-full text-[13px] font-medium tracking-tight transition-colors"
                        style={{ background: 'var(--ink-900)', color: 'var(--cream-50)' }}>
                        {t('joinNuray')}
                      </button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
        )}
        <StackedTables /><main>{children}</main>
      </div>
    );
  }

  // For authenticated users, show full layout with sidebar
  return (
    <div className="min-h-screen" style={{ background: 'var(--cream-50)' }}>
      {showNavbar && (
        <DashboardNavbar
          title="Nuray"
          userType={userType as 'customer' | 'seller' | 'admin' | 'rider'}
          onMenuToggle={() => setDrawerPath(drawerOpen ? null : pathname)}
          drawerOpen={drawerOpen}
        />
      )}
      <div className="pt-16">
        {showSidebar && (
          <>
            {/* Sidebar: fixed on lg+, a slide-out drawer on phones and tablets (same as DashboardLayout) */}
            <div
              className="fixed inset-0 z-40 lg:hidden transition-opacity duration-200"
              style={{ background: 'rgba(15,23,42,0.6)', opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none' }}
              onClick={() => setDrawerPath(null)}
              aria-hidden={!drawerOpen}
            />
            <div
              className="nuray-drawer fixed top-16 bottom-0 start-0 z-50 w-64"
              data-open={drawerOpen ? 'true' : 'false'}
              onClick={() => setDrawerPath(null)}
            >
              <DashboardSidebar items={getSidebarItems()} userType={userType as 'customer' | 'seller' | 'admin' | 'rider'} />
            </div>
          </>
        )}
        <StackedTables />
        <main className={`min-w-0 ${showSidebar ? 'lg:ms-64' : ''} p-4 sm:p-6`}>{children}</main>
      </div>
    </div>
  );
}

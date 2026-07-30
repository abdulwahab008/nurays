'use client';

import { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardNavbar } from './DashboardNavbar';
import { useAuthStore } from '@/lib/store/auth-store';
import { useEffect, useState } from 'react';
import { BrandLockup } from '@/components/ui/Mark';

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
  const [mounted, setMounted] = useState(false);

  // Wait for hydration to complete
  useEffect(() => {
    setMounted(true);
  }, []);

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

  const adminSidebarItems: SidebarItem[] = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
    { name: 'Pending Sellers', href: '/admin/pending-sellers', icon: '👥' },
    { name: 'All Sellers', href: '/admin/sellers', icon: '🏪' },
    { name: 'Orders', href: '/admin/orders', icon: '📦' },
    { name: 'Products', href: '/admin/products', icon: '🍽️' },
    { name: 'Payouts', href: '/admin/payouts', icon: '💸' },
    { name: 'Support', href: '/admin/support', icon: '🎫' },
    { name: 'Analytics', href: '/admin/analytics', icon: '📈' },
    { name: 'Settings', href: '/admin/settings', icon: '⚙️' },
  ];

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
                  Today's plates
                </Link>
                <Link href="/products?productType=frozen" className={linkClass}>
                  Pantry
                </Link>
                <Link href="/products?productType=fresh" className={linkClass}>
                  Fresh
                </Link>
                {isAuthenticated && (
                  <Link href={dashboardPath} className={linkClass}>
                    Dashboard
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isAuthenticated ? (
                  <>
                    <Link href="/orders" className={`${linkClass} px-3 py-2`}>
                      Orders
                    </Link>
                    <Link href="/cart" className={`${linkClass} px-3 py-2`}>
                      Bag
                    </Link>
                    <Link href="/profile" className={`${linkClass} px-3 py-2`}>
                      You
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/login" className={`${linkClass} px-3 py-2`}>
                      Sign in
                    </Link>
                    <Link href="/register">
                      <button className="h-10 px-5 rounded-full text-[13px] font-medium tracking-tight transition-colors"
                        style={{ background: 'var(--ink-900)', color: 'var(--cream-50)' }}>
                        Join Nuray
                      </button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
        )}
        <main>{children}</main>
      </div>
    );
  }

  // For authenticated users, show full layout with sidebar
  return (
    <div className="min-h-screen" style={{ background: 'var(--cream-50)' }}>
      {showNavbar && <DashboardNavbar title="Nuray" />}
      <div className="flex pt-16">
        {showSidebar && <DashboardSidebar items={getSidebarItems()} userType={userType as 'customer' | 'seller' | 'admin' | 'rider'} />}
        <main className={`flex-1 ${showSidebar ? 'ml-64' : ''} p-6`}>
          {children}
        </main>
      </div>
    </div>
  );
}


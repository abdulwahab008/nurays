'use client';

import { ReactNode, useState, useEffect } from 'react';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardNavbar } from './DashboardNavbar';
import { SellerNewOrderNotification } from '@/components/SellerNewOrderNotification';

interface SidebarItem {
  name: string;
  href: string;
  icon: string;
  badge?: number;
}

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  sidebarItems: SidebarItem[];
  userType: 'customer' | 'seller' | 'admin';
}

export function DashboardLayout({
  children,
  title,
  subtitle,
  sidebarItems,
  userType,
}: DashboardLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [drawerOpen]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream-50)' }}>
      {userType === 'seller' && <SellerNewOrderNotification />}
      <DashboardNavbar
        title={title}
        subtitle={subtitle}
        userType={userType}
        onMenuToggle={() => setDrawerOpen((v) => !v)}
        drawerOpen={drawerOpen}
      />
      <div className="pt-16">
        {/* Sidebar: fixed on lg+, off-canvas drawer below lg */}
        <div
          className="fixed inset-0 z-40 lg:hidden transition-opacity duration-200"
          style={{
            background: 'rgba(26,22,16,0.45)',
            opacity: drawerOpen ? 1 : 0,
            pointerEvents: drawerOpen ? 'auto' : 'none',
          }}
          onClick={() => setDrawerOpen(false)}
          aria-hidden={!drawerOpen}
        />
        <div
          className="nuray-drawer fixed top-16 bottom-0 left-0 z-50 w-64"
          data-open={drawerOpen ? 'true' : 'false'}
          onClick={() => setDrawerOpen(false)}
        >
          <DashboardSidebar items={sidebarItems} userType={userType} />
        </div>

        <main
          className="lg:ml-64 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 min-h-[calc(100vh-4rem)]"
          style={{ background: 'var(--cream-50)' }}
        >
          {/* Page Header */}
          {title && (
            <div className="mb-6 sm:mb-8">
              <h1
                className="font-display italic text-[32px] sm:text-[40px] lg:text-[48px] leading-[1.05]"
                style={{ color: 'var(--ink-900)' }}
              >
                {title}
              </h1>
              {subtitle && (
                <p className="mt-2 text-[14px] sm:text-[15px]" style={{ color: 'var(--ink-500)' }}>
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

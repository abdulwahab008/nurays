'use client';

import { ReactNode, useState, useEffect } from 'react';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardNavbar } from './DashboardNavbar';

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
    <div className="min-h-screen bg-[#FAFAFA] text-[#0F172A]">
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
            background: 'rgba(15,23,42,0.6)',
            opacity: drawerOpen ? 1 : 0,
            pointerEvents: drawerOpen ? 'auto' : 'none',
          }}
          onClick={() => setDrawerOpen(false)}
          aria-hidden={!drawerOpen}
        />
        <div
          className="nuray-drawer fixed top-16 bottom-0 start-0 z-50 w-64"
          data-open={drawerOpen ? 'true' : 'false'}
          onClick={() => setDrawerOpen(false)}
        >
          <DashboardSidebar items={sidebarItems} userType={userType} />
        </div>

        <main
          className="lg:ms-64 px-4 sm:px-6 lg:px-10 py-6 lg:py-10 min-h-[calc(100vh-4rem)] bg-[#FAFAFA]"
        >
          {/* Page Header */}
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

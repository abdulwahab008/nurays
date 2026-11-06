'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { StackedTables } from './StackedTables';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardNavbar } from './DashboardNavbar';
import { adminSidebarFor } from './DashboardShell';
import { useAuthStore } from '@/lib/store/auth-store';
import { useHydrated } from '@/lib/hooks/use-hydrated';
import { useShallow } from 'zustand/react/shallow';

/**
 * The frame of an admin page that brings its own heading: the top bar, the side menu (a slide-out drawer on phones and
 * tablets) and the page area. Which menu entries show follows the staff member's permissions (`adminSidebarFor`). The pages
 * that want a ready-made heading use `DashboardLayout` from DashboardShell instead.
 *
 * Who may open an admin page is decided by app/admin/layout.tsx, which sends everyone else away.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuthStore(useShallow((s) => ({ user: s.user, isAuthenticated: s.isAuthenticated })));
  const pathname = usePathname();
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

  // Wait for mount to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page" role="status">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand-ink" aria-hidden="true" />
      </div>
    );
  }

  // Not signed in: no frame (the segment's layout is sending the visitor to the sign-in page).
  if (!isAuthenticated) return <>{children}</>;

  return (
    <div className="min-h-screen bg-page">
      <DashboardNavbar
        userType="admin"
        onMenuToggle={() => setDrawerPath(drawerOpen ? null : pathname)}
        drawerOpen={drawerOpen}
      />
      <div className="relative pt-(--header-offset)">
        {/* The fixed menu is one screen tall; this column behind it runs the page's full length, so a long page printed
            or captured whole keeps the menu's background down to its end. */}
        <div aria-hidden className="absolute inset-y-0 start-0 hidden w-64 border-e border-line bg-surface lg:block" />
        <div
          className={`fixed inset-0 z-40 lg:hidden bg-ink/40 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setDrawerPath(null)}
          aria-hidden={!drawerOpen}
        />
        <div
          className="nuray-drawer fixed top-(--header-offset) bottom-0 start-0 z-50 w-64"
          data-open={drawerOpen ? 'true' : 'false'}
          onClick={() => setDrawerPath(null)}
        >
          <DashboardSidebar items={adminSidebarFor(user?.permissions)} userType="admin" />
        </div>
        <StackedTables />
        <main className="min-w-0 lg:ms-64 px-4 sm:px-6 lg:px-10 py-5 lg:py-8 min-h-[calc(100vh-var(--header-offset))] bg-page">
          {/* The admin pages are written in English only: their content reads left to right in either language, while the
              top bar and the menu (and where the menu sits) follow the language chosen. */}
          <div dir="ltr" lang="en">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

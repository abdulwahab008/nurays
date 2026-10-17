'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { StackedTables } from './StackedTables';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardNavbar } from './DashboardNavbar';
import { adminSidebarFor } from './DashboardShell';
import { useAuthStore } from '@/lib/store/auth-store';
import { useHydrated } from '@/lib/hooks/use-hydrated';

/**
 * The frame of an admin page that brings its own heading: the top bar, the side menu (a slide-out drawer on phones and
 * tablets) and the page area. Which menu entries show follows the staff member's permissions (`adminSidebarFor`). The pages
 * that want a ready-made heading use `DashboardLayout` from DashboardShell instead.
 *
 * Who may open an admin page is decided by app/admin/layout.tsx, which sends everyone else away.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuthStore();
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--cream-50)' }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--forest-500)' }}></div>
      </div>
    );
  }

  // Not signed in: no frame (the segment's layout is sending the visitor to the sign-in page).
  if (!isAuthenticated) return <>{children}</>;

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream-50)' }}>
      <DashboardNavbar
        title="Nuray"
        userType="admin"
        onMenuToggle={() => setDrawerPath(drawerOpen ? null : pathname)}
        drawerOpen={drawerOpen}
      />
      <div className="pt-(--header-offset)">
        <div
          className="fixed inset-0 z-40 lg:hidden transition-opacity duration-200"
          style={{ background: 'rgba(15,23,42,0.6)', opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none' }}
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
        <main className="min-w-0 lg:ms-64 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

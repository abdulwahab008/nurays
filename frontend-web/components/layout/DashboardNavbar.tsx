'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { Mark, Wordmark } from '@/components/ui/Mark';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { siteMessages } from '@/lib/i18n/messages/site';
import {
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Settings,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';


interface DashboardNavbarProps {
  userType?: 'customer' | 'seller' | 'admin' | 'rider' | 'hub_manager';
  onMenuToggle?: () => void;
  drawerOpen?: boolean;
}

const menuRow = 'flex h-11 items-center gap-3 px-4 text-sm text-ink hover:bg-raised transition-colors';
const menuIcon = 'w-4 h-4 text-muted';
// On a phone a panel spans the screen under the bar (anchored to a button it would run off the edge); from sm it hangs
// under its button.
const panel = 'fixed inset-x-3 top-[calc(var(--header-offset)+0.5rem)] sm:absolute sm:inset-x-auto sm:top-full sm:end-0 sm:mt-2 bg-surface rounded-2xl shadow-[var(--shadow-hover)] border border-line z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150';

export function DashboardNavbar({ userType = 'customer', onMenuToggle, drawerOpen }: DashboardNavbarProps) {
  const router = useRouter();
  const t = useT(shellMessages);
  const tSite = useT(siteMessages);
  const pathname = usePathname() || '';
  const { logout, user, isAuthenticated } = useAuthStore(useShallow((s) => ({ logout: s.logout, user: s.user, isAuthenticated: s.isAuthenticated })));
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  // Click outside listener for user dropdown menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);


  // Escape closes the phone menu and puts the focus back on the button that opened it.
  useEffect(() => {
    if (!drawerOpen || !onMenuToggle) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onMenuToggle();
      menuToggleRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, onMenuToggle]);

  // Determine UI context strictly based on active route and layout userType:
  const isRider = pathname.startsWith('/riders') || (userType === 'rider' && !pathname.startsWith('/sellers') && !pathname.startsWith('/admin'));
  const isSeller = pathname.startsWith('/sellers') || (userType === 'seller' && !pathname.startsWith('/riders') && !pathname.startsWith('/admin'));
  const isAdmin = pathname.startsWith('/admin') || (userType === 'admin' && !pathname.startsWith('/sellers') && !pathname.startsWith('/riders'));
  const isHubManager = !isAdmin && (pathname === '/hub' || pathname.startsWith('/hub/') || userType === 'hub_manager');

  // Actual user account role (for quick studio switch links)
  const userRole = user?.userType || user?.user_type;
  const isUserSeller = userRole === 'seller';
  const isUserRider = userRole === 'rider';
  const isUserAdmin = userRole === 'admin';

  // Get the correct dashboard link based on user type
  const getDashboardLink = () => {
    if (isRider) return '/riders/dashboard';
    if (isSeller) return '/sellers/dashboard';
    if (isAdmin) return '/admin/dashboard';
    if (isHubManager) return '/hub';
    if (isUserSeller) return '/sellers/dashboard';
    if (isUserRider) return '/riders/dashboard';
    if (isUserAdmin) return '/admin/dashboard';
    return '/';
  };

  // Leave the page first, then end the session: the page's own guards must not see a signed-out visitor and send
  // them to sign in with this page as ?next= (the next person to sign in here would land on it).
  const handleLogout = () => {
    setShowDropdown(false);
    router.replace('/login');
    logout();
  };

  return (
    <nav
      className="fixed top-0 start-0 end-0 z-50 h-(--header-offset) pt-(--safe-top) pl-(--safe-left) pr-(--safe-right) bg-surface/95 backdrop-blur-md border-b border-line"
    >
      <div className="flex items-center justify-between h-full px-3 sm:px-6 gap-2">
        {/* Logo Section */}
        <div className="flex items-center gap-1 sm:gap-4">
          {onMenuToggle && (
            <button
              ref={menuToggleRef}
              type="button"
              onClick={onMenuToggle}
              aria-label={t('toggleNav')}
              aria-expanded={Boolean(drawerOpen)}
              className="lg:hidden grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink hover:bg-raised transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {drawerOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </>
                  )}
                </svg>
              </button>
            )}
            <Link href={getDashboardLink()} aria-label={t('goHome')} className="flex items-center gap-3 min-h-11 min-w-11">
              <Mark size={32} />
              <div className="hidden sm:block leading-tight">
                <Wordmark size={22} />
                <p className="eyebrow text-xs font-medium text-muted">
                  {isSeller ? t('ctxSeller') : isAdmin ? t('ctxAdmin') : isRider ? t('ctxRider') : isHubManager ? t('ctxHub') : t('ctxCustomer')}
                </p>
              </div>
            </Link>
          </div>

          {/* Right Side - Actions */}
          <div className="flex items-center justify-end gap-1 sm:gap-2 min-w-0 max-sm:flex-1">

            <LanguageSwitcher className="h-11 min-w-11 justify-center px-2 max-[420px]:[&>span]:hidden" />

            {/* A rider has no full list (the customer page would open the customer menu), so no footer link */}
            <NotificationBell allHref={isRider ? undefined : isSeller ? '/sellers/notifications' : isAdmin ? '/admin/notifications' : '/notifications'} />

            {/* User Dropdown or Sign In */}
            {!user && !isAuthenticated ? (
              <div className="flex items-center gap-2 ms-2">
                <Link
                  href="/login"
                  className="inline-flex h-11 items-center px-4 rounded-xl text-sm font-semibold text-on-brand transition-colors bg-brand hover:bg-brand-500"
                >
                  {t('signIn')}
                </Link>
              </div>
            ) : (
              <div className="relative ms-0 sm:ms-2" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowDropdown(!showDropdown)}
                  aria-label={tSite('account')}
                  aria-haspopup="menu"
                  aria-expanded={showDropdown}
                  className="flex min-h-11 min-w-11 items-center justify-center gap-2 sm:px-2 rounded-lg hover:bg-raised transition-colors cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-brand-soft text-brand-soft-ink">
                    <span className="font-semibold text-sm">
                      {user?.profile?.fullName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <span className="hidden sm:block text-ink text-sm font-medium">
                    {user?.profile?.fullName?.split(' ')[0] || user?.email?.split('@')[0] || t('user')}
                  </span>
                  <svg className="hidden sm:block w-4 h-4 text-muted" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
            
              {/* Dropdown Menu */}
              {showDropdown && (
                <div data-top-panel className={`${panel} sm:w-72 py-1`}>
                  <div className="px-4 py-3 border-b border-line">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-ink font-semibold truncate text-sm">{user?.profile?.fullName || user?.email || t('user')}</p>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full shrink-0 bg-raised text-muted">
                        {isSeller ? t('roleSeller') : isAdmin ? t('roleAdmin') : isRider ? t('roleRider') : t('roleHub')}
                      </span>
                    </div>
                    <p className="text-xs text-muted truncate mt-0.5" data-ltr>{user?.email}</p>
                  </div>

                  <div className="py-1">
                    {isSeller && (
                      <Link href="/sellers/settings" className={menuRow}>
                        <Settings className={menuIcon} aria-hidden="true" />
                        {t('settings')}
                      </Link>
                    )}
                    {isRider && (
                      <>
                        <Link href="/riders/settings" className={menuRow}>
                          <Settings className={menuIcon} aria-hidden="true" />
                          {t('settings')}
                        </Link>
                        <Link href="/support" className={menuRow}>
                          <LifeBuoy className={menuIcon} aria-hidden="true" />
                          {t('helpSupport')}
                        </Link>
                      </>
                    )}
                    {isAdmin && (
                      <>
                        <Link href="/admin/dashboard" className={menuRow}>
                          <LayoutGrid className={menuIcon} aria-hidden="true" />
                          {t('dashboard')}
                        </Link>
                        {user?.permissions?.includes('read.finance') && (
                          <Link href="/admin/settings" className={menuRow}>
                            <Settings className={menuIcon} aria-hidden="true" />
                            {t('settings')}
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                  <div className="py-1 border-t border-line">
                    <button type="button" onClick={handleLogout} className={`${menuRow} w-full font-medium text-red-700 hover:bg-red-50`}>
                      <LogOut className="w-4 h-4" aria-hidden="true" />
                      {tSite('signOut')}
                    </button>
                  </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </nav>
  );
}


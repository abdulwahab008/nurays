'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useSocket } from '@/lib/hooks/use-socket';
import { Mark, Wordmark } from '@/components/ui/Mark';
import { CommunitySelector } from '@/components/community/CommunitySelector';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import {
  Bell,
  CheckCheck,
  Package,
  Tag,
  Truck,
  AlertCircle,
  Info,
  ChevronRight,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';


interface NavbarNotification {
  id: string;
  type?: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string | null;
}

interface DashboardNavbarProps {
  userType?: 'customer' | 'seller' | 'admin' | 'rider' | 'hub_manager';
  onMenuToggle?: () => void;
  drawerOpen?: boolean;
}

export function DashboardNavbar({ userType = 'customer', onMenuToggle, drawerOpen }: DashboardNavbarProps) {
  const router = useRouter();
  const t = useT(shellMessages);
  const { showToast } = useToast();
  const pathname = usePathname() || '';
  const { logout, user, isAuthenticated } = useAuthStore(useShallow((s) => ({ logout: s.logout, user: s.user, isAuthenticated: s.isAuthenticated })));
  const { items } = useCartStore(useShallow((s) => ({ items: s.items })));
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState<number>(0);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState<boolean>(false);
  const [recentNotifications, setRecentNotifications] = useState<NavbarNotification[]>([]);
  // Why the recent notifications could not be read; shown instead of "All caught up", which would be untrue.
  const [notificationsError, setNotificationsError] = useState<unknown>(null);
  const [loadingNotifications, setLoadingNotifications] = useState<boolean>(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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


  // Determine UI context strictly based on active route and layout userType:
  const isRider = pathname.startsWith('/riders') || (userType === 'rider' && !pathname.startsWith('/sellers') && !pathname.startsWith('/admin'));
  const isSeller = pathname.startsWith('/sellers') || (userType === 'seller' && !pathname.startsWith('/riders') && !pathname.startsWith('/admin'));
  const isAdmin = pathname.startsWith('/admin') || (userType === 'admin' && !pathname.startsWith('/sellers') && !pathname.startsWith('/riders'));
  const isHubManager = !isAdmin && (pathname === '/hub' || pathname.startsWith('/hub/') || userType === 'hub_manager');
  const isCustomer = !isRider && !isSeller && !isAdmin && !isHubManager;

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
    return '/dashboard';
  };

  // Theme accents — ink for seller, emerald for rider, turquoise for customer/admin (dark words on turquoise)
  const accentBg = isRider ? '#059669' : isSeller ? 'var(--ink-900)' : 'var(--forest-500)';
  const accentFg = isRider ? '#FFFFFF' : isSeller ? 'var(--fg-inverse)' : '#06302B';

  // Fetch notification unread count so we only show the red dot when there are unread
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    apiClient.get('/notifications', { params: { limit: 1 } })
      .then((res) => {
        if (cancelled) return;
        const count = res.data?.data?.unreadCount ?? 0;
        setNotificationUnreadCount(count);
      })
      .catch(() => {
        if (!cancelled) setNotificationUnreadCount(0);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  // A new notification arrives live: the bell counts it straight away.
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onNew = () => setNotificationUnreadCount((n) => n + 1);
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [socket]);

  // Click outside listener for notification panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotificationsPanel(false);
      }
    };
    if (showNotificationsPanel) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotificationsPanel]);

  const fetchRecentNotifications = async () => {
    if (!user?.id) return;
    setLoadingNotifications(true);
    try {
      const res = await apiClient.get('/notifications', { params: { limit: 5 } });
      if (res.data?.success && res.data?.data) {
        const list = res.data.data.notifications || [];
        setRecentNotifications(
          (list as Array<Partial<NavbarNotification> & { id: string; title: string; message: string; createdAt: string; link?: string }>).map((n) => ({
            id: n.id,
            type: n.type || 'system',
            title: n.title,
            message: n.message,
            isRead: Boolean(n.isRead),
            createdAt: n.createdAt,
            actionUrl: n.actionUrl || n.link || null,
          }))
        );
        setNotificationUnreadCount(res.data.data.unreadCount ?? 0);
      }
      setNotificationsError(null);
    } catch (error) {
      console.error('Failed to fetch recent notifications:', error);
      setNotificationsError(error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleToggleNotifications = () => {
    if (!showNotificationsPanel) {
      fetchRecentNotifications();
    }
    setShowNotificationsPanel(prev => !prev);
  };

  const handleMarkNotificationRead = async (id: string, actionUrl?: string | null) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setRecentNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
      setNotificationUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
    if (actionUrl) {
      setShowNotificationsPanel(false);
      router.push(actionUrl);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await apiClient.patch('/notifications/read-all');
      setRecentNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setNotificationUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
      showToast(apiErrorMessage(err, t('markAllReadFailed')), 'error');
    }
  };

  const getNotificationIcon = (type?: string) => {
    switch (type) {
      case 'order':
        return <Package className="w-4 h-4 text-muted" />;
      case 'promo':
        return <Tag className="w-4 h-4 text-muted" />;
      case 'delivery':
        return <Truck className="w-4 h-4 text-muted" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-rose-600" />;
      default:
        return <Info className="w-4 h-4 text-muted" />;
    }
  };

  const getNotificationIconBg = (type?: string) => {
    switch (type) {
      case 'order':
        return 'bg-raised border-line';
      case 'promo':
        return 'bg-raised border-line';
      case 'delivery':
        return 'bg-raised border-line';
      case 'warning':
        return 'bg-rose-50 border-rose-100';
      default:
        return 'bg-raised border-line';
    }
  };

  const formatRelativeTime = (dateStr: string, t: (key: 'justNow' | 'minutesAgo' | 'hoursAgo' | 'yesterday' | 'daysAgo', vars?: { n: number }) => string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMinutes < 1) return t('justNow');
      if (diffMinutes < 60) return t('minutesAgo', { n: diffMinutes });
      if (diffHours < 24) return t('hoursAgo', { n: diffHours });
      if (diffDays === 1) return t('yesterday');
      if (diffDays < 7) return t('daysAgo', { n: diffDays });
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const cartItemCount = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <nav
      className="fixed top-0 start-0 end-0 z-50 h-(--header-offset) pt-(--safe-top) pl-(--safe-left) pr-(--safe-right) bg-surface/95 backdrop-blur-md border-b border-line"
    >
      <div className="flex items-center justify-between h-full px-3 sm:px-6 gap-2">
        {/* Logo Section */}
        <div className="flex items-center gap-2 sm:gap-4">
          {onMenuToggle && (
            <button
              type="button"
              onClick={onMenuToggle}
              aria-label={t('toggleNav')}
              className="lg:hidden w-10 h-10 rounded-full grid place-items-center transition-colors"
              style={{ color: 'var(--ink-800)' }}
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
          <Link href={getDashboardLink()} className="flex items-center gap-3">
            <Mark size={32} />
            <div className="hidden sm:block leading-tight">
              <Wordmark size={22} />
              <p className="eyebrow mt-0.5">
                {isSeller ? t('ctxSeller') : isAdmin ? t('ctxAdmin') : isRider ? t('ctxRider') : isHubManager ? t('ctxHub') : t('ctxCustomer')}
              </p>
            </div>
          </Link>
        </div>

        {/* Center - Search Bar (Only for customers) */}
        {isCustomer && (
          <div className="hidden md:flex flex-1 max-w-lg mx-8">
            <form onSubmit={handleSearch} className="w-full relative">
              <div className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full ps-10 pe-24 py-2.5 rounded-full text-sm outline-none transition-all"
                style={{
                  background: 'var(--cream-50)',
                  border: '1px solid var(--ink-200)',
                  color: 'var(--ink-900)',
                }}
              />
              <button
                type="submit"
                className="absolute end-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 text-sm font-medium rounded-full transition-colors"
                style={{ background: 'var(--ink-900)', color: 'var(--fg-inverse)' }}
              >
                {t('search')}
              </button>
            </form>
          </div>
        )}

        {/* Right Side - Actions */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">

          {/* Community Selector - Only for customers */}
          {isCustomer && (
            <div className="flex items-center min-w-0 overflow-hidden">
              <CommunitySelector variant="navbar" />
            </div>
          )}

          {/* Cart - Only for customers; on a phone it is in the tab bar */}
          {isCustomer && (
            <Link href="/cart" className="relative hidden md:block">
              <button className="w-10 h-10 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors" aria-label={t('cart')} title={t('cart')}>
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
              </button>
              {cartItemCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 w-5 h-5 bg-gray-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {cartItemCount > 9 ? '9+' : cartItemCount}
                </span>
              )}
            </Link>
          )}

          {/* Seller Quick Actions */}

          {/* A customer's phone has the language under Profile; the bar keeps room for the area */}
          <LanguageSwitcher className={isCustomer ? 'hidden sm:inline-flex px-2' : 'px-2 max-[420px]:[&>span]:hidden'} />

          {/* Notifications Panel */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={handleToggleNotifications}
              aria-label={t('notifications')}
              aria-expanded={showNotificationsPanel}
              className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                showNotificationsPanel 
                  ? 'bg-raised text-ink' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
              title={t('notifications')}
            >
              <Bell className="w-5 h-5" />
              {notificationUnreadCount > 0 && (
                <span className="absolute top-2 end-2 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" data-testid="bell-unread" />
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {showNotificationsPanel && (
              <div className="absolute end-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/70">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-gray-900">{t('notifications')}</span>
                    {notificationUnreadCount > 0 && (
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-accent-soft text-accent-soft-ink">
                        {t('newCount', { count: notificationUnreadCount })}
                      </span>
                    )}
                  </div>
                  {notificationUnreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllNotificationsRead}
                      className="text-xs font-medium text-brand-ink hover:underline flex items-center gap-1 transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>{t('markAllRead')}</span>
                    </button>
                  )}
                </div>

                {/* Panel Body */}
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                  {loadingNotifications ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-500">
                      <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">{t('loadingUpdates')}</span>
                    </div>
                  ) : notificationsError && recentNotifications.length === 0 ? (
                    <div className="p-3">
                      <LoadError compact error={notificationsError} onRetry={fetchRecentNotifications} />
                    </div>
                  ) : recentNotifications.length === 0 ? (
                    <div className="py-10 px-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-2 text-gray-500">
                        <Bell className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-semibold text-gray-900">{t('allCaughtUp')}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t('noNotifications')}</p>
                    </div>
                  ) : (
                    recentNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleMarkNotificationRead(notif.id, notif.actionUrl)}
                        className={`p-3.5 flex items-start gap-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                          !notif.isRead ? 'bg-brand-soft/40' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${getNotificationIconBg(notif.type)}`}>
                          {getNotificationIcon(notif.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <p className={`text-xs font-semibold truncate ${!notif.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                              {notif.title}
                            </p>
                            <span className="text-[11px] text-gray-500 shrink-0">
                              {formatRelativeTime(notif.createdAt, t)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                            {notif.message}
                          </p>
                        </div>
                        {!notif.isRead && (
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0 mt-1.5" />
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Panel Footer */}
                <div className="p-2 border-t border-gray-100 bg-gray-50/50">
                  <Link
                    href={isSeller ? "/sellers/notifications" : isAdmin ? "/admin/notifications" : isRider ? "/riders/dashboard" : "/notifications"}
                    onClick={() => setShowNotificationsPanel(false)}
                    className="w-full py-2 px-3 text-center text-xs font-medium text-gray-700 hover:text-ink hover:bg-surface rounded-lg transition-colors flex items-center justify-center gap-1 border border-transparent hover:border-gray-200"
                  >
                    <span>{t('viewAllNotifications')}</span>
                    <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>
          
          {/* User Dropdown or Sign In */}
          {!user && !isAuthenticated ? (
            <div className="flex items-center gap-2 ms-2">
              <Link
                href="/login"
                className="px-4 py-2 rounded-xl text-xs font-bold text-on-brand shadow-xs transition-transform active:scale-95 bg-brand hover:bg-brand-500"
              >
                {t('signIn')}
              </Link>
            </div>
          ) : (
            <div className="relative ms-0 sm:ms-2" ref={dropdownRef}>
              <button 
                type="button"
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shadow-2xs"
                  style={{ background: accentBg, color: accentFg }}
                >
                  <span className="font-semibold text-sm">
                    {user?.profile?.fullName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <span className="hidden sm:block text-ink text-sm font-medium">
                  {user?.profile?.fullName?.split(' ')[0] || user?.email?.split('@')[0] || t('user')}
                </span>
                <svg className="w-4 h-4 text-gray-500 max-[380px]:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            
            {/* Dropdown Menu */}
            {showDropdown && (
              <div className="absolute end-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-gray-100 py-1 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/70">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-ink font-semibold truncate text-sm">{user?.profile?.fullName || user?.email || t('user')}</p>
                    <span
                      className="px-2 py-0.5 text-xs font-medium rounded-full shrink-0"
                      style={{
                        background: isSeller ? 'var(--ink-100)' : isAdmin ? 'var(--gold-50)' : isRider ? 'var(--brand-soft)' : 'var(--forest-50)',
                        color: isSeller ? 'var(--ink-700)' : isAdmin ? 'var(--gold-700)' : isRider ? 'var(--brand-soft-ink)' : 'var(--forest-700)',
                      }}
                    >
                      {isSeller ? t('roleSeller') : isAdmin ? t('roleAdmin') : isRider ? t('roleRider') : isHubManager ? t('roleHub') : t('roleCustomer')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5" data-ltr>{user?.email}</p>
                </div>


                <div className="py-1">
                  {isSeller && (
                      <Link href="/sellers/settings" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-sm">{t('settings')}</span>
                      </Link>
                  )}
                  {/* Customer menu items */}
                  {isCustomer && (
                    <>
                      <Link href="/profile" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        <span className="text-sm">{t('myProfile')}</span>
                      </Link>
                      <Link href="/orders" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        <span className="text-sm">{t('myOrders')}</span>
                      </Link>
                      <Link href="/profile/addresses" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        <span className="text-sm">{t('savedAddresses')}</span>
                      </Link>
                      <Link href="/favorites" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                        </svg>
                        <span className="text-sm">{t('favoriteKitchens')}</span>
                      </Link>
                      <Link href="/support" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-.774-.75 3.75 3.75 0 01.408-1.706A8.281 8.281 0 013 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                        </svg>
                        <span className="text-sm">{t('helpSupport')}</span>
                      </Link>
                    </>
                  )}
                  {/* Admin menu items */}
                  {isAdmin && (
                    <>
                      <Link href="/admin/dashboard" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                        </svg>
                        <span className="text-sm">{t('dashboard')}</span>
                      </Link>
                      <Link href="/admin/settings" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281" />
                        </svg>
                        <span className="text-sm">{t('settings')}</span>
                      </Link>
                    </>
                  )}
                </div>
                <div className="py-1 border-t border-gray-100">
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                    </svg>
                    <span className="text-sm font-medium">{t('logout')}</span>
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


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
import { siteMessages } from '@/lib/i18n/messages/site';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import {
  Bell,
  CheckCheck,
  Package,
  Tag,
  Truck,
  AlertCircle,
  Info,
  ChevronRight,
  Heart,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  MapPin,
  Search,
  Settings,
  ShoppingBag,
  User,
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

const menuRow = 'flex h-11 items-center gap-3 px-4 text-sm text-ink hover:bg-raised transition-colors';
const menuIcon = 'w-4 h-4 text-muted';
const iconButton = 'relative grid h-11 w-11 shrink-0 place-items-center rounded-lg transition-colors';
// On a phone a panel spans the screen under the bar (anchored to a button it would run off the edge); from sm it hangs
// under its button.
const panel = 'fixed inset-x-3 top-[calc(var(--header-offset)+0.5rem)] sm:absolute sm:inset-x-auto sm:top-full sm:end-0 sm:mt-2 bg-surface rounded-2xl shadow-xl border border-line z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150';

export function DashboardNavbar({ userType = 'customer', onMenuToggle, drawerOpen }: DashboardNavbarProps) {
  const router = useRouter();
  const t = useT(shellMessages);
  const tSite = useT(siteMessages);
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
    return '/';
  };

  // Theme accents: ink for the kitchen, soft turquoise for the rider, turquoise for customer/admin (dark words on turquoise)
  const accentBg = isRider ? 'var(--brand-soft)' : isSeller ? 'var(--ink-900)' : 'var(--forest-500)';
  const accentFg = isRider ? 'var(--brand-soft-ink)' : isSeller ? 'var(--fg-inverse)' : '#06302B';

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

  // Leave the page first, then end the session: the page's own guards must not see a signed-out visitor and send
  // them to sign in with this page as ?next= (the next person to sign in here would land on it).
  const handleLogout = () => {
    setShowDropdown(false);
    router.replace('/login');
    logout();
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
              ref={menuToggleRef}
              type="button"
              onClick={onMenuToggle}
              aria-label={t('toggleNav')}
              aria-expanded={Boolean(drawerOpen)}
              className="lg:hidden grid h-11 w-11 place-items-center rounded-full text-ink hover:bg-raised transition-colors"
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
              <p className="eyebrow mt-0.5">
                {isSeller ? t('ctxSeller') : isAdmin ? t('ctxAdmin') : isRider ? t('ctxRider') : isHubManager ? t('ctxHub') : t('ctxCustomer')}
              </p>
            </div>
          </Link>
        </div>

        {/* Center - Search Bar (Only for customers) */}
        {isCustomer && (
          <div className="hidden lg:flex flex-1 max-w-lg mx-8">
            <form onSubmit={handleSearch} role="search" className="w-full relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('search')}
                className="w-full min-h-11 ps-10 pe-24 py-2.5 rounded-full text-sm outline-none transition-all bg-page border border-line text-ink placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
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

          {/* Below lg the inline search does not fit: a button opens the dish search instead */}
          {isCustomer && (
            <Link href="/products" aria-label={t('search')} title={t('search')} className={`${iconButton} hidden md:grid lg:hidden text-muted hover:bg-raised hover:text-ink`}>
              <Search className="w-5 h-5" aria-hidden="true" />
            </Link>
          )}

          {/* Community Selector - Only for customers; it keeps its size on a tablet and gives way on a phone */}
          {isCustomer && (
            <div className="flex items-center min-w-0 max-w-[200px] md:shrink-0">
              <CommunitySelector variant="navbar" />
            </div>
          )}

          {/* Tray - Only for customers; on a phone it is in the tab bar */}
          {isCustomer && (
            <Link href="/cart" aria-label={t('cart')} title={t('cart')} className={`${iconButton} hidden md:grid text-muted hover:bg-raised hover:text-ink`}>
              <ShoppingBag className="w-5 h-5" aria-hidden="true" />
              {cartItemCount > 0 && (
                <span className="absolute top-0.5 end-0.5 min-w-5 h-5 px-1 bg-accent text-on-accent text-xs font-bold rounded-full grid place-items-center" aria-hidden="true">
                  {cartItemCount > 9 ? '9+' : cartItemCount}
                </span>
              )}
            </Link>
          )}

          {/* Seller Quick Actions */}

          {/* A customer's phone has the language under Profile; the bar keeps room for the area */}
          <LanguageSwitcher className={isCustomer ? 'hidden sm:inline-flex h-11 px-2' : 'h-11 min-w-11 justify-center px-2 max-[420px]:[&>span]:hidden'} />

          {/* Notifications Panel */}
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={handleToggleNotifications}
              aria-label={t('notifications')}
              aria-expanded={showNotificationsPanel}
              className={`${iconButton} ${showNotificationsPanel ? 'bg-raised text-ink' : 'text-muted hover:bg-raised hover:text-ink'}`}
              title={t('notifications')}
            >
              <Bell className="w-5 h-5" />
              {notificationUnreadCount > 0 && (
                <span className="absolute top-2.5 end-2.5 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" data-testid="bell-unread" />
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {showNotificationsPanel && (
              <div className={`${panel} sm:w-96`}>
                {/* Panel Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-raised">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-ink">{t('notifications')}</span>
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
                      className="min-h-11 text-xs font-medium text-brand-ink hover:underline flex items-center gap-1 transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>{t('markAllRead')}</span>
                    </button>
                  )}
                </div>

                {/* Panel Body */}
                <div className="max-h-80 overflow-y-auto divide-y divide-line">
                  {loadingNotifications ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-muted">
                      <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs">{t('loadingUpdates')}</span>
                    </div>
                  ) : notificationsError && recentNotifications.length === 0 ? (
                    <div className="p-3">
                      <LoadError compact error={notificationsError} onRetry={fetchRecentNotifications} />
                    </div>
                  ) : recentNotifications.length === 0 ? (
                    <div className="py-10 px-4 text-center">
                      <div className="w-10 h-10 rounded-full bg-raised flex items-center justify-center mx-auto mb-2 text-muted">
                        <Bell className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-semibold text-ink">{t('allCaughtUp')}</p>
                      <p className="text-xs text-muted mt-0.5">{t('noNotifications')}</p>
                    </div>
                  ) : (
                    recentNotifications.map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => handleMarkNotificationRead(notif.id, notif.actionUrl)}
                        className={`p-3.5 flex items-start gap-3 hover:bg-raised cursor-pointer transition-colors ${
                          !notif.isRead ? 'bg-brand-soft/40' : ''
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${getNotificationIconBg(notif.type)}`}>
                          {getNotificationIcon(notif.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <p className={`text-xs truncate ${!notif.isRead ? 'font-semibold text-ink' : 'font-medium text-muted'}`}>
                              {notif.title}
                            </p>
                            <span className="text-[11px] text-muted shrink-0">
                              {formatRelativeTime(notif.createdAt, t)}
                            </span>
                          </div>
                          <p className="text-xs text-muted line-clamp-2 leading-relaxed">
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

                {/* Panel Footer: a rider has no full list (the customer page would open the customer menu), so none */}
                {!isRider && (
                  <div className="p-2 border-t border-line bg-raised">
                    <Link
                      href={isSeller ? "/sellers/notifications" : isAdmin ? "/admin/notifications" : "/notifications"}
                      onClick={() => setShowNotificationsPanel(false)}
                      className="w-full min-h-11 px-3 text-center text-xs font-medium text-ink hover:bg-surface rounded-lg transition-colors flex items-center justify-center gap-1 border border-transparent hover:border-line"
                    >
                      <span>{t('viewAllNotifications')}</span>
                      <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}
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
                aria-label={tSite('account')}
                aria-haspopup="menu"
                aria-expanded={showDropdown}
                className="flex min-h-11 items-center gap-2 px-2 py-1 rounded-lg hover:bg-raised transition-colors cursor-pointer"
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
                <svg className="w-4 h-4 text-muted max-[380px]:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            
            {/* Dropdown Menu */}
            {showDropdown && (
              <div className={`${panel} sm:w-72 py-1`}>
                <div className="px-4 py-3 border-b border-line bg-raised">
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
                  <p className="text-xs text-muted truncate mt-0.5" data-ltr>{user?.email}</p>
                </div>


                <div className="py-1">
                  {isSeller && (
                    <Link href="/sellers/settings" className={menuRow}>
                      <Settings className={menuIcon} aria-hidden="true" />
                      {t('settings')}
                    </Link>
                  )}
                  {isCustomer && (
                    <>
                      <Link href="/profile" className={menuRow}>
                        <User className={menuIcon} aria-hidden="true" />
                        {t('myProfile')}
                      </Link>
                      <Link href="/orders" className={menuRow}>
                        <ShoppingBag className={menuIcon} aria-hidden="true" />
                        {t('myOrders')}
                      </Link>
                      <Link href="/profile/addresses" className={menuRow}>
                        <MapPin className={menuIcon} aria-hidden="true" />
                        {t('savedAddresses')}
                      </Link>
                      <Link href="/favorites" className={menuRow}>
                        <Heart className={menuIcon} aria-hidden="true" />
                        {t('favoriteKitchens')}
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
                {/* The kitchen, rider, hub and admin screens stay light whatever is chosen (lib/theme.ts) */}
                {isCustomer && (
                  <div className="px-4 py-3 border-t border-line">
                    <p className="mb-2 text-xs font-medium text-muted">{tSite('appearance')}</p>
                    <ThemeToggle className="[&>button]:min-h-11" />
                  </div>
                )}
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


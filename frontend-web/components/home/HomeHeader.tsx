'use client';

/** The home page's live-status strip and its sticky header: menu, logo, order mode, area, search, tray and account. */
import { useState } from 'react';
import Link from 'next/link';
import { Search, MapPin, Bike, ShoppingBag, Snowflake, ChefHat, ChevronDown, LogOut, Package, LayoutDashboard } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useHydrated } from '@/lib/hooks/use-hydrated';
import { BrandLockup, Mark } from '@/components/ui/Mark';
import { CommunitySelector } from '@/components/community/CommunitySelector';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import { countLabel } from '@/lib/home-feed';
import type { PublicStats } from '@/lib/home-filters';

export default function HomeHeader({
  stats,
  searchQuery,
  onSearch,
  onOpenNav,
  onOpenTray,
  onFrozenHub,
}: {
  stats: PublicStats | null;
  searchQuery: string;
  onSearch: (q: string) => void;
  onOpenNav: () => void;
  onOpenTray: () => void;
  /** The "Frozen hub" order mode also filters the kitchens to frozen. */
  onFrozenHub: () => void;
}) {
  const t = useT(homeMessages);
  const { isAuthenticated, user, logout } = useAuthStore(
    useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user, logout: s.logout })),
  );
  // The tray and the session are read from the browser's storage, which the server's page cannot know: both wait for
  // hydration, so the first render matches the server's (signed out, empty tray) and React does not throw it away.
  const hydrated = useHydrated();
  const storedCount = useCartStore((s) => s.getItemCount());
  const cartCount = hydrated ? storedCount : 0;
  const [orderMode, setOrderMode] = useState<'delivery' | 'pickup' | 'coldchain'>('delivery');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  return (
    <>
      {/* Top Notification / Platform Status Bar. It starts below the status bar, and it covers the header's own status-bar
          padding (the header keeps that padding for when it sticks), so the two do not leave a gap between them. */}
      <div className="relative z-[41] -mb-(--safe-top) bg-[#0C1016] text-white px-4 pt-[calc(0.375rem+var(--safe-top))] pb-1.5 text-xs font-medium border-b border-white/5">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-bold uppercase text-[11px] tracking-wider">{t('platformLive')}</span>
            {stats && stats.kitchens > 0 && (
              <span className="text-slate-300 hidden sm:inline text-xs">
                {t('liveLine', {
                  kitchens: countLabel(t, stats.kitchens, 'liveKitchensOne', 'liveKitchens'),
                  dishes: countLabel(t, stats.dishes, 'liveDishOne', 'liveDishes'),
                })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-300">
            <Link href="/sellers/register" className="text-[#FF5500] hover:text-[#ff7333] font-semibold flex items-center gap-1">
              <ChefHat className="w-3 h-3" />
              <span>{t('openHomeKitchen')}</span>
            </Link>
            <Link href="/riders/dashboard" className="hidden md:inline hover:text-white text-slate-400">
              {t('riderPortal')}
            </Link>
          </div>
        </div>
      </div>

      {/* ============================================================
          MAIN TOP NAVIGATION BAR (Streamlined Nordic/US Standards)
          ============================================================ */}
      <header className="sticky top-0 z-40 pt-(--safe-top) bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3 sm:gap-6">
          {/* Left section: Hamburger & Logo */}
          <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
            <button
              onClick={() => onOpenNav()}
              className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200/80 flex items-center justify-center text-slate-700 transition-colors"
              aria-label={t('openNav')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <Link href="/" className="hover:opacity-95 transition-opacity" aria-label="Nuray">
              {/* Just the mark on small phones, so the header's buttons fit (Urdu labels run longer). */}
              <span className="sm:hidden">
                <Mark size={32} />
              </span>
              <span className="hidden sm:inline">
                <BrandLockup markSize={32} wordSize={22} />
              </span>
            </Link>
          </div>

          {/* Delivery / Pickup Mode Toggle Pill */}
          <div className="hidden lg:flex items-center bg-slate-100 p-0.5 rounded-full border border-slate-200/80 flex-shrink-0">
            <button
              onClick={() => setOrderMode('delivery')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                orderMode === 'delivery' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bike className="w-3.5 h-3.5 text-slate-600" />
              <span>{t('freshDelivery')}</span>
            </button>
            <button
              onClick={() => setOrderMode('pickup')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                orderMode === 'pickup' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5 text-slate-600" />
              <span>{t('pickup')}</span>
            </button>
            <button
              onClick={() => {
                setOrderMode('coldchain');
                onFrozenHub();
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                orderMode === 'coldchain'
                  ? 'bg-cyan-50 text-cyan-900 border border-cyan-300/80 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Snowflake className="w-3.5 h-3.5 text-cyan-600" />
              <span>{t('frozenHub')}</span>
            </button>
          </div>

          {/* Delivery Location Selector */}
          <div className="relative hidden md:block flex-shrink-0">
            <CommunitySelector variant="navbar" />
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-md relative hidden sm:block">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-500 absolute start-3.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full h-10 ps-10 pe-4 rounded-xl bg-slate-50 hover:bg-slate-100 focus:bg-white text-xs font-medium text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:border-[#FF5500] focus:ring-2 focus:ring-orange-500/10 transition-all outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => onSearch('')}
                  aria-label={t('clearSearch')}
                  className="absolute end-3 text-xs text-slate-500 hover:text-slate-700"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Right Action Buttons: Cart Drawer Trigger & Auth */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <LanguageSwitcher className="px-2" />

            {/* Slide-over Cart Button */}
            <button
              onClick={() => onOpenTray()}
              className="relative flex items-center gap-1.5 h-10 px-3 sm:px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-900 border border-slate-200 text-xs font-bold transition-colors"
              aria-label={t('openTray')}
            >
              <ShoppingBag className="w-4 h-4 text-slate-700" />
              <span className="hidden md:inline">{t('tray')}</span>
              {cartCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#FF5500] text-white text-[11px] font-bold flex items-center justify-center shadow-xs">
                  {cartCount}
                </span>
              )}
            </button>

            {/* User Dropdown or Sign in */}
            {hydrated && isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  className="flex items-center gap-2 h-10 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-xs font-semibold text-slate-800 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-[#FF5500] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                    {(user.profile?.fullName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <span className="hidden xl:inline max-w-[80px] truncate">
                    {user.profile?.fullName?.split(' ')[0] || user.email?.split('@')[0]}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {userDropdownOpen && (
                  <div className="absolute end-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 p-1.5 z-50">
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{user.profile?.fullName || t('customer')}</p>
                      <p className="text-[11px] text-slate-500 truncate" data-ltr>
                        {user.email}
                      </p>
                    </div>
                    <Link
                      href="/orders"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#FF5500] transition-colors"
                    >
                      <Package className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('myOrders')}</span>
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#FF5500] transition-colors"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('customerDashboard')}</span>
                    </Link>
                    <Link
                      href="/profile/addresses"
                      onClick={() => setUserDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-orange-50 hover:text-[#FF5500] transition-colors"
                    >
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('savedAddresses')}</span>
                    </Link>
                    <button
                      onClick={() => {
                        setUserDropdownOpen(false);
                        logout();
                      }}
                      className="w-full text-start flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors mt-1 border-t border-slate-100"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-500" />
                      <span>{t('signOut')}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  href="/login"
                  className="h-10 hidden sm:inline-flex items-center px-3 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  {t('signIn')}
                </Link>
                <Link
                  href="/register"
                  className="h-10 inline-flex items-center px-3.5 rounded-xl text-xs font-bold bg-[#FF5500] hover:bg-[#E04400] text-white shadow-2xs transition-colors"
                >
                  {t('join')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

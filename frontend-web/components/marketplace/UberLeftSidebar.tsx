'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  ChefHat,
  Snowflake,
  Flame,
  Tag,
  Star,
  Package,
  LayoutDashboard,
  MapPin,
  Bike,
  LogOut,
  X,
  Sparkles,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth-store';
import { BrandLockup } from '@/components/ui/Mark';
import { useT } from '@/lib/i18n';
import { homeMessages, type HomeKey } from '@/lib/i18n/messages/home';

interface UberLeftSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeFilter?: string;
  onSelectFilter?: (filter: string) => void;
}

export function UberLeftSidebar({
  isOpen,
  onClose,
  activeFilter = 'all',
  onSelectFilter,
}: UberLeftSidebarProps) {
  const pathname = usePathname();
  const t = useT(homeMessages);
  const { isAuthenticated, user, logout } = useAuthStore();

  const mainNavItems: Array<{ label: HomeKey; href: string; icon: typeof Home; id: string }> = [
    { label: 'nav.home', href: '/', icon: Home, id: 'home' },
    { label: 'nav.kitchens', href: '/kitchens', icon: ChefHat, id: 'kitchens' },
    { label: 'nav.products', href: '/products', icon: UtensilsCrossed, id: 'products' },
    { label: 'nav.frozen', href: '/products?productType=frozen', icon: Snowflake, id: 'frozen' },
    { label: 'nav.fresh', href: '/products?productType=fresh', icon: Flame, id: 'fresh' },
    { label: 'nav.offers', href: '/products?offers=true', icon: Tag, id: 'offers' },
    { label: 'nav.top_rated', href: '/products?sort=rating', icon: Star, id: 'top_rated' },
  ];

  const quickCategories: Array<{ label: HomeKey; query: string }> = [
    { label: 'cuisine.biryani', query: 'biryani' },
    { label: 'cuisine.nihari', query: 'nihari' },
    { label: 'cuisine.paratha', query: 'paratha' },
    { label: 'cuisine.kebab', query: 'kebab' },
    { label: 'cuisine.halwa', query: 'halwa' },
    { label: 'cuisine.kheer', query: 'kheer' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 start-0 max-w-full flex pe-10">
        <aside className="w-80 max-w-full bg-white shadow-2xl flex flex-col transform transition-transform ease-out duration-300 animate-in slide-in-from-left">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <Link
              href="/"
              onClick={onClose}
              className="flex items-center gap-2"
            >
              <BrandLockup markSize={28} wordSize={18} />
            </Link>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
              aria-label={t('closeNav')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* User Status Card (if authenticated) */}
          {isAuthenticated && user && (
            <div className="p-3 mx-3 mt-3 rounded-xl bg-orange-50/70 border border-orange-100 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FF5500] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                {(user.profile?.fullName?.[0] || user.email?.[0] || 'U').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  {user.profile?.fullName || t('customer')}
                </p>
                <p className="text-[11px] text-slate-500 font-medium truncate" data-ltr>
                  {user.email}
                </p>
              </div>
            </div>
          )}

          {/* Navigation Body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {/* Primary Platform Feeds */}
            <div className="space-y-0.5">
              <p className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                {t('discover')}
              </p>
              {mainNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span>{t(item.label)}</span>
                  </Link>
                );
              })}
            </div>

            {/* Quick Cuisines */}
            <div className="space-y-1">
              <p className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                {t('popularSearches')}
              </p>
              <div className="grid grid-cols-2 gap-1 px-0.5">
                {quickCategories.map((c) => (
                  <Link
                    key={c.query}
                    href={`/products?search=${c.query}`}
                    onClick={onClose}
                    className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 hover:bg-orange-50 border border-slate-200/60 hover:border-orange-200 text-xs font-medium text-slate-700 hover:text-[#FF5500] transition-colors"
                  >
                    <Sparkles className="w-3 h-3 text-[#FF5500] flex-shrink-0" />
                    <span className="truncate">{t(c.label)}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Customer Account & Orders */}
            <div className="space-y-0.5 pt-3 border-t border-slate-100">
              <p className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                {t('account')}
              </p>
              {isAuthenticated ? (
                <>
                  <Link
                    href="/orders"
                    onClick={onClose}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Package className="w-4 h-4 text-slate-500" />
                    <span>{t('myFoodOrders')}</span>
                  </Link>
                  <Link
                    href="/dashboard"
                    onClick={onClose}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <LayoutDashboard className="w-4 h-4 text-slate-500" />
                    <span>{t('customerDashboard')}</span>
                  </Link>
                  <Link
                    href="/profile/addresses"
                    onClick={onClose}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <MapPin className="w-4 h-4 text-slate-500" />
                    <span>{t('savedAddresses')}</span>
                  </Link>
                </>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <p className="text-xs font-medium text-slate-600">
                    {t('signInPitch')}
                  </p>
                  <div className="flex gap-2">
                    <Link
                      href="/login"
                      onClick={onClose}
                      className="flex-1 text-center py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-800 hover:bg-slate-100 transition-colors"
                    >
                      {t('signIn')}
                    </Link>
                    <Link
                      href="/register"
                      onClick={onClose}
                      className="flex-1 text-center py-1.5 rounded-lg text-xs font-bold bg-[#FF5500] text-white hover:bg-[#E04400] transition-colors shadow-2xs"
                    >
                      {t('join')}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Portals */}
            <div className="pt-3 border-t border-slate-100 space-y-0.5">
              <p className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                {t('portals')}
              </p>
              <Link
                href="/sellers/register"
                onClick={onClose}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#FF5500] hover:bg-orange-50 transition-colors"
              >
                <ChefHat className="w-4 h-4" />
                <span>{t('openHomeKitchen')}</span>
              </Link>
              <Link
                href="/riders/dashboard"
                onClick={onClose}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Bike className="w-4 h-4" />
                <span>{t('coldChainRiderPortal')}</span>
              </Link>
            </div>
          </div>

          {/* Footer */}
          {isAuthenticated && (
            <div className="p-3 border-t border-slate-200 bg-slate-50/70">
              <button
                onClick={() => {
                  onClose();
                  logout();
                }}
                className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t('signOut')}</span>
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

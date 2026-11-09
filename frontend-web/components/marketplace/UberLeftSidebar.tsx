'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChefHat,
  UtensilsCrossed,
  Tag,
  Package,
  Heart,
  Wallet,
  MapPin,
  Bell,
  LifeBuoy,
  Settings,
  Languages,
  Bike,
  LogOut,
  X,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/lib/store/auth-store';
import { BrandLockup } from '@/components/ui/Mark';
import { LOCALE_NAMES, useLocale, useT } from '@/lib/i18n';
import { homeMessages, type HomeKey } from '@/lib/i18n/messages/home';
import { useShallow } from 'zustand/react/shallow';

interface UberLeftSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeFilter?: string;
  onSelectFilter?: (filter: string) => void;
}

type NavItem = { label: HomeKey; href: string; icon: typeof ChefHat; mobileTabBar?: boolean };

const ACCOUNT_ITEMS: NavItem[] = [
  { label: 'myOrders', href: '/orders', icon: Package, mobileTabBar: true },
  { label: 'favourites', href: '/favorites', icon: Heart },
  { label: 'wallet', href: '/wallet', icon: Wallet },
  { label: 'savedAddresses', href: '/profile/addresses', icon: MapPin },
  { label: 'notifications', href: '/notifications', icon: Bell },
];

const BROWSE_ITEMS: NavItem[] = [
  { label: 'nav.kitchens', href: '/kitchens', icon: ChefHat },
  { label: 'nav.products', href: '/products', icon: UtensilsCrossed },
  { label: 'nav.offers', href: '/products?offers=true', icon: Tag },
];

const rowClass = 'flex items-center gap-3 min-h-12 px-3 rounded-xl text-[15px] font-medium transition-colors';
const headingClass = 'px-3 pb-1 text-[13px] font-semibold text-muted';

export function UberLeftSidebar({ isOpen, onClose }: UberLeftSidebarProps) {
  const pathname = usePathname();
  const t = useT(homeMessages);
  const { locale, setLocale } = useLocale();
  const { isAuthenticated, user, logout } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user, logout: s.logout })));

  if (!isOpen) return null;

  const signedIn = isAuthenticated && user;
  // Orders, wallet and the rest are customer pages; a kitchen or rider on the home page has their own menu.
  const isCustomer = signedIn && (user.userType ?? 'customer') === 'customer';
  const otherLocale = locale === 'ur' ? 'en' : 'ur';
  const name = user?.profile?.fullName || t('customer');

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onClose}
        aria-current={active ? 'page' : undefined}
        className={`${rowClass} ${item.mobileTabBar ? 'max-md:hidden ' : ''}${active ? 'bg-brand-soft text-brand-soft-ink' : 'text-ink hover:bg-raised'}`}
      >
        <Icon className="w-5 h-5 flex-shrink-0 text-muted" />
        <span>{t(item.label)}</span>
      </Link>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-2xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 start-0 max-w-full flex pe-10">
        <aside className="w-80 max-w-full pt-(--safe-top) pb-(--safe-bottom) ps-(--safe-start) bg-surface shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
          <div className="px-4 h-16 flex items-center justify-between">
            <Link href="/" onClick={onClose} className="flex items-center">
              <BrandLockup markSize={28} wordSize={18} />
            </Link>
            <button
              onClick={onClose}
              className="w-11 h-11 -me-2 rounded-xl flex items-center justify-center text-muted hover:text-ink hover:bg-raised transition-colors"
              aria-label={t('closeNav')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-5">
            {signedIn ? (
              <Link
                href="/profile"
                onClick={onClose}
                className="flex items-center gap-3 p-3 rounded-2xl bg-raised hover:bg-line/60 transition-colors"
              >
                <span className="w-11 h-11 rounded-full bg-brand text-on-brand flex items-center justify-center font-bold text-base flex-shrink-0">
                  {(user.profile?.fullName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-semibold text-ink truncate">{name}</span>
                  <span className="block text-[13px] text-muted">{t('viewProfile')}</span>
                </span>
                <ChevronRight className="w-5 h-5 text-muted flex-shrink-0 rtl:rotate-180" />
              </Link>
            ) : (
              <div className="p-4 rounded-2xl bg-raised space-y-3">
                <p className="text-[15px] text-ink">{t('signInPitch')}</p>
                <div className="flex gap-2">
                  <Link
                    href="/login"
                    onClick={onClose}
                    className="flex-1 inline-flex h-11 items-center justify-center rounded-xl text-[15px] font-semibold bg-brand text-on-brand hover:bg-brand-500"
                  >
                    {t('signIn')}
                  </Link>
                  <Link
                    href="/register"
                    onClick={onClose}
                    className="flex-1 inline-flex h-11 items-center justify-center rounded-xl text-[15px] font-semibold border border-line-strong text-ink hover:bg-surface"
                  >
                    {t('join')}
                  </Link>
                </div>
              </div>
            )}

            {isCustomer && (
              <nav aria-label={t('yourAccount')}>
                <p className={headingClass}>{t('yourAccount')}</p>
                {ACCOUNT_ITEMS.map(renderItem)}
              </nav>
            )}

            <nav aria-label={t('browse')}>
              <p className={headingClass}>{t('browse')}</p>
              {BROWSE_ITEMS.map(renderItem)}
            </nav>

            <div>
              <p className={headingClass}>{t('helpAndSettings')}</p>
              {renderItem({ label: 'helpSupport', href: '/help', icon: LifeBuoy })}
              {signedIn && renderItem({ label: 'settings', href: '/profile', icon: Settings })}
              <button
                type="button"
                onClick={() => setLocale(otherLocale)}
                className={`${rowClass} w-full text-ink hover:bg-raised`}
              >
                <Languages className="w-5 h-5 flex-shrink-0 text-muted" />
                <span className="flex-1 text-start">{t('language')}</span>
                <span lang={otherLocale} className="text-[13px] font-semibold text-brand-ink">{LOCALE_NAMES[otherLocale]}</span>
              </button>
            </div>

            {(!signedIn || isCustomer) && (
              <div className="pt-4 border-t border-line">
                {renderItem({ label: 'cookWithNuray', href: '/sellers/register', icon: ChefHat })}
                {renderItem({ label: 'deliverWithNuray', href: '/register?user_type=rider', icon: Bike })}
              </div>
            )}
          </div>

          {signedIn && (
            <div className="p-3 border-t border-line">
              <button
                onClick={() => {
                  onClose();
                  logout();
                }}
                className={`${rowClass} w-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40`}
              >
                <LogOut className="w-5 h-5 flex-shrink-0" />
                <span>{t('signOut')}</span>
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

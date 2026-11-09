'use client';

/**
 * The phone tab bar, shown below md: Home, Orders, Tray, Profile for people ordering food, and the kitchen's and the
 * rider's own tabs on their pages (lib/tab-bar.ts decides which and where). It marks <html data-tabbar="on"> so bars
 * that float at the bottom of a page sit above it.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bike, Home, ReceiptText, Settings, ShoppingBag, UserRound, UtensilsCrossed, Wallet } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useHydrated } from '@/lib/hooks/use-hydrated';
import { useT } from '@/lib/i18n';
import { siteMessages } from '@/lib/i18n/messages/site';
import { loginUrlFor } from '@/lib/auth-redirect';
import { activeCustomerTab, activeRiderTab, activeSellerTab, tabBarFor, type TabBarRole } from '@/lib/tab-bar';
import { cn } from '@/lib/utils';

interface Tab {
  id: string;
  href: string;
  label: string;
  Icon: typeof Home;
  count?: number;
}

const GRID_COLS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };

const TEST_IDS: Record<TabBarRole, string> = {
  customer: 'customer-tab-bar',
  seller: 'seller-tab-bar',
  rider: 'rider-tab-bar',
};

export function PhoneTabBar() {
  const t = useT(siteMessages);
  const pathname = usePathname() || '/';
  const hydrated = useHydrated();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const storedCount = useCartStore((s) => s.getItemCount());
  const signedIn = hydrated && isAuthenticated && !!user;
  const role = tabBarFor(pathname, signedIn ? user?.userType : null);
  const count = hydrated ? storedCount : 0;

  useEffect(() => {
    const root = document.documentElement;
    if (role) root.setAttribute('data-tabbar', 'on');
    else root.removeAttribute('data-tabbar');
    return () => root.removeAttribute('data-tabbar');
  }, [role]);

  if (!role) return null;

  const signInFirst = (path: string) => (signedIn ? path : loginUrlFor(path));
  let tabs: Tab[];
  let active: string | null;
  let navLabel: string;
  if (role === 'seller') {
    tabs = [
      { id: 'home', href: '/sellers/dashboard', label: t('tabHome'), Icon: Home },
      { id: 'orders', href: '/sellers/orders', label: t('tabOrders'), Icon: ReceiptText },
      { id: 'menu', href: '/sellers/products', label: t('tabMenu'), Icon: UtensilsCrossed },
      { id: 'earnings', href: '/sellers/earnings', label: t('tabEarnings'), Icon: Wallet },
      { id: 'settings', href: '/sellers/settings', label: t('tabSettings'), Icon: Settings },
    ];
    active = activeSellerTab(pathname);
    navLabel = t('kitchenNav');
  } else if (role === 'rider') {
    tabs = [
      { id: 'deliveries', href: '/riders/dashboard', label: t('tabDeliveries'), Icon: Bike },
      { id: 'earnings', href: '/riders/earnings', label: t('tabEarnings'), Icon: Wallet },
      { id: 'settings', href: '/profile', label: t('tabSettings'), Icon: Settings },
    ];
    active = activeRiderTab(pathname);
    navLabel = t('riderNav');
  } else {
    tabs = [
      { id: 'home', href: '/', label: t('tabHome'), Icon: Home },
      { id: 'orders', href: signInFirst('/orders'), label: t('tabOrders'), Icon: ReceiptText },
      { id: 'tray', href: '/cart', label: t('tabTray'), Icon: ShoppingBag, count },
      { id: 'profile', href: signInFirst('/profile'), label: t('tabProfile'), Icon: UserRound },
    ];
    active = activeCustomerTab(pathname);
    navLabel = t('mainNav');
  }

  return (
    <>
      {/* Keeps the end of the page clear of the bar */}
      <div aria-hidden className="h-[calc(4rem+var(--safe-bottom))] md:hidden" />
      <nav
        aria-label={navLabel}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-surface/95 pb-(--safe-bottom) backdrop-blur-md md:hidden',
          GRID_COLS[tabs.length],
        )}
        data-testid={TEST_IDS[role]}
      >
        {tabs.map(({ id, href, label, Icon, count: badge }) => {
          const current = id === active;
          return (
            <Link
              key={id}
              href={href}
              aria-current={current ? 'page' : undefined}
              aria-label={badge ? t('trayWithCount', { count: badge }) : label}
              className={cn(
                'relative flex h-16 flex-col items-center justify-center gap-0.5 text-xs active:bg-raised',
                current ? 'font-bold text-brand-soft-ink' : 'font-medium text-muted',
              )}
            >
              {/* The current tab's icon sits on a soft turquoise pill: colour alone is easy to miss in sunlight. */}
              <span className={cn('grid h-7 w-14 place-items-center rounded-full transition-colors', current && 'bg-brand-soft')}>
                <Icon className="h-[22px] w-[22px]" strokeWidth={current ? 2.4 : 2} aria-hidden />
              </span>
              {/* A leading- class lets the Urdu rule in globals.css give Nastaliq its taller line, so no descender is cut off */}
              <span aria-hidden className="leading-4">{label}</span>
              {!!badge && (
                <span aria-hidden className="absolute top-1.5 start-[calc(50%+6px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-on-accent tabular-nums">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

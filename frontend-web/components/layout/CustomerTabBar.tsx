'use client';

/**
 * The phone tab bar for people ordering food: Home, Orders, Tray, Profile. Shown below md on the customer pages
 * (lib/tab-bar.ts decides where); it marks <html data-tabbar="on"> so bars that float at the bottom of a page sit above it.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ReceiptText, ShoppingBag, UserRound } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useHydrated } from '@/lib/hooks/use-hydrated';
import { useT } from '@/lib/i18n';
import { siteMessages } from '@/lib/i18n/messages/site';
import { loginUrlFor } from '@/lib/auth-redirect';
import { activeCustomerTab, showsCustomerTabBar, type CustomerTab } from '@/lib/tab-bar';
import { cn } from '@/lib/utils';

export function CustomerTabBar() {
  const t = useT(siteMessages);
  const pathname = usePathname() || '/';
  const hydrated = useHydrated();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const storedCount = useCartStore((s) => s.getItemCount());
  const signedIn = hydrated && isAuthenticated && !!user;
  const visible = showsCustomerTabBar(pathname, signedIn ? user?.userType : null);
  const count = hydrated ? storedCount : 0;
  const active = activeCustomerTab(pathname);

  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.setAttribute('data-tabbar', 'on');
    else root.removeAttribute('data-tabbar');
    return () => root.removeAttribute('data-tabbar');
  }, [visible]);

  if (!visible) return null;

  const signInFirst = (path: string) => (signedIn ? path : loginUrlFor(path));
  const tabs: { id: CustomerTab; href: string; label: string; Icon: typeof Home }[] = [
    { id: 'home', href: '/', label: t('tabHome'), Icon: Home },
    { id: 'orders', href: signInFirst('/orders'), label: t('tabOrders'), Icon: ReceiptText },
    { id: 'tray', href: '/cart', label: count > 0 ? t('trayWithCount', { count }) : t('tabTray'), Icon: ShoppingBag },
    { id: 'profile', href: signInFirst('/profile'), label: t('tabProfile'), Icon: UserRound },
  ];

  return (
    <>
      {/* Keeps the end of the page clear of the bar */}
      <div aria-hidden className="h-[calc(4rem+var(--safe-bottom))] md:hidden" />
      <nav
        aria-label={t('mainNav')}
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface/95 pb-(--safe-bottom) backdrop-blur-md md:hidden"
        data-testid="customer-tab-bar"
      >
        {tabs.map(({ id, href, label, Icon }) => {
          const current = id === active;
          return (
            <Link
              key={id}
              href={href}
              aria-current={current ? 'page' : undefined}
              aria-label={label}
              className={cn(
                'relative flex h-16 flex-col items-center justify-center gap-1 text-[11px]',
                current ? 'font-extrabold text-brand-ink' : 'font-semibold text-muted',
              )}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={current ? 2.4 : 2} aria-hidden />
              <span aria-hidden>{id === 'tray' ? t('tabTray') : label}</span>
              {id === 'tray' && count > 0 && (
                <span aria-hidden className="absolute top-2 start-[calc(50%+4px)] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-extrabold text-on-accent">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

'use client';

/**
 * The header of the customer-facing pages (home, kitchens, dishes, a kitchen's menu): logo, area, the main links, an
 * optional search, language, appearance, tray and account. One component, so the pages cannot drift apart again.
 * On a phone the tray, orders and profile live in the tab bar (PhoneTabBar), so the header keeps to the essentials.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LayoutDashboard, LogOut, Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { useHydrated } from '@/lib/hooks/use-hydrated';
import { useT } from '@/lib/i18n';
import { siteMessages } from '@/lib/i18n/messages/site';
import { BrandLockup, Mark } from '@/components/ui/Mark';
import { CommunitySelector } from '@/components/community/CommunitySelector';
import { LanguageSwitcher } from '@/components/i18n/LanguageSwitcher';
import { ThemeButton } from '@/components/layout/ThemeToggle';
import { CustomerAccountMenu } from '@/components/layout/CustomerAccountMenu';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { UberLeftSidebar } from '@/components/marketplace/UberLeftSidebar';
import { cn, homeFor } from '@/lib/utils';

export interface SiteHeaderProps {
  /** The dishes page's own search: its results follow the box in place. Without it, Enter opens the results on /products. */
  search?: { value: string; onChange: (value: string) => void };
  /** Opens the tray drawer; without it the tray button goes to /cart. */
  onOpenTray?: () => void;
}

/** A small menu that closes on a click outside it or on Escape. */
function Popover({ button, children, label }: { button: (open: boolean, toggle: () => void) => ReactNode; children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      {button(open, () => setOpen((v) => !v))}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          data-top-panel
          className="absolute end-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-[var(--shadow-hover)]"
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('a')) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// Borderless, as in the staff top bar: the bar's own line is enough edge, a frame on every button is noise.
const iconButton =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink transition-colors hover:bg-raised';

export function SiteHeader({ search, onOpenTray }: SiteHeaderProps) {
  const t = useT(siteMessages);
  const [navOpen, setNavOpen] = useState(false);
  const router = useRouter();
  const [ownQuery, setOwnQuery] = useState('');
  const query = search ? search.value : ownQuery;
  const setQuery = search ? search.onChange : setOwnQuery;
  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q && !search) router.push(`/products?search=${encodeURIComponent(q)}`);
  };
  const { isAuthenticated, user, logout } = useAuthStore(
    useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user, logout: s.logout })),
  );
  // The tray and the session come from the browser's storage: both wait for hydration so the first render matches the server's.
  const hydrated = useHydrated();
  const storedCount = useCartStore((s) => s.getItemCount());
  const cartCount = hydrated ? storedCount : 0;
  const signedIn = hydrated && isAuthenticated && !!user;
  const name = user?.profile?.fullName || user?.email?.split('@')[0] || '';
  const isCustomer = (user?.userType ?? 'customer') === 'customer';

  const trayInner = (
    <>
      <ShoppingBag className="h-[18px] w-[18px]" aria-hidden />
      <span>{t('tray')}</span>
      {cartCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-on-accent tabular-nums">
          {cartCount > 9 ? '9+' : cartCount}
        </span>
      )}
    </>
  );
  // Signed out, Sign in is the one solid button in the bar and the tray steps back beside it.
  const trayClass = cn(
    'hidden md:inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors',
    signedIn ? 'bg-brand text-on-brand hover:bg-brand-500' : 'border border-line-strong text-ink hover:bg-raised',
  );
  const trayLabel = cartCount > 0 ? t('trayWithCount', { count: cartCount }) : t('tray');

  return (
    <>
      <UberLeftSidebar isOpen={navOpen} onClose={() => setNavOpen(false)} />
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 pt-(--safe-top) backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-1 px-4 sm:gap-4 sm:px-8">
          <button type="button" onClick={() => setNavOpen(true)} aria-label={t('openMenu')} className={iconButton}>
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <Link href="/" aria-label={t('home')} className="shrink-0 inline-flex items-center min-h-11 min-w-11">
            <span className="sm:hidden">
              <Mark size={36} />
            </span>
            <span className="hidden sm:inline">
              <BrandLockup markSize={36} wordSize={24} />
            </span>
          </Link>

          <div className="min-w-0 shrink">
            <CommunitySelector variant="navbar" />
          </div>

          {/* Only the widest bar has room for the links beside the search box. */}
          <nav aria-label={t('mainNav')} className="hidden items-center gap-1 xl:flex">
            <Link href="/kitchens" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-raised">
              {t('kitchens')}
            </Link>
            <Link href="/products" className="rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-raised">
              {t('dishes')}
            </Link>
          </nav>

          <form role="search" onSubmit={submitSearch} className="relative ms-auto hidden max-w-md flex-1 items-center sm:flex">
            <label htmlFor="site-search" className="sr-only">{t('searchLabel')}</label>
            <Search className="pointer-events-none absolute start-3.5 h-[18px] w-[18px] text-muted" aria-hidden />
            <input
              id="site-search"
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-11 w-full rounded-xl border border-line bg-raised ps-11 pe-10 text-sm font-medium text-ink outline-none transition-colors placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none focus:border-brand focus:bg-surface focus:ring-3 focus:ring-brand/30"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={t('clearSearch')} className="absolute end-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-ink">
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </form>

          <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
            {/* A signed-in customer finds the language in the account menu. */}
            {!(signedIn && isCustomer) && <LanguageSwitcher className="h-11 shrink-0 rounded-xl px-3 max-sm:[&>span]:hidden" />}
            <ThemeButton className={iconButton} />

            {onOpenTray ? (
              <button type="button" onClick={onOpenTray} aria-label={trayLabel} className={trayClass}>
                {trayInner}
              </button>
            ) : (
              <Link href="/cart" aria-label={trayLabel} className={trayClass}>
                {trayInner}
              </Link>
            )}

            {signedIn && isCustomer && <NotificationBell allHref="/notifications" />}

            {signedIn ? (
              <Popover
                label={t('account')}
                button={(open, toggle) => (
                  <button type="button" onClick={toggle} aria-expanded={open} aria-label={t('account')} className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl sm:ps-1 sm:pe-2 hover:bg-raised">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-soft-ink">
                      {(name[0] || 'U').toUpperCase()}
                    </span>
                    <ChevronDown className="hidden h-4 w-4 text-muted sm:block" aria-hidden />
                  </button>
                )}
              >
                {isCustomer ? (
                  <CustomerAccountMenu name={name} email={user?.email} onSignOut={() => logout()} />
                ) : (
                  <>
                    <Link href={homeFor(user?.userType)} className="flex h-11 items-center gap-3 px-4 text-sm text-ink hover:bg-raised">
                      <LayoutDashboard className="h-4 w-4 text-muted" aria-hidden />
                      {t('dashboard')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => logout()}
                      className="flex h-11 w-full items-center gap-3 border-t border-line px-4 text-start text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" aria-hidden />
                      {t('signOut')}
                    </button>
                  </>
                )}
              </Popover>
            ) : (
              <>
                {/* On a phone there is room for one, and only as an icon where the account button sits once signed in, so the
                    area beside it stays readable: most people opening the app already have an account, and the sign-in page
                    links to sign-up. */}
                <Link href="/register" className="hidden h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-semibold text-ink hover:bg-raised sm:inline-flex">
                  {t('join')}
                </Link>
                <Link
                  href="/login"
                  aria-label={t('signIn')}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-semibold text-on-brand hover:bg-brand-500 sm:w-auto sm:px-4"
                >
                  <UserRound className="h-5 w-5 sm:hidden" aria-hidden />
                  <span className="hidden sm:inline">{t('signIn')}</span>
                </Link>
              </>
            )}
          </div>
        </div>

        <form role="search" onSubmit={submitSearch} className="px-4 pb-3 sm:hidden">
          <label className="relative flex items-center">
            <span className="sr-only">{t('searchLabel')}</span>
            <Search className="pointer-events-none absolute start-3.5 h-[18px] w-[18px] text-muted" aria-hidden />
            <input
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="h-12 w-full rounded-xl border border-line bg-raised ps-11 pe-4 text-base font-medium text-ink outline-none placeholder:text-muted focus:border-brand focus:bg-surface focus:ring-3 focus:ring-brand/30"
            />
          </label>
        </form>
      </header>
    </>
  );
}

'use client';

/**
 * The customer's account menu, the same in the header of the browsing pages (SiteHeader) and of the signed-in pages
 * (DashboardNavbar). The page names come from the side menu's list (navMessages), so a page is called one thing everywhere.
 */
import Link from 'next/link';
import { Heart, LifeBuoy, LogOut, MapPin, ReceiptText, UserRound, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { navMessages } from '@/lib/i18n/messages/nav';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { siteMessages } from '@/lib/i18n/messages/site';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export const CUSTOMER_ACCOUNT_LINKS: { name: keyof typeof navMessages.en; href: string; Icon: LucideIcon }[] = [
  { name: 'My profile', href: '/profile', Icon: UserRound },
  { name: 'My orders', href: '/orders', Icon: ReceiptText },
  { name: 'Saved addresses', href: '/profile/addresses', Icon: MapPin },
  { name: 'Saved kitchens', href: '/favorites', Icon: Heart },
  { name: 'Help and support', href: '/support', Icon: LifeBuoy },
];

const row = 'flex h-11 items-center gap-3 px-4 text-sm text-ink hover:bg-raised transition-colors';

export function CustomerAccountMenu({ name, email, onSignOut }: { name: string; email?: string; onSignOut: () => void }) {
  const tNav = useT(navMessages);
  const tShell = useT(shellMessages);
  const tSite = useT(siteMessages);
  return (
    <>
      <div className="px-4 py-3 border-b border-line">
        <div className="flex items-center justify-between gap-2">
          <p className="text-ink font-semibold truncate text-sm">{name}</p>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full shrink-0 bg-raised text-muted">{tShell('roleCustomer')}</span>
        </div>
        {email && (
          <p className="text-xs text-muted truncate mt-0.5" data-ltr>
            {email}
          </p>
        )}
      </div>
      <div className="py-1">
        {CUSTOMER_ACCOUNT_LINKS.map(({ name: page, href, Icon }) => (
          <Link key={href} href={href} className={row}>
            <Icon className="w-4 h-4 text-muted" aria-hidden />
            {tNav(page)}
          </Link>
        ))}
      </div>
      <div className="px-4 py-3 border-t border-line">
        <p className="mb-2 text-xs font-medium text-muted">{tSite('appearance')}</p>
        <ThemeToggle className="[&>button]:min-h-11" />
      </div>
      <div className="py-1 border-t border-line">
        <button type="button" onClick={onSignOut} className={`${row} w-full font-medium text-red-700 hover:bg-red-50`}>
          <LogOut className="w-4 h-4" aria-hidden />
          {tSite('signOut')}
        </button>
      </div>
    </>
  );
}

'use client';

import Link from 'next/link';
import { BrandLockup } from '@/components/ui/Mark';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';

export default function HomeFooter() {
  const t = useT(homeMessages);
  return (
    <footer className="bg-surface border-t border-line mt-4 py-10">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandLockup markSize={28} wordSize={20} />
            <span className="text-xs text-line-strong">|</span>
            <span className="text-xs font-medium text-muted">{t('footerTagline')}</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-muted">
            <Link href="/kitchens" className="hover:text-brand-ink">
              {t('allKitchens')}
            </Link>
            <Link href="/products" className="hover:text-brand-ink">
              {t('dishesPacks')}
            </Link>
            <Link href="/products?productType=frozen" className="hover:text-brand-ink">
              {t('frozenPantry')}
            </Link>
            <Link href="/sellers/register" className="hover:text-brand-ink">
              {t('openKitchen')}
            </Link>
            <Link href="/riders/dashboard" className="hover:text-brand-ink">
              {t('riderPortal')}
            </Link>
            <Link href="/help" className="hover:text-brand-ink">
              {t('help')}
            </Link>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-line flex flex-col sm:flex-row items-center justify-between text-xs text-muted font-normal gap-2">
          <p>{t('rights', { year: new Date().getFullYear() })}</p>
          <nav aria-label={t('legal')} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link href="/terms" className="hover:text-brand-ink">
              {t('terms')}
            </Link>
            <Link href="/privacy" className="hover:text-brand-ink">
              {t('privacy')}
            </Link>
            <Link href="/refund-policy" className="hover:text-brand-ink">
              {t('refund')}
            </Link>
          </nav>
          <p>{t('cities')}</p>
        </div>
      </div>
    </footer>
  );
}

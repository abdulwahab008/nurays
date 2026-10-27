'use client';

/**
 * The top of the home page: what Nuray is in one line, and the two ways in (kitchens or dishes). On a desktop the real
 * photos of up to three popular dishes sit beside it; nothing is shown there until there are dishes to show.
 */
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { CoverImage } from '@/components/ui/CoverImage';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import type { HomeDish } from '@/lib/home-filters';

export default function HomeHero({ dishes }: { dishes: HomeDish[] }) {
  const t = useT(homeMessages);
  const shown = dishes.filter((d) => d.photo).slice(0, 3);
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-6 sm:pt-10 pb-2">
      <div className={`grid gap-8 items-center ${shown.length ? 'lg:grid-cols-[6fr_5fr]' : ''}`}>
        <div className="flex flex-col gap-4 sm:gap-5">
          <span className="self-start px-3 py-1.5 rounded-full bg-accent-soft text-accent-soft-ink text-xs sm:text-[13px] font-extrabold">
            {t('heroBadge')}
          </span>
          <h1 className="text-[28px] leading-[1.15] sm:text-5xl lg:text-[56px] sm:leading-[1.05] font-extrabold tracking-tight text-ink">
            <span className="sm:hidden">{t('heroTitlePhone')}</span>
            <span className="hidden sm:inline">{t('heroTitle')}</span>
          </h1>
          <p className="text-[15px] sm:text-lg text-muted leading-relaxed max-w-[560px]">{t('heroBody')}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <a href="#kitchens" className="inline-flex items-center gap-1.5 h-12 px-5 rounded-xl bg-brand text-on-brand text-[15px] font-extrabold hover:bg-brand-500 transition-colors">
              {t('heroFind')}
              <ChevronRight className="rtl:-scale-x-100 w-4 h-4" aria-hidden />
            </a>
            <Link href="/products" className="inline-flex items-center h-12 px-5 rounded-xl border border-line-strong text-ink text-[15px] font-bold hover:bg-raised transition-colors">
              {t('heroDishes')}
            </Link>
          </div>
        </div>

        {shown.length > 0 && (
          <div className="hidden lg:grid grid-cols-2 grid-rows-2 gap-4 h-[400px]" aria-hidden>
            {shown.map((d, i) => (
              <Link
                key={d.id}
                href={`/products/${d.id}`}
                tabIndex={-1}
                className={`relative rounded-3xl overflow-hidden bg-raised ${i === 0 ? 'row-span-2' : ''} ${shown.length === 2 && i === 1 ? 'row-span-2' : ''}`}
              >
                <CoverImage src={d.photo} alt="" label={d.name} size="lg" className="w-full h-full" />
                <span className="absolute start-3 bottom-3 end-3 rounded-2xl bg-surface/95 px-3 py-2 shadow-[var(--shadow-card)]">
                  <span className="block text-sm font-extrabold text-ink truncate">{d.name}</span>
                  <span className="block text-xs text-muted truncate">{t('heroFrom', { kitchen: d.kitchenName })}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

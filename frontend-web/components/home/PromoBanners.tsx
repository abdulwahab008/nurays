'use client';

/** The three banners under the filters: home food, open a home kitchen, the frozen pantry. */
import Link from 'next/link';
import { Flame, ChefHat, Snowflake, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';

export default function PromoBanners() {
  const t = useT(homeMessages);
  return (
    <section className="max-w-[1440px] mx-auto px-4 sm:px-8 pt-6 pb-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Banner 1: Authentic Home Food */}
        <div className="relative rounded-2xl p-5 sm:p-6 overflow-hidden bg-gradient-to-br from-[#EA580C] via-[#C2410C] to-[#9A3412] text-white shadow-md flex flex-col justify-between min-h-[155px] group">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/25 text-[11px] font-bold uppercase tracking-wider mb-2">
              <Flame className="w-3 h-3 text-orange-200" />
              <span>{t('b1Tag')}</span>
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight text-white">{t('b1Title')}</h2>
            <p className="text-xs text-orange-100 mt-1 max-w-[260px] font-normal leading-relaxed">{t('b1Body')}</p>
          </div>
          <div className="relative z-10 pt-3">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
            >
              <span>{t('b1Cta')}</span>
              <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Banner 2: Open a home kitchen */}
        <div className="relative rounded-2xl p-5 sm:p-6 overflow-hidden bg-gradient-to-br from-[#B45309] via-[#92400E] to-[#78350F] text-white shadow-md flex flex-col justify-between min-h-[155px] group">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/30 text-[11px] font-bold uppercase tracking-wider mb-2">
              <ChefHat className="w-3 h-3 text-amber-200" />
              <span>{t('b2Tag')}</span>
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight text-white">{t('b2Title')}</h2>
            <p className="text-xs text-amber-100 mt-1 max-w-[260px] font-normal leading-relaxed">{t('b2Body')}</p>
          </div>
          <div className="relative z-10 pt-3">
            <Link
              href="/sellers/register"
              className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
            >
              <span>{t('b2Cta')}</span>
              <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Banner 3: Frozen pantry */}
        <div className="relative rounded-2xl p-5 sm:p-6 overflow-hidden bg-gradient-to-br from-[#0284C7] via-[#0369A1] to-[#075985] text-white shadow-md flex flex-col justify-between min-h-[155px] group">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-black/30 text-[11px] font-bold uppercase tracking-wider mb-2">
              <Snowflake className="w-3 h-3 text-cyan-200" />
              <span>{t('b3Tag')}</span>
            </span>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight text-white">{t('b3Title')}</h2>
            <p className="text-xs text-cyan-100 mt-1 max-w-[260px] font-normal leading-relaxed">{t('b3Body')}</p>
          </div>
          <div className="relative z-10 pt-3">
            <Link
              href="/products?productType=frozen"
              className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-black text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
            >
              <span>{t('b3Cta')}</span>
              <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

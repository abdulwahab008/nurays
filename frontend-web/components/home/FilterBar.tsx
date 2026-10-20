'use client';

/** The cuisine carousel and the sticky row of kitchen filter chips. */
import Link from 'next/link';
import { Star, Clock, Tag, Bike, Snowflake, ChefHat, ChevronRight, type LucideIcon } from 'lucide-react';
import { CuisineCarousel } from '@/components/marketplace/CuisineCarousel';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import { QUICK_PREP_MAX_MINUTES, TOP_RATED_MIN_RATING, type KitchenFilter } from '@/lib/home-filters';

export default function FilterBar({
  selectedCuisine,
  onSelectCuisine,
  selectedFilter,
  onSelectFilter,
}: {
  selectedCuisine: string;
  onSelectCuisine: (q: string) => void;
  selectedFilter: KitchenFilter;
  onSelectFilter: (f: KitchenFilter) => void;
}) {
  const t = useT(homeMessages);
  const filterChips: Array<{ id: KitchenFilter; label: string; icon: LucideIcon }> = [
    { id: 'all', label: t('fAll'), icon: ChefHat },
    { id: 'top_rated', label: t('fTopRated', { n: TOP_RATED_MIN_RATING }), icon: Star },
    { id: 'fast', label: t('fFast', { n: QUICK_PREP_MAX_MINUTES }), icon: Clock },
    { id: 'free_delivery', label: t('fFree'), icon: Bike },
    { id: 'deals', label: t('fDeals'), icon: Tag },
    { id: 'frozen', label: t('fFrozen'), icon: Snowflake },
  ];

  return (
    <>
      {/* ============================================================
        CUISINES & CRAVINGS CAROUSEL
        ============================================================ */}
      <section className="bg-white border-b border-slate-200/80 py-3">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8">
          <CuisineCarousel
            selectedCuisine={selectedCuisine}
            onSelectCuisine={(q) => {
              onSelectCuisine(selectedCuisine === q ? '' : q);
            }}
          />
        </div>
      </section>

      {/* ============================================================
        QUICK FILTER CHIPS BAR
        ============================================================ */}
      <section className="bg-white/90 backdrop-blur-md border-b border-slate-200/70 py-2.5 sticky top-(--header-offset) z-30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {filterChips.map((chip) => {
              const Icon = chip.icon;
              const isActive = selectedFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => onSelectFilter(chip.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          <Link
            href="/products"
            className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-[#FF5500] hover:text-[#e04400] whitespace-nowrap"
          >
            <span>{t('browseAllMenus')}</span>
            <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
          </Link>
        </div>
      </section>
    </>
  );
}

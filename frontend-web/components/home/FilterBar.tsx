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
      <section className="pt-4 pb-1">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
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
      <section className="bg-page/95 backdrop-blur-md py-3 sticky top-(--header-offset) z-30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
            {filterChips.map((chip) => {
              const Icon = chip.icon;
              const isActive = selectedFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  onClick={() => onSelectFilter(chip.id)}
                  aria-pressed={isActive}
                  className={`flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                    isActive ? 'bg-ink text-page' : 'bg-surface hover:bg-raised text-ink border border-line'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          <Link
            href="/products"
            className="hidden sm:inline-flex items-center gap-1 text-sm font-bold text-brand-ink hover:underline whitespace-nowrap"
          >
            <span>{t('browseAllMenus')}</span>
            <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
          </Link>
        </div>
      </section>
    </>
  );
}

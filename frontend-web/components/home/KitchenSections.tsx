'use client';

/** The home page's kitchens: trending now, the avatar row, and the grid of kitchen cards with its states. */
import Link from 'next/link';
import { Flame, ChevronRight, Sparkles, ChefHat, Heart, Clock, ShieldCheck, MapPin, Star, Bike } from 'lucide-react';
import { CoverImage } from '@/components/ui/CoverImage';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import { countLabel, kitchenCaption } from '@/lib/home-feed';
import { formatCount, type HomeKitchen, type LoadState } from '@/lib/home-filters';
import { KitchenAvatarSkeleton, KitchenCardSkeleton, RetryButton, SectionNotice } from './HomeStates';

type ToggleFavorite = (kitchenId: string, e: React.MouseEvent) => void;

/** Most ordered from right now (recent orders count most; see backend utils/ranking.ts). Hidden until there is real recent demand. */
export function TrendingKitchens({ kitchens: trendingKitchens }: { kitchens: HomeKitchen[] }) {
  const t = useT(homeMessages);
  if (trendingKitchens.length === 0) return null;
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-6" data-testid="trending-kitchens">
      <div className="mb-3">
        <h3 className="text-lg sm:text-[22px] font-extrabold text-ink tracking-tight flex items-center gap-1.5">
          <Flame className="w-5 h-5 text-brand-ink" />
          {t('trendingKitchens')}
        </h3>
        <p className="text-xs text-muted font-medium mt-0.5">{t('trendingKitchensSub')}</p>
      </div>
      <div className="flex items-stretch gap-3 overflow-x-auto scrollbar-none py-1 px-0.5">
        {trendingKitchens.map((k, i) => (
          <Link
            key={k.id}
            href={k.href}
            className="flex-shrink-0 w-56 flex items-center gap-3 p-2.5 rounded-2xl bg-surface border border-line hover:border-line-strong transition-colors group"
          >
            <span className="w-6 text-center text-lg font-black text-brand-ink">{i + 1}</span>
            <div className="relative w-12 h-12 rounded-full overflow-hidden border border-line flex-shrink-0">
              <CoverImage src={k.avatar || k.coverPhoto} alt={k.name} label={k.name} size="sm" className="w-full h-full" />
            </div>
            <div className="min-w-0">
              <span className="block text-sm font-bold text-ink truncate group-hover:text-brand-ink">{k.name}</span>
              <span className="block text-[11px] text-muted truncate">
                {[k.rating ? `★ ${k.rating}` : null, k.statusLabel].filter(Boolean).join(' · ')}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** "Kitchens on Nuray" as a row of avatars. Hidden when there is nothing to show; the grid below explains why. */
export function KitchenAvatarRow({ kitchens, state }: { kitchens: HomeKitchen[]; state: LoadState }) {
  const t = useT(homeMessages);
  if (!(state === 'loading' || (state === 'ready' && kitchens.length > 0))) return null;
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg sm:text-[22px] font-extrabold text-ink tracking-tight">{t('kitchensOnNuray')}</h3>
          <p className="text-xs text-muted font-medium mt-0.5">{t('kitchensOnNuraySub')}</p>
        </div>
        <Link href="/kitchens" className="text-xs font-bold text-brand-ink hover:underline flex items-center gap-1">
          <span>{t('seeAll')}</span>
          <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Compact Avatar Row */}
      <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none py-1 px-0.5">
        {state === 'loading'
          ? Array.from({ length: 8 }, (_, i) => <KitchenAvatarSkeleton key={i} />)
          : kitchens.map((k) => {
              const caption = kitchenCaption(t, k);
              return (
                <Link key={k.id} href={k.href} className="flex-shrink-0 flex flex-col items-center gap-1.5 group text-center">
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border border-line group-hover:border-brand transition-all shadow-2xs">
                    <CoverImage
                      src={k.avatar || k.coverPhoto}
                      alt={k.name}
                      label={k.name}
                      size="sm"
                      className="w-full h-full group-hover:scale-105 transition-transform"
                    />
                    {k.statusLabel && (
                      <span
                        className={`absolute bottom-0.5 end-0.5 w-3 h-3 rounded-full border-2 border-page ${
                          k.isOpen ? 'bg-brand' : 'bg-line-strong'
                        }`}
                        title={k.statusLabel}
                      />
                    )}
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-ink group-hover:text-brand-ink max-w-[85px] sm:max-w-[95px] truncate">
                      {k.name}
                    </span>
                    {caption && <span className="block text-[11px] text-muted font-medium">{caption}</span>}
                  </div>
                </Link>
              );
            })}
      </div>
    </section>
  );
}

export function KitchenCard({
  kitchen,
  isFav,
  onToggleFavorite,
}: {
  kitchen: HomeKitchen;
  isFav: boolean;
  onToggleFavorite: ToggleFavorite;
}) {
  const t = useT(homeMessages);
  return (
    <Link
      href={kitchen.href}
      className="group flex flex-col bg-surface rounded-[20px] border border-line hover:border-line-strong hover:shadow-[var(--shadow-card)] transition-all duration-200 overflow-hidden"
    >
      {/* The kitchen's own cover photo, nothing laid over it but the deal and the heart */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-raised">
        <CoverImage
          src={kitchen.coverPhoto}
          alt={kitchen.name}
          label={kitchen.name}
          size="md"
          className="w-full h-full transition-transform duration-500 group-hover:scale-[1.03]"
        />

        {/* Deal: only when one of its dishes is really discounted */}
        {kitchen.deal && (
          <span className="absolute top-3 start-3 px-2.5 py-1 rounded-full bg-accent text-on-accent text-[11px] font-extrabold">
            {kitchen.deal}
          </span>
        )}

        <button
          onClick={(e) => onToggleFavorite(kitchen.id, e)}
          className="absolute top-3 end-3 w-9 h-9 rounded-full bg-surface/95 flex items-center justify-center text-ink hover:scale-105 transition-transform shadow-xs"
          aria-label={isFav ? t('removeSaved') : t('saveFav')}
          aria-pressed={isFav}
        >
          <Heart className={`w-4 h-4 transition-colors ${isFav ? 'fill-red-500 text-red-500' : 'text-muted hover:text-red-500'}`} />
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-ink truncate">{kitchen.name}</h3>
            {(kitchen.chef || kitchen.area) && (
              <p className="text-[13px] text-muted truncate flex items-center gap-1">
                {kitchen.chef && <span>{kitchen.chef}</span>}
                {kitchen.chef && kitchen.area && <span aria-hidden>·</span>}
                {kitchen.area && (
                  <>
                    <MapPin className="w-3 h-3 inline flex-shrink-0" aria-hidden />
                    <span>{kitchen.area}</span>
                  </>
                )}
              </p>
            )}
          </div>

          {/* The real rating, or "New" before any reviews */}
          {kitchen.rating ? (
            <span
              className="flex-shrink-0 flex items-center gap-1 text-sm font-extrabold text-ink"
              title={countLabel(t, kitchen.reviewsCount, 'reviewsOne', 'reviewsMany')}
            >
              <Star className="w-4 h-4 fill-accent text-accent" aria-hidden />
              <span>{kitchen.rating}</span>
              <span className="text-xs font-semibold text-muted">({formatCount(kitchen.reviewsCount)})</span>
            </span>
          ) : (
            <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-accent-soft text-accent-soft-ink text-[11px] font-extrabold">
              {t('newBadge')}
            </span>
          )}
        </div>

        {/* The meal categories the kitchen chose */}
        {kitchen.cuisine.length > 0 && <p className="text-[13px] text-muted truncate">{kitchen.cuisine.join(' · ')}</p>}

        <div className="mt-auto pt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-semibold">
          {/* Open or closed, from the kitchen's real schedule */}
          {kitchen.statusLabel && (
            <span className="flex items-center gap-1.5">
              <span
                className={`px-2 py-0.5 rounded-full font-extrabold ${
                  kitchen.isOpen ? 'bg-brand-soft text-brand-soft-ink' : 'bg-raised text-muted'
                }`}
              >
                {kitchen.statusLabel}
              </span>
              {kitchen.isOpen && kitchen.closesAt && <span className="text-muted">{t('closesAt', { time: kitchen.closesAt })}</span>}
              {!kitchen.isOpen && kitchen.opensAt && <span className="text-muted">{t('opensAt', { time: kitchen.opensAt })}</span>}
            </span>
          )}
          {kitchen.prepMinutes != null && (
            <span className="flex items-center gap-1 text-muted">
              <Clock className="w-3.5 h-3.5" aria-hidden />
              <span>{t('minPrep', { n: kitchen.prepMinutes })}</span>
            </span>
          )}
          {kitchen.deliveryFee && (
            <span className="flex items-center gap-1 text-muted">
              <Bike className="w-3.5 h-3.5" aria-hidden />
              <span>{kitchen.deliveryFee}</span>
            </span>
          )}
          {kitchen.minOrder && <span className="text-muted">{t('minOrder', { amount: kitchen.minOrder })}</span>}
        </div>

        {/* Every listed kitchen is verified */}
        <span className="flex items-center gap-1 text-[11px] font-bold text-brand-ink">
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
          <span>{kitchen.badge}</span>
        </span>
      </div>
    </Link>
  );
}

/** Every verified kitchen the filters let through, or why there are none: loading, could not load, none yet, none match. */
export function KitchenGrid({
  kitchens,
  filteredKitchens,
  state,
  onRetry,
  onClearFilters,
  isAuthenticated,
  favoriteKitchenIds,
  onToggleFavorite,
}: {
  kitchens: HomeKitchen[];
  filteredKitchens: HomeKitchen[];
  state: LoadState;
  onRetry: () => void;
  onClearFilters: () => void;
  isAuthenticated: boolean;
  favoriteKitchenIds: Set<string>;
  onToggleFavorite: ToggleFavorite;
}) {
  const t = useT(homeMessages);
  return (
    <section id="kitchens" className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 scroll-mt-[calc(var(--header-offset)+4.5rem)]">
      <div className="flex items-end justify-between mb-5">
        <div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand-ink mb-0.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('verifiedKitchens')}</span>
          </div>
          <h2 className="text-[22px] sm:text-[28px] font-extrabold text-ink tracking-tight">{t('browseHomeKitchens')}</h2>
        </div>
        <Link href="/kitchens" className="text-xs font-bold text-brand-ink hover:underline flex items-center gap-1">
          <span>{t('viewAll')}</span>
          <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
        </Link>
      </div>

      {state === 'loading' ? (
        <div role="status" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <span className="sr-only">{t('loadingKitchens')}</span>
          {Array.from({ length: 6 }, (_, i) => (
            <KitchenCardSkeleton key={i} />
          ))}
        </div>
      ) : state === 'error' ? (
        <SectionNotice role="alert" title={t('kitchensError')} message={t('checkConnection')} action={<RetryButton onClick={onRetry} />} />
      ) : kitchens.length === 0 ? (
        <SectionNotice
          title={t('noKitchens')}
          message={t('noKitchensBody')}
          action={
            <Link
              href="/sellers/register"
              className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-page px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
            >
              <ChefHat className="w-3.5 h-3.5" />
              <span>{t('openHomeKitchen')}</span>
            </Link>
          }
        />
      ) : filteredKitchens.length === 0 ? (
        <SectionNotice
          title={t('noMatch')}
          message={t('noMatchBody')}
          action={
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink/90 text-page px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shadow-sm"
            >
              {t('clearFilters')}
            </button>
          }
        />
      ) : (
        /* Responsive Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredKitchens.map((kitchen) => (
            <KitchenCard
              key={kitchen.id}
              kitchen={kitchen}
              isFav={isAuthenticated && favoriteKitchenIds.has(kitchen.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}
    </section>
  );
}

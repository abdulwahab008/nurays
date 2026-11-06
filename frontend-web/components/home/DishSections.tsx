'use client';

/** Dish cards and the three dish sections: order again and recommended (signed in), and popular dishes. */
import Link from 'next/link';
import { Snowflake, Flame, Plus, ChefHat, Star, ChevronRight } from 'lucide-react';
import { CoverImage } from '@/components/ui/CoverImage';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import type { HomeT } from '@/lib/home-feed';
import type { HomeDish, LoadState } from '@/lib/home-filters';
import { DishCardSkeleton, RetryButton, SectionNotice } from './HomeStates';

type AddDish = (dish: HomeDish, e: React.MouseEvent) => void;

/** Why a dish is recommended, as the small line above its name; none when the section's subtitle already says it. */
const reasonNote = (t: HomeT, reason?: string) =>
  reason === 'similar_customers' || reason === 'category_you_like'
    ? undefined
    : reason === 'kitchen_you_like'
      ? t('reasonKitchen')
      : t('reasonTrending');

/** Columns on a wide screen: as many as there are cards (three to six), so a short row fills the width. */
const WIDE_COLUMNS = ['lg:grid-cols-3', 'lg:grid-cols-3', 'lg:grid-cols-3', 'lg:grid-cols-3', 'lg:grid-cols-4', 'lg:grid-cols-5', 'lg:grid-cols-6'];
const SHORT_ROW = 3;

/**
 * One dish card (popular, order again, recommended). `note` is a small line above the name. `row` lays a card of a short
 * row (three or fewer) out sideways on a wide screen, so three cards fill the width without becoming posters.
 */
export function DishCard({ dish, onAdd, note, row = false }: { dish: HomeDish; onAdd: AddDish; note?: string; row?: boolean }) {
  const t = useT(homeMessages);
  return (
    <div className={`group relative bg-surface rounded-[20px] border border-line hover:border-line-strong hover:shadow-[var(--shadow-card)] transition-all flex flex-col overflow-hidden ${row ? 'lg:flex-row' : ''}`}>
      <div className={`relative aspect-square overflow-hidden bg-raised ${row ? 'lg:w-40 lg:shrink-0' : ''}`}>
        <CoverImage
          src={dish.photo}
          alt={dish.name}
          label={dish.name}
          size="md"
          className="w-full h-full group-hover:scale-[1.03] transition-transform duration-300"
        />

        {/* Fresh or frozen, as set by the kitchen */}
        {dish.typeLabel && (
          <span
            className={`absolute top-2 start-2 px-2 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 ${
              dish.isFrozen ? 'bg-frozen-soft text-frozen-ink' : 'bg-surface/95 text-ink'
            }`}
          >
            {dish.isFrozen ? <Snowflake className="w-3 h-3" aria-hidden /> : <Flame className="w-3 h-3 text-brand-ink" aria-hidden />}
            <span>{dish.typeLabel}</span>
          </span>
        )}

        <button
          type="button"
          onClick={(e) => onAdd(dish, e)}
          className="group/add absolute z-10 bottom-0 end-0 w-11 h-11 flex items-center justify-center"
          title={t('addToTray')}
          aria-label={t('addNameToTray', { name: dish.name })}
        >
          <span className="w-9 h-9 rounded-full bg-brand group-hover/add:bg-brand-500 text-on-brand shadow-md flex items-center justify-center transition-transform group-active/add:scale-95">
            <Plus className="w-4 h-4" strokeWidth={3} aria-hidden />
          </span>
        </button>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1">
        {note && <p className="text-[11px] font-bold text-brand-ink truncate">{note}</p>}
        <h4 className="text-sm font-extrabold text-ink leading-snug line-clamp-2">
          <Link href={`/products/${dish.id}`} className="after:absolute after:inset-0 after:rounded-[20px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand">
            {dish.name}
          </Link>
        </h4>
        <p className="text-xs text-muted truncate flex items-center gap-1">
          <ChefHat className="w-3 h-3 flex-shrink-0" aria-hidden />
          <span>{dish.kitchenName}</span>
        </p>
        <div className="mt-auto pt-1.5 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-sm font-extrabold text-ink">{formatPrice(dish.price)}</span>
            {dish.originalPrice != null && (
              <span className="text-[11px] text-muted line-through truncate">{formatPrice(dish.originalPrice)}</span>
            )}
          </div>
          {dish.rating && (
            <span className="text-xs font-extrabold text-ink flex items-center gap-0.5 flex-shrink-0">
              <Star className="w-3.5 h-3.5 fill-accent text-accent" aria-hidden />
              <span>{dish.rating}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** A row of dish cards that scrolls sideways on a phone and becomes a grid from a tablet up. */
function DishRail({ count, children }: { count: number; children: React.ReactNode }) {
  return (
    <div className={`-mx-4 px-4 flex gap-3 overflow-x-auto scrollbar-none snap-x scroll-px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3 ${WIDE_COLUMNS[Math.min(count, 6)]} sm:gap-4 sm:overflow-visible *:w-40 *:shrink-0 *:snap-start sm:*:w-auto`}>
      {children}
    </div>
  );
}

/** "Order again": the dishes this customer had before; hidden when there are none. */
export function OrderAgainDishes({ dishes, onAdd }: { dishes: HomeDish[]; onAdd: AddDish }) {
  const t = useT(homeMessages);
  if (dishes.length === 0) return null;
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-6" data-testid="order-again">
      <h2 className="text-lg sm:text-[22px] font-extrabold text-ink tracking-tight mb-3">{t('orderAgain')}</h2>
      <DishRail count={dishes.length}>
        {dishes.map((dish) => (
          <DishCard key={dish.id} dish={dish} onAdd={onAdd} row={dishes.length <= SHORT_ROW} />
        ))}
      </DishRail>
    </section>
  );
}

/** "Recommended for you", each with why; hidden when there is nothing to recommend. */
export function RecommendedDishes({ dishes, onAdd }: { dishes: Array<{ dish: HomeDish; reason?: string }>; onAdd: AddDish }) {
  const t = useT(homeMessages);
  if (dishes.length === 0) return null;
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-8" data-testid="recommended">
      <h2 className="text-[22px] sm:text-[28px] font-extrabold text-ink tracking-tight">{t('recommendedForYou')}</h2>
      <p className="text-xs text-muted font-medium mt-0.5 mb-4">{t('recommendedForYouSub')}</p>
      <DishRail count={dishes.length}>
        {dishes.map(({ dish, reason }) => (
          <DishCard key={dish.id} dish={dish} onAdd={onAdd} note={reasonNote(t, reason)} row={dishes.length <= SHORT_ROW} />
        ))}
      </DishRail>
    </section>
  );
}

/** What people are ordering now (trend score), with its loading, failed and empty states. */
export function PopularDishes({
  dishes,
  state,
  onRetry,
  onAdd,
}: {
  dishes: HomeDish[];
  state: LoadState;
  onRetry: () => void;
  onAdd: AddDish;
}) {
  const t = useT(homeMessages);
  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-[22px] sm:text-[28px] font-extrabold text-ink tracking-tight">{t('popularDishes')}</h2>
          <p className="text-xs text-muted font-medium mt-0.5">{t('popularDishesSub')}</p>
        </div>
        <Link href="/products" className="shrink-0 min-h-11 text-sm font-bold text-brand-ink hover:underline flex items-center gap-1">
          <span>{t('viewAll')}</span>
          <ChevronRight className="rtl:-scale-x-100 w-4 h-4" aria-hidden />
        </Link>
      </div>

      {state === 'loading' ? (
        <div role="status" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <span className="sr-only">{t('loadingDishes')}</span>
          {Array.from({ length: 6 }, (_, i) => (
            <DishCardSkeleton key={i} />
          ))}
        </div>
      ) : state === 'error' ? (
        <SectionNotice role="alert" title={t('dishesError')} message={t('checkConnection')} action={<RetryButton onClick={onRetry} />} />
      ) : dishes.length === 0 ? (
        <SectionNotice title={t('noDishes')} message={t('noDishesBody')} />
      ) : (
        /* Dishes Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {dishes.map((dish) => (
            <DishCard key={dish.id} dish={dish} onAdd={onAdd} />
          ))}
        </div>
      )}
    </section>
  );
}

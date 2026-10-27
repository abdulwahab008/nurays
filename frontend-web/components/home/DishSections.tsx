'use client';

/** Dish cards and the three dish sections: order again and recommended (signed in), and popular dishes. */
import Link from 'next/link';
import { Snowflake, Flame, Plus, ChefHat, Star, UtensilsCrossed, ChevronRight } from 'lucide-react';
import { CoverImage } from '@/components/ui/CoverImage';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import type { HomeT } from '@/lib/home-feed';
import type { HomeDish, LoadState } from '@/lib/home-filters';
import { DishCardSkeleton, RetryButton, SectionNotice } from './HomeStates';

type AddDish = (dish: HomeDish, e: React.MouseEvent) => void;

/** Why a dish is recommended, as the small line above its name. */
const reasonNote = (t: HomeT, reason?: string) =>
  reason === 'similar_customers'
    ? t('reasonSimilar')
    : reason === 'kitchen_you_like'
      ? t('reasonKitchen')
      : reason === 'category_you_like'
        ? t('reasonCategory')
        : t('reasonTrending');

/** One dish card (popular, order again, recommended). `note` is a small line above the name. */
export function DishCard({ dish, onAdd, note }: { dish: HomeDish; onAdd: AddDish; note?: string }) {
  const t = useT(homeMessages);
  return (
    <div className="group bg-surface rounded-[20px] border border-line hover:border-line-strong hover:shadow-[var(--shadow-card)] transition-all flex flex-col overflow-hidden">
      <div className="relative aspect-square overflow-hidden bg-raised">
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
          onClick={(e) => onAdd(dish, e)}
          className="absolute bottom-2 end-2 w-9 h-9 rounded-full bg-brand hover:bg-brand-500 text-on-brand shadow-md flex items-center justify-center transition-transform active:scale-95"
          title={t('addToTray')}
          aria-label={t('addNameToTray', { name: dish.name })}
        >
          <Plus className="w-4 h-4" strokeWidth={3} />
        </button>
      </div>

      <div className="p-3 flex-1 flex flex-col gap-1">
        {note && <p className="text-[11px] font-bold text-brand-ink truncate">{note}</p>}
        <h4 className="text-sm font-extrabold text-ink leading-snug line-clamp-2">{dish.name}</h4>
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

/** "Order again" and "Recommended for you"; each hides when it has nothing. */
export function PersonalDishes({
  orderAgainDishes,
  recommendedDishes,
  onAdd,
}: {
  orderAgainDishes: HomeDish[];
  recommendedDishes: Array<{ dish: HomeDish; reason?: string }>;
  onAdd: AddDish;
}) {
  const t = useT(homeMessages);
  return (
    <>
      {orderAgainDishes.length > 0 && (
        <section className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-8" data-testid="order-again">
          <h2 className="text-[22px] sm:text-[28px] font-extrabold text-ink tracking-tight mb-4">{t('orderAgain')}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {orderAgainDishes.map((dish) => (
              <DishCard key={dish.id} dish={dish} onAdd={onAdd} />
            ))}
          </div>
        </section>
      )}
      {recommendedDishes.length > 0 && (
        <section className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-8" data-testid="recommended">
          <h2 className="text-[22px] sm:text-[28px] font-extrabold text-ink tracking-tight">{t('recommendedForYou')}</h2>
          <p className="text-xs text-muted font-medium mt-0.5 mb-4">{t('recommendedForYouSub')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {recommendedDishes.map(({ dish, reason }) => (
              <DishCard key={dish.id} dish={dish} onAdd={onAdd} note={reasonNote(t, reason)} />
            ))}
          </div>
        </section>
      )}
    </>
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
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <div className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-brand-ink mb-0.5">
            <UtensilsCrossed className="w-3.5 h-3.5" />
            <span>{t('fromHomeKitchens')}</span>
          </div>
          <h2 className="text-[22px] sm:text-[28px] font-extrabold text-ink tracking-tight">{t('popularDishes')}</h2>
          <p className="text-xs text-muted font-medium mt-0.5">{t('popularDishesSub')}</p>
        </div>
        <Link href="/products" className="text-xs font-bold text-brand-ink hover:underline flex items-center gap-1">
          <span>{t('exploreAllDishes')}</span>
          <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
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

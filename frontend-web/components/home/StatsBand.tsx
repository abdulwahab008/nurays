'use client';

/** The platform's real numbers from GET /stats/public; nothing at all when they are not available. */
import { ChefHat, MapPin, UtensilsCrossed, Star, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';
import { countLabel } from '@/lib/home-feed';
import { formatCount, type PublicStats } from '@/lib/home-filters';

export default function StatsBand({ stats }: { stats: PublicStats | null }) {
  const t = useT(homeMessages);
  const cards: Array<{ key: string; icon: LucideIcon; iconClass: string; valueClass: string; value: string; label: string }> =
    stats && stats.kitchens > 0
      ? [
          {
            key: 'kitchens',
            icon: ChefHat,
            iconClass: 'text-orange-400',
            valueClass: 'text-white',
            value: formatCount(stats.kitchens),
            label: stats.kitchens === 1 ? t('statKitchen') : t('statKitchens'),
          },
          {
            key: 'communities',
            icon: MapPin,
            iconClass: 'text-emerald-400',
            valueClass: 'text-white',
            value: formatCount(stats.communities),
            label: stats.communities === 1 ? t('statCommunity') : t('statCommunities'),
          },
          {
            key: 'dishes',
            icon: UtensilsCrossed,
            iconClass: 'text-cyan-400',
            valueClass: 'text-white',
            value: formatCount(stats.dishes),
            label: stats.dishes === 1 ? t('statDish') : t('statDishes'),
          },
          ...(stats.averageRating != null
            ? [
                {
                  key: 'rating',
                  icon: Star,
                  iconClass: 'text-amber-400',
                  valueClass: 'text-amber-400',
                  value: `${stats.averageRating.toFixed(1)} / 5`,
                  label: t('statAvg', { reviews: countLabel(t, stats.reviews, 'reviewsOne', 'reviewsMany') }),
                },
              ]
            : []),
        ]
      : [];
  if (cards.length === 0) return null;

  return (
    <section className="bg-slate-900 text-white py-12 border-t border-slate-800">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 text-center">
        <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{t('statsTitle')}</h3>
        <p className="text-slate-400 text-xs sm:text-sm mt-1.5 max-w-xl mx-auto font-normal">{t('statsBody')}</p>

        <div
          className={`mt-8 grid gap-4 max-w-3xl mx-auto ${
            cards.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'
          }`}
        >
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.key} className="p-4 rounded-xl bg-white/5 border border-white/10">
                <Icon className={`w-5 h-5 mx-auto ${card.iconClass}`} />
                <div className={`text-xl font-bold mt-2 ${card.valueClass}`}>{card.value}</div>
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">{card.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

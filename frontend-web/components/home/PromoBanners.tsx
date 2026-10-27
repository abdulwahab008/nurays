'use client';

/** The three cards under the filters: home food, open a home kitchen, the frozen pantry. Flat colours, no gradients. */
import Link from 'next/link';
import { Flame, ChefHat, Snowflake, ChevronRight, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { homeMessages } from '@/lib/i18n/messages/home';

type Card = {
  key: string;
  href: string;
  icon: LucideIcon;
  tag: string;
  title: string;
  body: string;
  cta: string;
  /** The same in both themes: each card is a coloured block with its own words. */
  box: string;
  tagBox: string;
  bodyText: string;
  button: string;
};

export default function PromoBanners() {
  const t = useT(homeMessages);
  const cards: Card[] = [
    {
      key: 'fresh',
      href: '/products',
      icon: Flame,
      tag: t('b1Tag'),
      title: t('b1Title'),
      body: t('b1Body'),
      cta: t('b1Cta'),
      box: 'bg-accent text-on-accent',
      tagBox: 'bg-on-accent/10',
      bodyText: 'text-on-accent/80',
      button: 'bg-on-accent text-accent-100 hover:opacity-90',
    },
    {
      key: 'cook',
      href: '/sellers/register',
      icon: ChefHat,
      tag: t('b2Tag'),
      title: t('b2Title'),
      body: t('b2Body'),
      cta: t('b2Cta'),
      box: 'bg-[#0D2624] text-white',
      tagBox: 'bg-white/10',
      bodyText: 'text-[#A3BCB7]',
      button: 'bg-brand text-on-brand hover:bg-brand-500',
    },
    {
      key: 'frozen',
      href: '/products?productType=frozen',
      icon: Snowflake,
      tag: t('b3Tag'),
      title: t('b3Title'),
      body: t('b3Body'),
      cta: t('b3Cta'),
      box: 'bg-frozen text-white',
      tagBox: 'bg-white/15',
      bodyText: 'text-[#D5DEFF]',
      // A fixed white: the dark theme repaints bg-white as a surface colour.
      button: 'bg-[#FFFFFF] text-frozen hover:bg-[#E6ECFF]',
    },
  ];

  return (
    <section className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-6 pb-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(({ key, href, icon: Icon, tag, title, body, cta, box, tagBox, bodyText, button }) => (
          <div key={key} className={`rounded-[20px] p-5 sm:p-6 flex flex-col justify-between gap-4 min-h-[170px] ${box}`}>
            <div>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider mb-3 ${tagBox}`}>
                <Icon className="w-3.5 h-3.5" aria-hidden />
                <span>{tag}</span>
              </span>
              <h2 className="text-xl sm:text-[22px] font-extrabold tracking-tight leading-tight">{title}</h2>
              <p className={`text-sm mt-1.5 max-w-[300px] leading-relaxed ${bodyText}`}>{body}</p>
            </div>
            <Link href={href} className={`self-start inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-extrabold transition-colors ${button}`}>
              <span>{cta}</span>
              <ChevronRight className="rtl:-scale-x-100 w-4 h-4" aria-hidden />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

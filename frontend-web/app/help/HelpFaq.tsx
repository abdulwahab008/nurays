'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Package, Truck, CreditCard, RotateCcw, UserRound, ChefHat, type LucideIcon } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { helpMessages } from '@/lib/i18n/messages/help';
import { richText } from '@/lib/i18n/messages/checkout';

type HelpKey = keyof typeof helpMessages.en;
type LinkKey = 'myOrders' | 'refundPolicy' | 'forgotPassword' | 'deleteAccountPage' | 'privacyPolicy' | 'registerKitchen' | 'riderAccount';

const LINKS: Record<LinkKey, string> = {
  myOrders: '/orders',
  refundPolicy: '/refund-policy',
  forgotPassword: '/forgot-password',
  deleteAccountPage: '/delete-account',
  privacyPolicy: '/privacy',
  registerKitchen: '/sellers/register',
  riderAccount: '/register?user_type=rider',
};

const SECTIONS: Array<{ title: HelpKey; icon: LucideIcon; questions: string[] }> = [
  { title: 'cat.ordering', icon: Package, questions: ['howToOrder', 'fewKitchens', 'notAccepted'] },
  { title: 'cat.delivery', icon: Truck, questions: ['follow', 'code', 'late'] },
  { title: 'cat.payment', icon: CreditCard, questions: ['payWays', 'noOnline', 'unpaid'] },
  { title: 'cat.refunds', icon: RotateCcw, questions: ['cancel', 'refund'] },
  { title: 'cat.account', icon: UserRound, questions: ['noCode', 'password', 'deleteAccount'] },
  { title: 'cat.join', icon: ChefHat, questions: ['sell', 'ride'] },
];

/** A sentence with its links: `{orders}` and the like become links to the page they name. */
export function useHelpText() {
  const t = useT(helpMessages);
  const link = (key: LinkKey) => (
    <Link href={LINKS[key]} className="underline">
      {t(key)}
    </Link>
  );
  const nodes: Record<string, ReactNode> = {
    orders: link('myOrders'),
    refundPolicy: link('refundPolicy'),
    forgotPassword: link('forgotPassword'),
    deleteAccountPage: link('deleteAccountPage'),
    privacyPolicy: link('privacyPolicy'),
    registerKitchen: link('registerKitchen'),
    riderAccount: link('riderAccount'),
    support: (
      <Link href="/support" className="underline">
        {t('supportPage')}
      </Link>
    ),
  };
  return { t, rich: (key: HelpKey) => richText(t(key), nodes) };
}

/** The common questions, one list for the help page and the support page; plain HTML, so each opens without any script. */
export function HelpFaq({ headingClassName = '' }: { headingClassName?: string }) {
  const { t, rich } = useHelpText();
  return (
    <div className="space-y-6">
      {SECTIONS.map(({ title, icon: Icon, questions }) => (
        <section key={title} aria-label={t(title)}>
          <h2 className={`flex items-center gap-2 text-lg font-extrabold text-ink mb-2 ${headingClassName}`}>
            <Icon className="w-5 h-5 shrink-0 text-brand-ink" aria-hidden />
            <span>{t(title)}</span>
          </h2>
          <div className="space-y-2">
            {questions.map((id) => (
              <details key={id} className="group rounded-xl border border-line bg-surface open:bg-raised/60">
                <summary className="min-h-11 cursor-pointer list-none px-4 py-3 font-medium text-ink flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span>{t(`${id}.q` as HelpKey)}</span>
                  <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="px-4 pb-4 text-[15px] leading-7 text-ink">{rich(`${id}.a` as HelpKey)}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

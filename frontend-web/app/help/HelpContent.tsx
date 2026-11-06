'use client';

import { useShallow } from 'zustand/react/shallow';
import { LegalPage, LEGAL, supportEmailIsSet } from '@/components/legal/LegalPage';
import { useAuthStore } from '@/lib/store/auth-store';
import { HelpFaq, useHelpText } from './HelpFaq';

/** The help page in the chosen language: how to reach support (worded for whether the person is signed in), then the answers. */
export function HelpContent() {
  const { t, rich } = useHelpText();
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  return (
    <LegalPage
      title={t('title')}
      updated={t('updated')}
      legalText={false}
      labels={{
        lastUpdated: t('lastUpdated'),
        terms: t('footerTerms'),
        privacy: t('footerPrivacy'),
        refund: t('footerRefund'),
        help: t('footerHelp'),
      }}
    >
      <section aria-labelledby="contact" className="rounded-2xl bg-brand-soft p-5">
        <h2 id="contact" className="!mt-0">
          {t('talkToUs')}
        </h2>
        <ul className="mt-2">
          {supportEmailIsSet && (
            <li>
              <strong>{t('email')}</strong>{' '}
              <a href={`mailto:${LEGAL.email}`} className="underline" data-ltr>
                {LEGAL.email}
              </a>
            </li>
          )}
          <li>
            <strong>{t('aboutOrder')}</strong> {rich(isAuthenticated ? 'aboutOrderSignedIn' : 'aboutOrderSignedOut')}
          </li>
          <li>
            <strong>{t('otherQuestions')}</strong> {rich(isAuthenticated ? 'otherSignedIn' : 'otherSignedOut')}
          </li>
        </ul>
      </section>
      <HelpFaq headingClassName="!mt-8" />
    </LegalPage>
  );
}

'use client';

import { useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { useCommunityStore } from '@/lib/store/community-store';
import { useHydrated } from '@/lib/hooks/use-hydrated';

/** True once in the browser when the buyer is outside every live area and has not chosen one. */
export function useOutsideServiceArea(): boolean {
  const hydrated = useHydrated();
  const outside = useCommunityStore((s) => s.outsideArea && !s.selectedCommunity);
  return hydrated && outside;
}

/** Shown instead of empty lists when the buyer is outside every area Nuray delivers in. */
export function OutsideServiceArea() {
  const t = useT(shellMessages);
  const { communities, loadCommunities, openSelectorModal } = useCommunityStore(
    useShallow((s) => ({ communities: s.communities, loadCommunities: s.loadCommunities, openSelectorModal: s.openSelectorModal })),
  );
  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);
  const areas = communities.map((c) => c.name).join(', ');

  return (
    <section
      data-testid="outside-service-area"
      className="max-w-[640px] mx-auto my-8 px-4 sm:px-8"
    >
      <div className="bg-surface rounded-[20px] border border-dashed border-line-strong p-8 sm:p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center mx-auto mb-4">
          <MapPin className="w-7 h-7 text-brand-ink" aria-hidden />
        </div>
        <h2 className="text-lg font-bold text-ink mb-2">{t('outsideTitle')}</h2>
        {areas && <p className="text-sm text-muted max-w-md mx-auto mb-5 leading-relaxed">{t('outsideBody', { areas })}</p>}
        <Button onClick={openSelectorModal} className="rounded-xl">
          {t('outsideChoose')}
        </Button>
      </div>
    </section>
  );
}

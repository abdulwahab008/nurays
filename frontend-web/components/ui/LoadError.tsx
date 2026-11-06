'use client';

import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { classifyLoadFailure, serverMessageOf } from '@/lib/load-error';

interface LoadErrorProps {
  /** What the request threw. */
  error: unknown;
  /** Asks again. Without it there is no button. */
  onRetry?: () => void;
  /** Replaces "We couldn't load this", e.g. "We couldn't load your orders". */
  title?: string;
  /** A smaller block, for one section of a page. */
  compact?: boolean;
  /** No frame of its own, inside a panel that already has one. */
  plain?: boolean;
  className?: string;
}

/** The sentence for a failed request, in the person's language: what to do (check the connection, wait, try again). */
export function useLoadFailureMessage(): (error: unknown) => string {
  const t = useT(commonMessages);
  return (error: unknown) => {
    const kind = classifyLoadFailure(error);
    if (kind === 'offline') return t('loadFailedOffline');
    if (kind === 'busy') return t('loadFailedBusy');
    if (kind === 'server') return t('loadFailedServer');
    return (kind === 'refused' && serverMessageOf(error)) || t('somethingWrong');
  };
}

/**
 * The sentence for a failed action (a form submitted): the server's own words when it gave any (a wrong password, an
 * address already in use), else what a person can do about a request that never got a proper answer (no connection,
 * a busy or failing server), else the form's own fallback.
 */
export function useRequestErrorMessage(): (error: unknown, fallback: string) => string {
  const failureMessage = useLoadFailureMessage();
  return (error: unknown, fallback: string) => {
    const own = serverMessageOf(error);
    if (own) return own;
    const kind = classifyLoadFailure(error);
    return kind === 'offline' || kind === 'busy' || kind === 'server' ? failureMessage(error) : fallback;
  };
}

/**
 * Shown where a list or page should be when its data could not be loaded. A page that shows an empty list for a failed
 * request tells a customer their orders or their tray are gone, so this says what happened and offers to try again.
 */
export function LoadError({ error, onRetry, title, compact = false, plain = false, className = '' }: LoadErrorProps) {
  const t = useT(commonMessages);
  const failureMessage = useLoadFailureMessage();
  const message = failureMessage(error);
  const Icon = classifyLoadFailure(error) === 'offline' ? WifiOff : AlertTriangle;

  return (
    <div
      role="alert"
      className={`text-center ${plain ? '' : 'rounded-2xl border border-line bg-surface'} ${compact ? 'p-5' : 'p-8 sm:p-10'} ${className}`}
    >
      <Icon className={`mx-auto text-muted ${compact ? 'mb-2 h-5 w-5' : 'mb-3 h-7 w-7'}`} aria-hidden="true" />
      <h3 className={`font-semibold text-ink ${compact ? 'text-sm' : 'text-base'}`}>{title ?? t('loadFailedTitle')}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry} className="mt-4">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

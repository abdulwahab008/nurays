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
export function LoadError({ error, onRetry, title, compact = false, className = '' }: LoadErrorProps) {
  const t = useT(commonMessages);
  const failureMessage = useLoadFailureMessage();
  const message = failureMessage(error);
  const Icon = classifyLoadFailure(error) === 'offline' ? WifiOff : AlertTriangle;

  return (
    <div
      role="alert"
      className={`rounded-[20px] border border-dashed border-line-strong bg-surface text-center ${compact ? 'p-5' : 'p-8 sm:p-12'} ${className}`}
    >
      <div className={`mx-auto flex items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-ink ${compact ? 'mb-3 h-10 w-10' : 'mb-4 h-14 w-14'}`}>
        <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} aria-hidden="true" />
      </div>
      <h3 className={`font-extrabold text-ink ${compact ? 'text-sm' : 'text-lg'}`}>{title ?? t('loadFailedTitle')}</h3>
      <p className={`mx-auto mt-1 max-w-md text-muted ${compact ? 'text-xs' : 'text-sm'}`}>{message}</p>
      {onRetry && (
        <Button type="button" variant="primary" size="sm" onClick={onRetry} className="mt-4 h-11 px-5 font-extrabold">
          <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { commonMessages, statusKey } from '@/lib/i18n/messages/common';

/**
 * The one status language for every role. Colour says what kind of moment it is, the words say which one:
 * waiting (yellow) someone has to act, active (turquoise) it is moving, done (grey) it is over, ended (outline) it
 * stopped without happening, problem (red) a person has to sort it out.
 */
export type StatusTone = 'neutral' | 'good' | 'waiting' | 'problem' | 'ended';

const TONE: Record<StatusTone, string> = {
  neutral: 'bg-raised text-muted',
  good: 'bg-brand-soft text-brand-soft-ink',
  waiting: 'bg-accent-soft text-accent-soft-ink',
  problem: 'bg-red-50 text-red-700',
  ended: 'bg-transparent text-muted ring-1 ring-inset ring-line-strong',
};

const ORDER_TONE: Record<string, StatusTone> = {
  pending: 'waiting',
  pending_payment: 'waiting',
  confirmed: 'good',
  preparing: 'good',
  ready: 'good',
  dispatched: 'good',
  in_transit: 'good',
  delivered: 'neutral',
  completed: 'neutral',
  cancelled: 'ended',
  refunded: 'ended',
  delivery_failed: 'problem',
};

export function orderStatusTone(status: string): StatusTone {
  return ORDER_TONE[status] ?? 'neutral';
}

export function StatusPill({ tone = 'neutral', children, className }: { tone?: StatusTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONE[tone], className)}>
      {children}
    </span>
  );
}

/** An order's status in its shared colour. `label` replaces the shared words where a role says it its own way. */
export function OrderStatusPill({ status, label, className }: { status: string; label?: string; className?: string }) {
  const tc = useT(commonMessages);
  const key = statusKey(status);
  const words = label ?? (key in commonMessages.en ? tc(key) : status.replace(/_/g, ' '));
  return (
    <StatusPill tone={orderStatusTone(status)} className={className}>
      {words}
    </StatusPill>
  );
}

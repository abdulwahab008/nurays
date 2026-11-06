// Turning an audit-log action ("admin:POST /sellers/:id/reject", "auth:LOGIN") into a short plain sentence for the log.

const NOUN: Record<string, string> = {
  orders: 'order',
  refunds: 'refund',
  sellers: 'kitchen',
  riders: 'rider',
  users: 'person',
  payouts: 'payout',
  hubs: 'hub',
  'hub-managers': 'hub manager',
  communities: 'community',
  promotions: 'promo code',
  settings: 'settings',
  support: 'support ticket',
  categories: 'category',
  'category-requests': 'category request',
  staff: 'staff member',
  products: 'dish',
  reviews: 'review',
};

const DONE: Record<string, string> = {
  refund: 'Refunded',
  reject: 'Rejected',
  approve: 'Approved',
  dismiss: 'Dismissed',
  complete: 'Completed',
  reply: 'Replied to',
  suspend: 'Suspended',
  activate: 'Reactivated',
  hide: 'Hid',
  keep: 'Kept',
  restore: 'Restored',
  fail: 'Marked as failed:',
  cancel: 'Cancelled',
  status: 'Changed the status of',
  'confirm-payment': 'Confirmed payment for',
  resolve: 'Resolved',
  settlements: 'Settled up with',
  adjustments: 'Corrected the balance of',
  'cash-limit': 'Changed the cash limit of',
};

const ACCOUNT: Record<string, string> = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  REAUTH_FAILED: 'Wrong password when confirming an action',
  ACCOUNT_DELETED: 'Closed an account',
};

const words = (s: string) => s.replace(/[-_]/g, ' ');
const withArticle = (noun: string) => (noun === 'settings' ? 'the settings' : `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`);

export function describeAction(action: string): string {
  const auth = /^auth:(\w+)$/.exec(action);
  if (auth) return ACCOUNT[auth[1]] ?? words(auth[1].toLowerCase()).replace(/^./, (c) => c.toUpperCase());
  if (action === 'review:REPORT') return 'Reported a review';

  const m = /^([\w-]+):(DENIED )?([A-Z]+) (\S+)$/.exec(action);
  if (!m) return action;
  const [, source, denied, method, rawPath] = m;
  const parts = rawPath.replace(/^\/api\/v1\/admin/, '').split('/').filter(Boolean);
  const area = parts[0] ?? '';
  const noun = NOUN[area] ?? words(area);
  const prefix = source === 'admin' ? '' : `${words(source).replace(/^./, (c) => c.toUpperCase())}: `;

  if (denied) return `${prefix}Refused: ${method === 'GET' ? 'open' : 'change'} ${noun === 'settings' ? 'the settings' : words(area)}`;

  const last = parts[parts.length - 1];
  const step = parts.length > 1 && !last.startsWith(':') ? last : null;
  if (step && DONE[step]) return `${prefix}${DONE[step]} ${withArticle(noun)}`;
  if (step && step !== area) return `${prefix}Updated ${withArticle(noun)} (${words(step)})`;
  const verb = method === 'POST' ? 'Created' : method === 'DELETE' ? 'Deleted' : 'Updated';
  return `${prefix}${verb} ${withArticle(noun)}`;
}

/** The admin page of the record an entry is about, when there is one. */
export function recordHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityId) return null;
  if (entityType === 'orders') return `/admin/orders/${entityId}`;
  if (entityType === 'sellers') return `/admin/sellers/${entityId}`;
  if (entityType === 'riders') return `/admin/riders/${entityId}`;
  return null;
}

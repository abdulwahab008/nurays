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

const DONE: Record<string, [done: string, tried: string]> = {
  refund: ['Refunded', 'refund'],
  reject: ['Rejected', 'reject'],
  approve: ['Approved', 'approve'],
  dismiss: ['Dismissed', 'dismiss'],
  complete: ['Completed', 'complete'],
  reply: ['Replied to', 'reply to'],
  suspend: ['Suspended', 'suspend'],
  activate: ['Reactivated', 'reactivate'],
  hide: ['Hid', 'hide'],
  keep: ['Kept', 'keep'],
  restore: ['Restored', 'restore'],
  fail: ['Marked as failed:', 'mark as failed'],
  cancel: ['Cancelled', 'cancel'],
  status: ['Changed the status of', 'change the status of'],
  'confirm-payment': ['Confirmed payment for', 'confirm payment for'],
  resolve: ['Resolved', 'resolve'],
  settlements: ['Settled up with', 'settle up with'],
  adjustments: ['Corrected the balance of', 'correct the balance of'],
  'cash-limit': ['Changed the cash limit of', 'change the cash limit of'],
};

const ACCOUNT: Record<string, string> = {
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  REAUTH_FAILED: 'Wrong password when confirming an action',
  ACCOUNT_DELETED: 'Closed an account',
};

const words = (s: string) => s.replace(/[-_]/g, ' ');
const withArticle = (noun: string) => (noun === 'settings' ? 'the settings' : `${/^[aeiou]/.test(noun) ? 'an' : 'a'} ${noun}`);

/** `refused` (the server said no) turns "Refunded an order" into "Tried to refund an order". */
export function describeAction(action: string, { refused = false }: { refused?: boolean } = {}): string {
  const auth = /^auth:(\w+)$/.exec(action);
  if (auth) return ACCOUNT[auth[1]] ?? words(auth[1].toLowerCase()).replace(/^./, (c) => c.toUpperCase());
  if (action === 'review:REPORT') return 'Reported a review';
  if (action === 'admin:EXPORT audit-logs') return 'Exported the audit log';

  const m = /^([\w-]+):(DENIED )?([A-Z]+) (\S+)$/.exec(action);
  if (!m) return action;
  const [, source, denied, method, rawPath] = m;
  const parts = rawPath
    .replace(/^\/api\/v1\/admin/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(part) ? ':id' : part));
  const area = parts[0] ?? '';
  const unknown = area.startsWith(':');
  const noun = unknown ? 'unknown record' : (NOUN[area] ?? words(area));
  const prefix = source === 'admin' ? '' : `${words(source).replace(/^./, (c) => c.toUpperCase())}: `;

  if (denied) return `${prefix}Refused: ${method === 'GET' ? 'open' : 'change'} ${noun === 'settings' ? 'the settings' : words(area)}`;

  const last = parts[parts.length - 1];
  const step = parts.length > 1 && !last.startsWith(':') ? last : null;
  // A path with no area in front of the id (an old client calling /admin/:id/cancel) never matched a route.
  const tried = refused || unknown;
  const other = step && step !== area;
  const [done, attempt] = step && DONE[step] ? DONE[step] : other ? ['Updated', 'update'] : method === 'POST' ? ['Created', 'create'] : method === 'DELETE' ? ['Deleted', 'delete'] : ['Updated', 'update'];
  const extra = step && !DONE[step] && other ? ` (${words(step)})` : '';
  return `${prefix}${tried ? `Tried to ${attempt}` : done} ${withArticle(noun)}${extra}`;
}

/** The admin page of the record an entry is about, when there is one. */
export function recordHref(entityType: string | null, entityId: string | null): string | null {
  if (!entityId) return null;
  if (entityType === 'orders') return `/admin/orders/${entityId}`;
  if (entityType === 'sellers') return `/admin/sellers/${entityId}`;
  if (entityType === 'riders') return `/admin/riders/${entityId}`;
  return null;
}

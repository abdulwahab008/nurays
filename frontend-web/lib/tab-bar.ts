/**
 * The phone tab bar. People ordering food get Home, Orders, Tray, Profile; a kitchen gets its own five tabs on its own
 * pages and a rider three on theirs. Hubs and staff keep their menus, and the sign-in, checkout and payment steps keep
 * the whole screen.
 */
export type TabBarRole = 'customer' | 'seller' | 'rider';
export type CustomerTab = 'home' | 'orders' | 'tray' | 'profile';
export type SellerTab = 'home' | 'orders' | 'menu' | 'earnings' | 'settings';
export type RiderTab = 'deliveries' | 'earnings' | 'settings';

const HIDDEN_PREFIXES = [
  '/admin',
  '/sellers',
  '/riders',
  '/hub',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/verify-email-pending',
  '/checkout',
  '/payment',
  '/dev-login',
  '/delete-account',
];

const STAFF_TYPES = new Set(['seller', 'rider', 'admin', 'hub_manager']);

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix + '/');

export function showsCustomerTabBar(pathname: string, userType: string | null | undefined): boolean {
  if (userType && STAFF_TYPES.has(userType)) return false;
  return !HIDDEN_PREFIXES.some((prefix) => under(pathname, prefix));
}

// The notification settings page draws the kitchen's and the rider's own menu, which leaves the tabs out on a phone.
const NOTIFICATION_SETTINGS = '/notifications/settings';

// /sellers/register is the application form, open to anyone: the kitchen's tabs lead to pages it cannot use yet.
const showsSellerTabBar = (pathname: string) =>
  (under(pathname, '/sellers') && !under(pathname, '/sellers/register')) || pathname === NOTIFICATION_SETTINGS;

// The rider's settings are /riders/settings; /profile itself (an older link to them) still works for a rider, while its
// sub-pages (saved addresses) are the customer's.
const showsRiderTabBar = (pathname: string) =>
  under(pathname, '/riders') || pathname === '/profile' || pathname === NOTIFICATION_SETTINGS;

/** Which bar this page shows; userType is null until the visitor is known to be signed in. */
export function tabBarFor(pathname: string, userType: string | null | undefined): TabBarRole | null {
  if (userType === 'seller') return showsSellerTabBar(pathname) ? 'seller' : null;
  if (userType === 'rider') return showsRiderTabBar(pathname) ? 'rider' : null;
  return showsCustomerTabBar(pathname, userType) ? 'customer' : null;
}

export function activeCustomerTab(pathname: string): CustomerTab | null {
  if (under(pathname, '/orders')) return 'orders';
  if (under(pathname, '/cart')) return 'tray';
  if (['/profile', '/wallet', '/favorites', '/notifications', '/support', '/help'].some((p) => under(pathname, p))) return 'profile';
  // A customer lands on /dashboard after signing in: it is their home, not their profile.
  if (pathname === '/' || ['/kitchens', '/products', '/dashboard'].some((p) => under(pathname, p))) return 'home';
  return null;
}

export function activeSellerTab(pathname: string): SellerTab | null {
  if (under(pathname, '/sellers/dashboard')) return 'home';
  if (under(pathname, '/sellers/orders')) return 'orders';
  if (under(pathname, '/sellers/products') || under(pathname, '/sellers/promotions')) return 'menu';
  if (under(pathname, '/sellers/earnings')) return 'earnings';
  if (under(pathname, '/sellers/settings')) return 'settings';
  return null;
}

export function activeRiderTab(pathname: string): RiderTab | null {
  if (under(pathname, '/riders/dashboard')) return 'deliveries';
  if (under(pathname, '/riders/earnings')) return 'earnings';
  if (under(pathname, '/riders/settings') || pathname === '/profile' || pathname === NOTIFICATION_SETTINGS) return 'settings';
  return null;
}

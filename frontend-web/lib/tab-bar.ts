/**
 * The phone tab bar (Home, Orders, Tray, Profile) is for people ordering food. Kitchens, riders, hubs and staff have
 * their own menus, and the sign-in, checkout and payment steps keep the whole screen.
 */
export type CustomerTab = 'home' | 'orders' | 'tray' | 'profile';

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

export function activeCustomerTab(pathname: string): CustomerTab | null {
  if (under(pathname, '/orders')) return 'orders';
  if (under(pathname, '/cart')) return 'tray';
  if (['/profile', '/wallet', '/favorites', '/notifications', '/support', '/help', '/dashboard'].some((p) => under(pathname, p))) return 'profile';
  if (pathname === '/' || ['/kitchens', '/products'].some((p) => under(pathname, p))) return 'home';
  return null;
}

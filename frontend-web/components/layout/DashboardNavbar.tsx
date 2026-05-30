'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { apiClient } from '@/lib/api-client';
import { Mark, Wordmark } from '@/components/ui/Mark';

interface DashboardNavbarProps {
  title: string;
  subtitle?: string;
  userType?: 'customer' | 'seller' | 'admin';
  onMenuToggle?: () => void;
  drawerOpen?: boolean;
}

// City detection from coordinates
const detectCityFromCoords = (lat: number, lng: number): string => {
  if (lat >= 31.3 && lat <= 31.7 && lng >= 74.1 && lng <= 74.5) return 'Lahore';
  if (lat >= 24.7 && lat <= 25.1 && lng >= 66.8 && lng <= 67.3) return 'Karachi';
  if (lat >= 33.5 && lat <= 33.8 && lng >= 72.8 && lng <= 73.3) return 'Islamabad';
  if (lat >= 33.4 && lat <= 33.7 && lng >= 73.0 && lng <= 73.2) return 'Rawalpindi';
  if (lat >= 31.3 && lat <= 31.6 && lng >= 72.9 && lng <= 73.2) return 'Faisalabad';
  if (lat >= 29.9 && lat <= 30.3 && lng >= 71.3 && lng <= 71.6) return 'Multan';
  if (lat >= 33.9 && lat <= 34.1 && lng >= 71.4 && lng <= 71.7) return 'Peshawar';
  if (lat >= 30.1 && lat <= 30.3 && lng >= 66.9 && lng <= 67.1) return 'Quetta';
  return 'Pakistan';
};

// City name mappings (Urdu to English)
const cityMappings: Record<string, string> = {
  'لاہور': 'Lahore', 'ضلع لاہور': 'Lahore',
  'کراچی': 'Karachi', 'اسلام آباد': 'Islamabad',
  'راولپنڈی': 'Rawalpindi', 'فیصل آباد': 'Faisalabad',
  'ملتان': 'Multan', 'پشاور': 'Peshawar', 'کوئٹہ': 'Quetta',
};

const supportedCities = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta'];

export function DashboardNavbar({ title, subtitle, userType = 'customer', onMenuToggle, drawerOpen }: DashboardNavbarProps) {
  const router = useRouter();
  const { logout, user } = useAuthStore();
  const { items } = useCartStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [userLocation, setUserLocation] = useState<string>('Detecting...');
  const [locationArea, setLocationArea] = useState<string>('');
  const [notificationUnreadCount, setNotificationUnreadCount] = useState<number>(0);

  // Determine if this is a seller/admin context
  const isSeller = userType === 'seller';
  const isAdmin = userType === 'admin';
  const isCustomer = userType === 'customer';

  // Get the correct dashboard link based on user type
  const getDashboardLink = () => {
    if (isSeller) return '/sellers/dashboard';
    if (isAdmin) return '/admin/dashboard';
    return '/dashboard';
  };

  // Theme accents — forest for customer/admin, ink for seller (premium-marketplace direction)
  const accentBg = isSeller ? 'var(--ink-900)' : 'var(--forest-500)';
  // Detect user's location on mount
  useEffect(() => {
    const detectLocation = async () => {
      if (!navigator.geolocation) {
        setUserLocation('Pakistan');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;

          try {
            // Use our API proxy to avoid CORS (Nominatim blocks direct browser requests)
            const response = await fetch(
              `/api/geocode/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`
            );
            if (!response.ok) throw new Error('Geocode failed');
            const data = await response.json();

            if (data && data.address) {
              const addr = data.address;
              const possibleCity = addr.city || addr.town || addr.village || addr.district || addr.county || '';
              
              // Check Urdu mappings first
              let detectedCity = cityMappings[possibleCity] || '';
              
              // Try English matching
              if (!detectedCity) {
                detectedCity = supportedCities.find(city => 
                  possibleCity.toLowerCase().includes(city.toLowerCase()) ||
                  city.toLowerCase().includes(possibleCity.toLowerCase())
                ) || '';
              }
              
              // Fallback to coordinate detection
              if (!detectedCity) {
                detectedCity = detectCityFromCoords(latitude, longitude);
              }
              
              setUserLocation(detectedCity || 'Pakistan');
              setLocationArea(addr.suburb || addr.neighbourhood || addr.road || '');
            } else {
              setUserLocation(detectCityFromCoords(latitude, longitude));
            }
          } catch {
            setUserLocation(detectCityFromCoords(latitude, longitude));
          }
        },
        () => {
          setUserLocation('Pakistan');
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
      );
    };

    detectLocation();
  }, []);

  // Fetch notification unread count so we only show the red dot when there are unread
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    apiClient.get('/notifications', { params: { limit: 1 } })
      .then((res) => {
        if (cancelled) return;
        const count = res.data?.data?.unreadCount ?? 0;
        setNotificationUnreadCount(count);
      })
      .catch(() => {
        if (!cancelled) setNotificationUnreadCount(0);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const cartItemCount = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-16 backdrop-blur-md"
      style={{ background: 'rgba(251,248,241,0.94)', borderBottom: '1px solid var(--ink-100)' }}
    >
      <div className="flex items-center justify-between h-full px-3 sm:px-6 gap-2">
        {/* Logo Section */}
        <div className="flex items-center gap-2 sm:gap-4">
          {onMenuToggle && (
            <button
              type="button"
              onClick={onMenuToggle}
              aria-label="Toggle navigation"
              className="lg:hidden w-10 h-10 rounded-full grid place-items-center transition-colors"
              style={{ color: 'var(--ink-800)' }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {drawerOpen ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
          )}
          <Link href={getDashboardLink()} className="flex items-center gap-3">
            <Mark size={32} />
            <div className="hidden sm:block leading-tight">
              <Wordmark size={22} />
              <p className="eyebrow mt-0.5">
                {isSeller ? 'Seller studio' : isAdmin ? 'Admin console' : 'Customer'}
              </p>
            </div>
          </Link>
        </div>

        {/* Center - Search Bar (Only for customers) */}
        {isCustomer && (
          <div className="hidden md:flex flex-1 max-w-lg mx-8">
            <form onSubmit={handleSearch} className="w-full relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for biryani, kebabs, curries..."
                className="w-full pl-10 pr-24 py-2.5 rounded-full text-sm outline-none transition-all"
                style={{
                  background: 'var(--cream-50)',
                  border: '1px solid var(--ink-200)',
                  color: 'var(--ink-900)',
                }}
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-1.5 text-sm font-medium rounded-full transition-colors"
                style={{ background: 'var(--ink-900)', color: 'var(--cream-50)' }}
              >
                Search
              </button>
            </form>
          </div>
        )}

        {/* Center - Seller/Admin Title */}
        {(isSeller || isAdmin) && (
          <div className="hidden md:flex flex-1 justify-center">
            <div className="text-center">
              <h2 className="font-display italic text-[22px]" style={{ color: 'var(--ink-900)' }}>
                {title}
              </h2>
              {subtitle && <p className="eyebrow mt-1">{subtitle}</p>}
            </div>
          </div>
        )}
        
        {/* Right Side - Actions */}
        <div className="flex items-center gap-1">
          {/* Location/Delivery - Only for customers, hidden until xl */}
          {isCustomer && (
            <Link href="/profile/addresses" className="hidden xl:flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <div className="text-left">
                <p className="text-[10px] text-gray-400 font-medium">Deliver to</p>
                <p className="text-sm text-gray-900 font-semibold truncate max-w-[100px]">
                  {userLocation === 'Detecting...' ? (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></span>
                      Detecting...
                    </span>
                  ) : (
                    locationArea ? `${locationArea}, ${userLocation}` : userLocation
                  )}
                </p>
              </div>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Link>
          )}

          {/* Cart - Only for customers */}
          {isCustomer && (
            <Link href="/cart" className="relative">
              <button className="w-10 h-10 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
              </button>
              {cartItemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-gray-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {cartItemCount > 9 ? '9+' : cartItemCount}
                </span>
              )}
            </Link>
          )}

          {/* Seller Quick Actions */}
          {isSeller && (
            <>
              <Link href="/sellers/orders" className="relative">
                <button className="w-10 h-10 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors" title="Orders">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </button>
              </Link>
              <Link href="/sellers/products" className="relative">
                <button className="w-10 h-10 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors" title="Products">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z" />
                  </svg>
                </button>
              </Link>
              <Link href="/sellers/earnings" className="relative">
                <button className="w-10 h-10 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors" title="Earnings">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </Link>
            </>
          )}

          {/* Notifications */}
          <Link href={isSeller ? "/sellers/notifications" : isAdmin ? "/admin/notifications" : "/notifications"} className="relative">
            <button className="w-10 h-10 rounded-lg hover:bg-gray-50 flex items-center justify-center transition-colors">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </button>
            {notificationUnreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" aria-hidden="true"></span>
            )}
          </Link>
          
          {/* User Dropdown */}
          <div className="relative ml-2">
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: accentBg, color: 'var(--cream-50)' }}
              >
                <span className="font-semibold text-sm">
                  {user?.profile?.fullName?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <span className="hidden sm:block text-gray-700 text-sm font-medium">
                {user?.profile?.fullName?.split(' ')[0] || 'User'}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* Dropdown Menu */}
            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-gray-900 font-semibold truncate">{user?.profile?.fullName || 'User'}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                  <span
                    className="inline-block mt-1 px-2.5 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-[0.14em]"
                    style={{
                      background: isSeller ? 'var(--ink-100)' : isAdmin ? 'var(--gold-50)' : 'var(--forest-50)',
                      color: isSeller ? 'var(--ink-700)' : isAdmin ? 'var(--gold-700)' : 'var(--forest-700)',
                    }}
                  >
                    {isSeller ? 'Seller' : isAdmin ? 'Admin' : 'Customer'}
                  </span>
                </div>
                <div className="py-1">
                  {/* Seller-specific menu items */}
                  {isSeller && (
                    <>
                      <Link href="/sellers/dashboard" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                        </svg>
                        <span className="text-sm">Dashboard</span>
                      </Link>
                      <Link href="/sellers/orders" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        <span className="text-sm">My Orders</span>
                      </Link>
                      <Link href="/sellers/products" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165" />
                        </svg>
                        <span className="text-sm">My Products</span>
                      </Link>
                      <Link href="/sellers/settings" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-sm">Settings</span>
                      </Link>
                    </>
                  )}
                  {/* Customer menu items */}
                  {isCustomer && (
                    <>
                      <Link href="/profile" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        <span className="text-sm">My Profile</span>
                      </Link>
                      <Link href="/orders" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                        <span className="text-sm">My Orders</span>
                      </Link>
                      <Link href="/profile/addresses" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        <span className="text-sm">Addresses</span>
                      </Link>
                    </>
                  )}
                  {/* Admin menu items */}
                  {isAdmin && (
                    <>
                      <Link href="/admin/dashboard" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                        </svg>
                        <span className="text-sm">Dashboard</span>
                      </Link>
                      <Link href="/admin/settings" className="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281" />
                        </svg>
                        <span className="text-sm">Settings</span>
                      </Link>
                    </>
                  )}
                </div>
                <div className="py-1 border-t border-gray-100">
                  <button 
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                    </svg>
                    <span className="text-sm font-medium">Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}


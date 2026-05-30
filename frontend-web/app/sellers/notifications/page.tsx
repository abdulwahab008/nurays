'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

const sidebarItems = [
  { name: 'Dashboard', href: '/sellers/dashboard', icon: '' },
  { name: 'Orders', href: '/sellers/orders', icon: '' },
  { name: 'Products', href: '/sellers/products', icon: '' },
  { name: 'Inventory', href: '/sellers/products?view=inventory', icon: '' },
  { name: 'Promotions', href: '/sellers/promotions', icon: '' },
  { name: 'Delivery', href: '/sellers/settings#delivery', icon: '' },
  { name: 'Earnings', href: '/sellers/earnings', icon: '' },
  { name: 'Analytics', href: '/sellers/analytics', icon: '' },
  { name: 'Notifications', href: '/sellers/notifications', icon: '' },
  { name: 'Settings', href: '/sellers/settings', icon: '' },
];

// Icons
const Icons = {
  bell: (
    <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  ),
  order: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  ),
  money: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  product: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

interface Notification {
  id: string;
  type: 'order' | 'payment' | 'product' | 'system' | 'warning' | 'success';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export default function SellerNotificationsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Access denied. Seller privileges required.', 'error');
      return;
    }

    loadNotifications();
  }, [isAuthenticated, user, router]);

  const loadNotifications = async () => {
    setLoadError(null);
    try {
      setLoading(true);
      const response = await apiClient.get('/notifications');
      if (response.data.success) {
        const list = response.data.data.notifications || [];
        setNotifications(
          list.map((n: any) => ({
            ...n,
            link: n.link ?? n.actionUrl,
          }))
        );
      }
    } catch (error: any) {
      console.error('Failed to load notifications:', error);
      setNotifications([]);
      const isNetwork = error?.message === 'Network Error' || error?.code === 'ERR_NETWORK';
      setLoadError(
        isNetwork
          ? 'Could not reach the server. Check your connection and that the API is running.'
          : error?.response?.data?.error?.message || 'Failed to load notifications.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await apiClient.patch(`/notifications/${notificationId}/read`);
      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, isRead: true } : n
      ));
    } catch (error: any) {
      // For demo, just update locally
      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, isRead: true } : n
      ));
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.patch('/notifications/read-all');
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
      showToast('All notifications marked as read', 'success');
    } catch (error: any) {
      // For demo, just update locally
      setNotifications(notifications.map(n => ({ ...n, isRead: true })));
      showToast('All notifications marked as read', 'success');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'order':
        return { icon: Icons.order, bg: 'bg-blue-100', color: 'text-blue-600' };
      case 'payment':
        return { icon: Icons.money, bg: 'bg-green-100', color: 'text-green-600' };
      case 'product':
        return { icon: Icons.product, bg: 'bg-purple-100', color: 'text-purple-600' };
      case 'warning':
        return { icon: Icons.warning, bg: 'bg-amber-100', color: 'text-amber-600' };
      case 'success':
        return { icon: Icons.check, bg: 'bg-emerald-100', color: 'text-emerald-600' };
      default:
        return { icon: Icons.info, bg: 'bg-gray-100', color: 'text-gray-600' };
    }
  };

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.isRead)
    : notifications;

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title="Notifications"
      subtitle={`You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-4xl mx-auto">
        {/* Actions Bar */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 ${
                  filter === 'all'
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
                  filter === 'unread'
                    ? 'bg-blue-500 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Unread
                {unreadCount > 0 && (
                  <span className={`px-2 py-0.5 rounded-full text-xs ${
                    filter === 'unread' ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-600'
                  }`}>
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                Mark all as read
              </Button>
            )}
          </div>
        </div>

        {loadError && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-amber-800 text-sm">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => loadNotifications()} className="border-amber-300 text-amber-800 hover:bg-amber-100">
              Retry
            </Button>
          </div>
        )}
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              {Icons.bell}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications'}
            </h2>
            <p className="text-gray-500">
              {filter === 'unread' 
                ? "You're all caught up! Check back later for new updates."
                : "You don't have any notifications yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notification) => {
              const iconConfig = getNotificationIcon(notification.type);
              return (
                <div
                  key={notification.id}
                  onClick={() => {
                    if (!notification.isRead) {
                      handleMarkAsRead(notification.id);
                    }
                    if (notification.link) {
                      router.push(notification.link);
                    }
                  }}
                  className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 transition-all duration-200 cursor-pointer hover:shadow-md ${
                    !notification.isRead ? 'border-l-4 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex gap-4">
                    {/* Icon */}
                    <div className={`w-12 h-12 ${iconConfig.bg} rounded-xl flex items-center justify-center ${iconConfig.color} flex-shrink-0`}>
                      {iconConfig.icon}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className={`font-semibold ${!notification.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                            {notification.title}
                          </h3>
                          <p className="text-gray-500 text-sm mt-1">{notification.message}</p>
                        </div>
                        {!notification.isRead && (
                          <span className="w-2.5 h-2.5 bg-blue-500 rounded-full flex-shrink-0 mt-2"></span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">{formatDate(notification.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

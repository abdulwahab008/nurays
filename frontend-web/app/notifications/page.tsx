'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { formatDate } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { Package, Tag, Bell, Truck, Check, X, ArrowRight, type LucideIcon } from 'lucide-react';

interface Notification {
  id: string;
  type: 'order' | 'promo' | 'system' | 'delivery';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sidebarItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '🏠' },
    { name: 'Browse Products', href: '/products', icon: '🛍️' },
    { name: 'My Orders', href: '/orders', icon: '📦' },
    { name: 'My Cart', href: '/cart', icon: '🛒' },
    { name: 'My Profile', href: '/profile', icon: '👤' },
    { name: 'Addresses', href: '/profile/addresses', icon: '📍' },
    { name: 'Help & Support', href: '/support', icon: '💬' },
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadNotifications();
  }, [isAuthenticated]);

  const loadNotifications = async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const response = await apiClient.get('/notifications');
      if (response.data?.success && response.data?.data) {
        const list = response.data.data.notifications || [];
        setNotifications(
          list.map((n: { actionUrl?: string; link?: string; [k: string]: unknown }) => ({
            ...n,
            link: (n.link ?? n.actionUrl) as string | undefined,
          }))
        );
      } else {
        setNotifications([]);
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

  const getNotificationIcon = (type: string): LucideIcon => {
    const icons: Record<string, LucideIcon> = {
      order: Package,
      promo: Tag,
      system: Bell,
      delivery: Truck,
    };
    return icons[type] || Bell;
  };

  const getNotificationColor = (type: string) => {
    const colors: Record<string, string> = {
      order: 'bg-blue-100 border-blue-200',
      promo: 'bg-orange-100 border-orange-200',
      system: 'bg-gray-100 border-gray-200',
      delivery: 'bg-green-100 border-green-200',
    };
    return colors[type] || 'bg-gray-100 border-gray-200';
  };

  const markAsRead = async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch {
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
      );
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiClient.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showToast('All notifications marked as read', 'success');
    } catch {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showToast('All notifications marked as read', 'success');
    }
  };

  const deleteNotificationLocal = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const filteredNotifications = notifications.filter(n =>
    filter === 'all' ? true : !n.isRead
  );

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title="Notifications"
      subtitle={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      {/* Header Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === 'unread'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" onClick={markAllAsRead} className="text-sm">
            <Check className="w-4 h-4 mr-2" /> Mark all as read
          </Button>
        )}
      </div>

      {/* Notifications List */}
      {loadError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-800 text-sm flex items-center justify-between gap-4">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={loadNotifications}>Retry</Button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading notifications...</p>
          </div>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Bell className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
          </h2>
          <p className="text-gray-500">
            {filter === 'unread'
              ? "You've read all your notifications."
              : "You'll see order updates and promotions here."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white rounded-2xl border p-4 transition-all hover:shadow-sm ${
                !notification.isRead ? 'border-l-4 border-l-green-500' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${getNotificationColor(notification.type)}`}>
                  {(() => {
                    const Icon = getNotificationIcon(notification.type);
                    return <Icon className="w-5 h-5 text-gray-700" />;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className={`font-semibold ${!notification.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                        {notification.title}
                      </h3>
                      <p className="text-gray-600 text-sm mt-1">{notification.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {formatDate(notification.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!notification.isRead && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="text-xs text-green-600 hover:text-green-700 font-medium"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotificationLocal(notification.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                        aria-label="Delete notification"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {notification.link && (
                    <Link
                      href={notification.link}
                      className="inline-flex items-center gap-1 mt-3 text-sm text-green-600 hover:text-green-700 font-medium"
                    >
                      View details <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notification Settings */}
      <div className="mt-8 bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Notification Preferences</h3>
        <div className="space-y-4">
          {[
            { id: 'orders', label: 'Order updates', desc: 'Get notified about order status changes', icon: Package },
            { id: 'promos', label: 'Promotions & offers', desc: 'Receive special deals and discounts', icon: Tag },
            { id: 'delivery', label: 'Delivery updates', desc: 'Real-time delivery tracking alerts', icon: Truck },
          ].map((pref) => (
            <div key={pref.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <pref.icon className="w-5 h-5 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">{pref.label}</p>
                  <p className="text-sm text-gray-500">{pref.desc}</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" defaultChecked className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

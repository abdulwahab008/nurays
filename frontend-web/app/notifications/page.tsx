'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { formatDate } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { accountMessages } from '@/lib/i18n/messages/account';
import {
  Package,
  Tag,
  Bell,
  Truck,
  BellOff,
  X,
  ArrowRight,
  CheckCheck,
} from 'lucide-react';

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
  const t = useT(accountMessages);
  const tc = useT(commonMessages);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  useEffect(() => {
    const token = typeof window !== 'undefined' ? (sessionStorage.getItem('access_token') || localStorage.getItem('access_token')) : null;
    if (!token && !isAuthenticated) {
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
          ? t('networkError')
          : error?.response?.data?.error?.message || t('loadNotificationsFailed')
      );
    } finally {
      setLoading(false);
    }
  };

  const renderNotificationIcon = (type: string) => {
    switch (type) {
      case 'order':
        return <Package className="w-5 h-5 text-blue-600" />;
      case 'promo':
        return <Tag className="w-5 h-5 text-amber-600" />;
      case 'delivery':
        return <Truck className="w-5 h-5 text-green-600" />;
      case 'system':
      default:
        return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const getNotificationColor = (type: string) => {
    const colors: Record<string, string> = {
      order: 'bg-blue-50 border-blue-200',
      promo: 'bg-amber-50 border-amber-200',
      system: 'bg-gray-50 border-gray-200',
      delivery: 'bg-green-50 border-green-200',
    };
    return colors[type] || 'bg-gray-50 border-gray-200';
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
      showToast(t('allMarkedRead'), 'success');
    } catch {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      showToast(t('allMarkedRead'), 'success');
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
      title={t('notifications')}
      subtitle={t(unreadCount !== 1 ? 'unreadMany' : 'unreadOne', { count: unreadCount })}
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
            {t('filterAll', { count: notifications.length })}
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === 'unread'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('filterUnread', { count: unreadCount })}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/notifications/settings" className="text-sm font-medium text-slate-600 hover:text-slate-900 underline">
            {t('settings')}
          </Link>
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllAsRead} className="text-sm">
              <CheckCheck className="w-4 h-4 me-2" /> {t('markAllRead')}
            </Button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      {loadError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-800 text-sm flex items-center justify-between gap-4">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={loadNotifications}>{t('retry')}</Button>
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">{t('loadingNotifications')}</p>
          </div>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-400">
            <BellOff className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {filter === 'unread' ? t('allCaughtUp') : t('noNotifications')}
          </h2>
          <p className="text-gray-500">
            {filter === 'unread'
              ? t('readAll')
              : t('notificationsWillAppear')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-white rounded-2xl border p-4 transition-all hover:shadow-sm ${
                !notification.isRead ? 'border-s-4 border-s-green-500' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${getNotificationColor(notification.type)}`}>
                  {renderNotificationIcon(notification.type)}
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
                          {t('markRead')}
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotificationLocal(notification.id)}
                        className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-50 transition-colors"
                        title={tc('delete')}
                        aria-label={tc('delete')}
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
                      <span>{t('viewDetails')}</span>
                      <ArrowRight className="rtl:-scale-x-100 w-4 h-4" />
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
        <h3 className="font-semibold text-gray-900 mb-4">{t('notificationPreferences')}</h3>
        <div className="space-y-4">
          {[
            { id: 'orders', label: t('prefOrders'), desc: t('prefOrdersDesc'), icon: Package, color: 'text-blue-600 bg-blue-50' },
            { id: 'promos', label: t('prefPromos'), desc: t('prefPromosDesc'), icon: Tag, color: 'text-amber-600 bg-amber-50' },
            { id: 'delivery', label: t('prefDelivery'), desc: t('prefDeliveryDesc'), icon: Truck, color: 'text-green-600 bg-green-50' },
          ].map((pref) => {
            const Icon = pref.icon;
            return (
              <div key={pref.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${pref.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
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
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}

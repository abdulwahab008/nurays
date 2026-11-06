'use client';

import { useState, useEffect } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { orderService, type Order } from '@/lib/services/order.service';
import { formatDate } from '@/lib/utils';
import MyTickets from '@/components/support/MyTickets';
import { HelpFaq } from '@/app/help/HelpFaq';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { useShallow } from 'zustand/react/shallow';

const CATEGORIES = ['general', 'order', 'payment', 'delivery', 'quality', 'refund'] as const;
type Category = (typeof CATEGORIES)[number];
/** A problem with one order needs to say which order, so support can look at it. */
const NEEDS_ORDER: Category[] = ['order', 'payment', 'delivery', 'quality', 'refund'];
const EMPTY_FORM = { subject: '', message: '', category: 'general' as Category, orderId: '' };
type FieldErrors = Partial<Record<'orderId' | 'subject' | 'message', string>>;

export default function SupportPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const { showToast } = useToast();
  const t = useT(accountMessages);
  const [activeTab, setActiveTab] = useState<'faq' | 'contact' | 'tickets'>('faq');
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const orderNeeded = NEEDS_ORDER.includes(formData.category);

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  const validate = (data: typeof formData): FieldErrors => {
    const next: FieldErrors = {};
    if (NEEDS_ORDER.includes(data.category) && !data.orderId) next.orderId = t('orderRequired');
    if (data.subject.trim().length < 5) next.subject = t('subjectMin5');
    if (data.message.trim().length < 10) next.message = t('messageMin10');
    return next;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(formData);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`support-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    try {
      setSubmitting(true);
      await apiClient.post('/support/tickets', {
        category: formData.category,
        subject: formData.subject.trim(),
        description: formData.message.trim(),
        ...(formData.orderId ? { orderId: formData.orderId } : {}),
      });
      showToast(t('messageSent'), 'success');
      setFormData(EMPTY_FORM);
      setErrors({});
      setActiveTab('tickets');
    } catch (error) {
      showToast(apiErrorMessage(error, t('messageSendFailed')), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Fixing a field clears its message; the others stay until the next try.
  const update = (patch: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch)) delete next[key as keyof FieldErrors];
      if ('category' in patch) delete next.orderId;
      return next;
    });
  };

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }
    orderService
      .getMyOrders({ page: 1, limit: 20 })
      .then((res) => setRecentOrders(res.data?.orders ?? []))
      .catch(() => setRecentOrders([]));
  }, [isAuthenticated, router]);

  // Opened from an order ("Get help with this order"): the form starts on that order.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    const category = params.get('category') as Category | null;
    if (!orderId && !category) return;
    setFormData((prev) => ({
      ...prev,
      orderId: orderId ?? prev.orderId,
      category: category && CATEGORIES.includes(category) ? category : orderId ? 'order' : prev.category,
    }));
    setActiveTab('contact');
  }, []);

  const fieldClass = (bad?: string) =>
    `w-full min-h-11 px-4 py-2.5 border rounded-xl bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand ${bad ? 'border-red-700' : 'border-line-strong'}`;

  return (
    <DashboardLayout
      title={t('helpSupport')}
      subtitle={t('hereToHelp')}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      <div id="support-tabs" role="tablist" className="flex gap-1 mb-6 border-b border-line overflow-x-auto scrollbar-none">
        {(['faq', 'contact', 'tickets'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`min-h-11 px-4 -mb-px border-b-2 text-sm font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t(tab === 'faq' ? 'faqs' : tab === 'contact' ? 'contactUs' : 'myTickets')}
          </button>
        ))}
      </div>

      {/* My Tickets */}
      {activeTab === 'tickets' && <MyTickets />}

      {/* FAQ Section */}
      {activeTab === 'faq' && <HelpFaq />}

      {/* Contact Form */}
      {activeTab === 'contact' && (
        <div className="bg-surface rounded-2xl border border-line p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-ink mb-1">{t('sendUsMessage')}</h3>
          <p className="text-sm text-muted mb-5">{t('requiredNote')}</p>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="support-category" className="block text-sm font-medium text-ink mb-1.5">{t('category')}</label>
              <select
                id="support-category"
                value={formData.category}
                onChange={(e) => update({ category: e.target.value as Category })}
                className={fieldClass()}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{t(`ticketCat.${c}`)}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="support-orderId" className="block text-sm font-medium text-ink mb-1.5">
                {t('whichOrder')} {orderNeeded ? <span className="text-red-700" aria-hidden>*</span> : <span className="text-muted font-normal">{t('optional')}</span>}
              </label>
              <select
                id="support-orderId"
                value={formData.orderId}
                onChange={(e) => update({ orderId: e.target.value })}
                aria-invalid={!!errors.orderId}
                aria-describedby={errors.orderId ? 'support-orderId-error' : undefined}
                className={fieldClass(errors.orderId)}
              >
                <option value="">{t('chooseOrder')}</option>
                {formData.orderId && !recentOrders.some((o) => o.id === formData.orderId) && (
                  <option value={formData.orderId}>{t('thisOrder')}</option>
                )}
                {recentOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.orderNumber} · {formatDate(o.createdAt)}
                  </option>
                ))}
              </select>
              {errors.orderId && <p id="support-orderId-error" className="text-xs text-red-700 mt-1">{errors.orderId}</p>}
            </div>

            <div>
              <label htmlFor="support-subject" className="block text-sm font-medium text-ink mb-1.5">
                {t('subject')} <span className="text-red-700" aria-hidden>*</span>
              </label>
              <input
                id="support-subject"
                type="text"
                value={formData.subject}
                onChange={(e) => update({ subject: e.target.value })}
                placeholder={t('subjectPlaceholder')}
                aria-invalid={!!errors.subject}
                aria-describedby={errors.subject ? 'support-subject-error' : undefined}
                className={fieldClass(errors.subject)}
              />
              {errors.subject && <p id="support-subject-error" className="text-xs text-red-700 mt-1">{errors.subject}</p>}
            </div>

            <div>
              <label htmlFor="support-message" className="block text-sm font-medium text-ink mb-1.5">
                {t('message')} <span className="text-red-700" aria-hidden>*</span>
              </label>
              <textarea
                id="support-message"
                value={formData.message}
                onChange={(e) => update({ message: e.target.value })}
                placeholder={t('messagePlaceholder')}
                rows={5}
                aria-invalid={!!errors.message}
                aria-describedby={errors.message ? 'support-message-error' : undefined}
                className={`${fieldClass(errors.message)} resize-none`}
              />
              {errors.message && <p id="support-message-error" className="text-xs text-red-700 mt-1">{errors.message}</p>}
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting} data-testid="support-send">
                <Send className="w-4 h-4" /> {submitting ? t('sendingDots') : t('sendMessage')}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setFormData(EMPTY_FORM); setErrors({}); }}>
                {t('clear')}
              </Button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}

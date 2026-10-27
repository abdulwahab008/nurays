'use client';

import { useState, useEffect } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  CreditCard,
  Truck,
  Snowflake,
  MessageCircle,
  HelpCircle,
  Ticket,
  ChevronDown,
  Send,
  ShieldCheck,
  CheckCircle,
} from 'lucide-react';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import MyTickets from '@/components/support/MyTickets';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { useShallow } from 'zustand/react/shallow';

export default function SupportPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(accountMessages);
  const [activeTab, setActiveTab] = useState<'faq' | 'contact' | 'tickets'>('faq');
  const [submitting, setSubmitting] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    subject: '',
    message: '',
    category: 'general',
  });

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  const faqs = [
    {
      category: t('faq.catOrders'),
      icon: Package,
      questions: [
        {
          q: t('faq.q1'),
          a: t('faq.a1'),
        },
        {
          q: t('faq.q2'),
          a: t('faq.a2'),
        },
        {
          q: t('faq.q3'),
          a: t('faq.a3'),
        },
      ],
    },
    {
      category: t('faq.catPayment'),
      icon: CreditCard,
      questions: [
        {
          q: t('faq.q4'),
          a: t('faq.a4'),
        },
        {
          q: t('faq.q5'),
          a: t('faq.a5'),
        },
        {
          q: t('faq.q6'),
          a: t('faq.a6'),
        },
      ],
    },
    {
      category: t('faq.catDelivery'),
      icon: Truck,
      questions: [
        {
          q: t('faq.q7'),
          a: t('faq.a7'),
        },
        {
          q: t('faq.q8'),
          a: t('faq.a8'),
        },
        {
          q: t('faq.q9'),
          a: t('faq.a9'),
        },
      ],
    },
    {
      category: t('faq.catQuality'),
      icon: Snowflake,
      questions: [
        {
          q: t('faq.q10'),
          a: t('faq.a10'),
        },
        {
          q: t('faq.q11'),
          a: t('faq.a11'),
        },
        {
          q: t('faq.q12'),
          a: t('faq.a12'),
        },
      ],
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.subject.trim().length < 5) {
      showToast(t('subjectMin5'), 'warning');
      return;
    }
    if (formData.message.trim().length < 10) {
      showToast(t('messageMin10'), 'warning');
      return;
    }
    try {
      setSubmitting(true);
      await apiClient.post('/support/tickets', {
        category: formData.category,
        subject: formData.subject.trim(),
        description: formData.message.trim(),
      });
      showToast(t('messageSent'), 'success');
      setFormData({ subject: '', message: '', category: 'general' });
      setActiveTab('tickets');
    } catch (error) {
      showToast(apiErrorMessage(error, t('messageSendFailed')), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // There is no public support phone or email to show: support runs through tickets.
  const openContactForm = () => {
    setActiveTab('contact');
    document.getElementById('support-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.push(loginUrlHere());
    }
  }, [isAuthenticated, router]);

  return (
    <DashboardLayout
      title={t('helpSupport')}
      subtitle={t('hereToHelp')}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      {/* Quick Contact Cards: the in-app support channels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-surface rounded-[20px] p-5 sm:p-6 border border-line">
          <div className="w-12 h-12 bg-brand-soft rounded-xl flex items-center justify-center mb-4 text-brand-soft-ink">
            <Send className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-ink mb-1">{t('messageSupport')}</h3>
          <p className="text-sm text-muted mb-3">{t('openTicket')}</p>
          <button type="button" onClick={openContactForm} className="text-brand-ink font-bold hover:underline cursor-pointer">
            {t('sendUsMessage')}
          </button>
        </div>

        <div className="bg-surface rounded-[20px] p-5 sm:p-6 border border-line">
          <div className="w-12 h-12 bg-accent-soft rounded-xl flex items-center justify-center mb-4 text-accent-soft-ink">
            <MessageCircle className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-ink mb-1">{t('chatKitchen')}</h3>
          <p className="text-sm text-muted mb-3">{t('chatKitchenDesc')}</p>
          <Link href="/orders" className="text-brand-ink font-bold hover:underline">
            {t('openMyOrders')}
          </Link>
        </div>

        <div className="bg-surface rounded-[20px] p-5 sm:p-6 border border-line">
          <div className="w-12 h-12 bg-frozen-soft rounded-xl flex items-center justify-center mb-4 text-frozen-ink">
            <Ticket className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-ink mb-1">{t('myTickets')}</h3>
          <p className="text-sm text-muted mb-3">{t('myTicketsDesc')}</p>
          <button type="button" onClick={() => setActiveTab('tickets')} className="text-brand-ink font-bold hover:underline cursor-pointer">
            {t('viewMyTickets')}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div id="support-tabs" className="flex gap-2 mb-6 scroll-mt-24">
        <button
          onClick={() => setActiveTab('faq')}
          className={`px-3 sm:px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'faq'
              ? 'bg-brand text-on-brand shadow-sm'
              : 'bg-raised text-ink hover:bg-line'
          }`}
        >
          <HelpCircle className="w-4 h-4" /> {t('faqs')}
        </button>
        <button
          onClick={() => setActiveTab('contact')}
          className={`px-3 sm:px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'contact'
              ? 'bg-brand text-on-brand shadow-sm'
              : 'bg-raised text-ink hover:bg-line'
          }`}
        >
          <Send className="w-4 h-4" /> {t('contactUs')}
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-3 sm:px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'tickets'
              ? 'bg-brand text-on-brand shadow-sm'
              : 'bg-raised text-ink hover:bg-line'
          }`}
        >
          <Ticket className="w-4 h-4" /> {t('myTickets')}
        </button>
      </div>

      {/* My Tickets */}
      {activeTab === 'tickets' && <MyTickets />}

      {/* FAQ Section */}
      {activeTab === 'faq' && (
        <div className="space-y-6">
          {faqs.map((category, catIndex) => {
            const CategoryIcon = category.icon;
            return (
              <div key={catIndex} className="bg-surface rounded-2xl border border-line overflow-hidden">
                <div className="bg-raised px-6 py-4 border-b border-line">
                  <h3 className="font-semibold text-ink flex items-center gap-2.5">
                    <CategoryIcon className="w-5 h-5 text-brand-ink" />
                    {category.category}
                  </h3>
                </div>
                <div className="divide-y divide-line">
                  {category.questions.map((faq, faqIndex) => {
                    const index = catIndex * 10 + faqIndex;
                    const isExpanded = expandedFaq === index;
                    return (
                      <div key={faqIndex}>
                        <button
                          onClick={() => setExpandedFaq(isExpanded ? null : index)}
                          className="w-full px-6 py-4 flex items-center justify-between text-start hover:bg-raised transition-colors"
                        >
                          <span className="font-medium text-ink">{faq.q}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-muted transition-transform ${
                              isExpanded ? 'rotate-180 text-brand-ink' : ''
                            }`}
                          />
                        </button>
                        {isExpanded && (
                          <div className="px-6 pb-4 text-muted bg-brand-50/30 text-sm leading-relaxed">
                            {faq.a}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Contact Form */}
      {activeTab === 'contact' && (
        <div className="bg-surface rounded-2xl border border-line p-6">
          <h3 className="text-lg font-semibold text-ink mb-6">{t('sendUsMessage')}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t('category')}</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2.5 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
              >
                <option value="general">{t('ticketCat.general')}</option>
                <option value="order">{t('ticketCat.order')}</option>
                <option value="payment">{t('ticketCat.payment')}</option>
                <option value="delivery">{t('ticketCat.delivery')}</option>
                <option value="quality">{t('ticketCat.quality')}</option>
                <option value="refund">{t('ticketCat.refund')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t('subject')}</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder={t('subjectPlaceholder')}
                className="w-full px-4 py-2.5 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">{t('message')}</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder={t('messagePlaceholder')}
                rows={5}
                className="w-full px-4 py-2.5 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-transparent resize-none text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" className="bg-brand hover:bg-brand-500 text-on-brand font-bold" disabled={submitting}>
                <Send className="w-4 h-4 me-2" /> {submitting ? t('sendingDots') : t('sendMessage')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setFormData({ subject: '', message: '', category: 'general' })}>
                {t('clear')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Additional Help */}
      <div className="mt-8 rounded-[24px] p-6 sm:p-8 bg-[#0D2624] text-white relative overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
          <div>
            <h3 className="text-xl font-extrabold tracking-tight mb-1">{t('stillNeedHelp')}</h3>
            <p className="text-[#A3BCB7] text-sm">{t('stillNeedHelpDesc')}</p>
          </div>
          <Button
            type="button"
            onClick={openContactForm}
            className="bg-brand hover:bg-brand-500 text-on-brand h-12 px-6 text-sm font-extrabold rounded-xl flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> {t('sendUsMessage')}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

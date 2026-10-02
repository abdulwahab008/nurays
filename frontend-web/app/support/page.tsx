'use client';

import { useState, useEffect } from 'react';
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
import { apiClient } from '@/lib/api-client';
import MyTickets from '@/components/support/MyTickets';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

export default function SupportPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
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
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('messageSendFailed'), 'error');
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
    const token = typeof window !== 'undefined' ? (sessionStorage.getItem('access_token') || localStorage.getItem('access_token')) : null;
    if (!token && !isAuthenticated) {
      router.push('/login');
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
        <div className="bg-gradient-to-br from-green-50 to-white rounded-2xl p-6 border border-green-100">
          <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center mb-4 text-white shadow-xs">
            <Send className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">{t('messageSupport')}</h3>
          <p className="text-sm text-gray-500 mb-3">{t('openTicket')}</p>
          <button type="button" onClick={openContactForm} className="text-green-600 font-medium hover:underline cursor-pointer">
            {t('sendUsMessage')}
          </button>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 border border-blue-100">
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center mb-4 text-white shadow-xs">
            <MessageCircle className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">{t('chatKitchen')}</h3>
          <p className="text-sm text-gray-500 mb-3">{t('chatKitchenDesc')}</p>
          <Link href="/orders" className="text-blue-600 font-medium hover:underline">
            {t('openMyOrders')}
          </Link>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl p-6 border border-purple-100">
          <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center mb-4 text-white shadow-xs">
            <Ticket className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">{t('myTickets')}</h3>
          <p className="text-sm text-gray-500 mb-3">{t('myTicketsDesc')}</p>
          <button type="button" onClick={() => setActiveTab('tickets')} className="text-purple-600 font-medium hover:underline cursor-pointer">
            {t('viewMyTickets')}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div id="support-tabs" className="flex gap-2 mb-6 scroll-mt-24">
        <button
          onClick={() => setActiveTab('faq')}
          className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'faq'
              ? 'bg-[#FF5500] text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <HelpCircle className="w-4 h-4" /> {t('faqs')}
        </button>
        <button
          onClick={() => setActiveTab('contact')}
          className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'contact'
              ? 'bg-[#FF5500] text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Send className="w-4 h-4" /> {t('contactUs')}
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'tickets'
              ? 'bg-[#FF5500] text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
              <div key={catIndex} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2.5">
                    <CategoryIcon className="w-5 h-5 text-[#FF5500]" />
                    {category.category}
                  </h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {category.questions.map((faq, faqIndex) => {
                    const index = catIndex * 10 + faqIndex;
                    const isExpanded = expandedFaq === index;
                    return (
                      <div key={faqIndex}>
                        <button
                          onClick={() => setExpandedFaq(isExpanded ? null : index)}
                          className="w-full px-6 py-4 flex items-center justify-between text-start hover:bg-gray-50 transition-colors"
                        >
                          <span className="font-medium text-gray-900">{faq.q}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-gray-400 transition-transform ${
                              isExpanded ? 'rotate-180 text-[#FF5500]' : ''
                            }`}
                          />
                        </button>
                        {isExpanded && (
                          <div className="px-6 pb-4 text-gray-600 bg-orange-50/30 text-sm leading-relaxed">
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
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('sendUsMessage')}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('category')}</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF5500] focus:border-transparent text-sm"
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('subject')}</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder={t('subjectPlaceholder')}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF5500] focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('message')}</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder={t('messagePlaceholder')}
                rows={5}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF5500] focus:border-transparent resize-none text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" className="bg-[#FF5500] hover:bg-[#e04b00] text-white font-bold" disabled={submitting}>
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
      <div className="mt-8 rounded-3xl p-6 sm:p-8 bg-[#0C1016] text-white border border-white/10 shadow-lg relative overflow-hidden">
        <div className="absolute -top-24 -end-24 w-64 h-64 rounded-full pointer-events-none bg-[#FF5500]/20 blur-2xl" />
        <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
          <div>
            <h3 className="text-xl font-black tracking-tight mb-1">{t('stillNeedHelp')}</h3>
            <p className="text-slate-300 text-xs sm:text-sm">{t('stillNeedHelpDesc')}</p>
          </div>
          <Button
            type="button"
            onClick={openContactForm}
            className="flame-btn px-6 py-3 text-xs font-black shadow-md rounded-2xl flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> {t('sendUsMessage')}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

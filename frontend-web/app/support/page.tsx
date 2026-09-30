'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  CreditCard,
  Truck,
  Snowflake,
  Phone,
  MessageCircle,
  Mail,
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

export default function SupportPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
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
      category: 'Orders',
      icon: Package,
      questions: [
        {
          q: 'How do I track my order?',
          a: 'You can track your order from the "My Orders" page. Click on any order to see its current status and estimated delivery time.',
        },
        {
          q: 'Can I cancel my order?',
          a: 'You can cancel your order if it has not been confirmed by the seller yet. Go to "My Orders", select the order, and click "Cancel Order" if available.',
        },
        {
          q: 'What if my order is delayed?',
          a: 'If your order is delayed beyond the estimated delivery time, please contact us through the contact form below or reach out to our WhatsApp support.',
        },
      ],
    },
    {
      category: 'Payment',
      icon: CreditCard,
      questions: [
        {
          q: 'What payment methods are accepted?',
          a: 'We accept Cash on Delivery (COD), JazzCash, EasyPaisa, and credit/debit cards.',
        },
        {
          q: 'Is my payment information secure?',
          a: 'Yes, all payment transactions are encrypted and processed through secure payment gateways. We never store your card details.',
        },
        {
          q: 'How do I get a refund?',
          a: 'Refunds are processed within 5-7 business days after approval. The amount will be credited to your original payment method or wallet.',
        },
      ],
    },
    {
      category: 'Delivery',
      icon: Truck,
      questions: [
        {
          q: 'What are the delivery hours?',
          a: 'We deliver between 9 AM to 9 PM. You can choose your preferred time slot during checkout.',
        },
        {
          q: 'Do you deliver to my area?',
          a: 'We currently deliver to all major areas in Karachi. Check the delivery availability by entering your address during checkout.',
        },
        {
          q: 'Is there a minimum order value?',
          a: 'The minimum order value varies by seller. Most sellers have a minimum order of PKR 500.',
        },
      ],
    },
    {
      category: 'Food Quality',
      icon: Snowflake,
      questions: [
        {
          q: 'How is the food kept fresh during delivery?',
          a: 'Frozen items are packed in insulated bags with ice packs. Fresh and ready-to-eat items are delivered in temperature-controlled packaging to maintain quality.',
        },
        {
          q: 'How long can I store the food?',
          a: 'Storage duration varies by product type. Frozen items can be stored for 1-3 months. Fresh items should be consumed within the specified shelf life hours. Check the product description for specific instructions.',
        },
        {
          q: 'What if I receive damaged or poor quality food?',
          a: 'Please report any quality issues within 24 hours of delivery. We will arrange for a replacement or refund.',
        },
      ],
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.subject.trim().length < 5) {
      showToast('Subject must be at least 5 characters', 'warning');
      return;
    }
    if (formData.message.trim().length < 10) {
      showToast('Please describe your issue in at least 10 characters', 'warning');
      return;
    }
    try {
      setSubmitting(true);
      await apiClient.post('/support/tickets', {
        category: formData.category,
        subject: formData.subject.trim(),
        description: formData.message.trim(),
      });
      showToast('Your message has been sent! We will respond within 24 hours.', 'success');
      setFormData({ subject: '', message: '', category: 'general' });
      setActiveTab('tickets');
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to send your message', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const token = typeof window !== 'undefined' ? (sessionStorage.getItem('access_token') || localStorage.getItem('access_token')) : null;
    if (!token && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  return (
    <DashboardLayout
      title="Help & Support"
      subtitle="We're here to help you"
      sidebarItems={sidebarItems}
      userType="customer"
    >
      {/* Quick Contact Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-green-50 to-white rounded-2xl p-6 border border-green-100">
          <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center mb-4 text-white shadow-xs">
            <Phone className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Phone Support</h3>
          <p className="text-sm text-gray-500 mb-3">Mon-Sat, 9 AM - 9 PM</p>
          <a href="tel:+923001234567" className="text-green-600 font-medium hover:underline">
            +92 300 123 4567
          </a>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 border border-blue-100">
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center mb-4 text-white shadow-xs">
            <MessageCircle className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">WhatsApp</h3>
          <p className="text-sm text-gray-500 mb-3">Quick responses</p>
          <a href="https://wa.me/923001234567" target="_blank" className="text-blue-600 font-medium hover:underline">
            Chat on WhatsApp
          </a>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl p-6 border border-purple-100">
          <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center mb-4 text-white shadow-xs">
            <Mail className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Email</h3>
          <p className="text-sm text-gray-500 mb-3">Response in 24 hours</p>
          <a href="mailto:support@nuray.pk" className="text-purple-600 font-medium hover:underline">
            support@nuray.pk
          </a>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('faq')}
          className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'faq'
              ? 'bg-[#FF5500] text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <HelpCircle className="w-4 h-4" /> FAQs
        </button>
        <button
          onClick={() => setActiveTab('contact')}
          className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'contact'
              ? 'bg-[#FF5500] text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Send className="w-4 h-4" /> Contact Us
        </button>
        <button
          onClick={() => setActiveTab('tickets')}
          className={`px-6 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'tickets'
              ? 'bg-[#FF5500] text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Ticket className="w-4 h-4" /> My Tickets
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
                          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
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
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Send us a message</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF5500] focus:border-transparent text-sm"
              >
                <option value="general">General Inquiry</option>
                <option value="order">Order Issue</option>
                <option value="payment">Payment Problem</option>
                <option value="delivery">Delivery Issue</option>
                <option value="quality">Food Quality Complaint</option>
                <option value="refund">Refund Request</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Brief description of your issue"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF5500] focus:border-transparent text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
              <textarea
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Please describe your issue in detail..."
                rows={5}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#FF5500] focus:border-transparent resize-none text-sm"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" className="bg-[#FF5500] hover:bg-[#e04b00] text-white font-bold" disabled={submitting}>
                <Send className="w-4 h-4 mr-2" /> {submitting ? 'Sending...' : 'Send Message'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setFormData({ subject: '', message: '', category: 'general' })}>
                Clear
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Additional Help */}
      <div className="mt-8 rounded-3xl p-6 sm:p-8 bg-[#0C1016] text-white border border-white/10 shadow-lg relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full pointer-events-none bg-[#FF5500]/20 blur-2xl" />
        <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
          <div>
            <h3 className="text-xl font-black tracking-tight mb-1">Still need help?</h3>
            <p className="text-slate-300 text-xs sm:text-sm">Our Karachi support team is available 9 AM - 9 PM daily</p>
          </div>
          <a href="https://wa.me/923001234567" target="_blank" rel="noopener noreferrer">
            <Button className="flame-btn px-6 py-3 text-xs font-black shadow-md rounded-2xl flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> Chat with us on WhatsApp
            </Button>
          </a>
        </div>
      </div>
    </DashboardLayout>
  );
}

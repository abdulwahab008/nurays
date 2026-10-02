'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Copy, Check, ShieldCheck, Clock, CheckCircle2, UploadCloud, X, Image as ImageIcon, Smartphone } from 'lucide-react';
import { orderService, SellerPaymentDetails, SellerPaymentAccount } from '@/lib/services/order.service';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { paymentsMessages } from '@/lib/i18n/messages/payments';
import { richText } from '@/lib/i18n/messages/checkout';

interface ManualPaymentCardProps {
  orderId: string;
  totalAmount: number;
  paymentStatus: string;
  paymentReferenceNumber?: string | null;
  paymentSubmittedAt?: string | null;
  paymentProofUrl?: string | null;
  paymentSenderAccount?: string | null;
  onPaymentSubmitted: () => void;
}

export default function ManualPaymentCard({
  orderId,
  totalAmount,
  paymentStatus,
  paymentReferenceNumber,
  paymentSubmittedAt,
  paymentProofUrl,
  paymentSenderAccount,
  onPaymentSubmitted,
}: ManualPaymentCardProps) {
  const t = useT(paymentsMessages);
  const tc = useT(commonMessages);
  const [details, setDetails] = useState<SellerPaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modal & Form State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [transactionId, setTransactionId] = useState('');
  const [senderName, setSenderName] = useState('');
  const [senderAccount, setSenderAccount] = useState('');
  const [notes, setNotes] = useState('');

  // Screenshot Upload State
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [uploadedProofUrl, setUploadedProofUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submittedLocal, setSubmittedLocal] = useState(false);
  const [localTid, setLocalTid] = useState('');
  const [localMethod, setLocalMethod] = useState('');
  const [localProofUrl, setLocalProofUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Which upload is current: a removed (or replaced) screenshot's late response must not re-attach it.
  const uploadToken = useRef(0);
  const { showToast } = useToast();

  useEffect(() => {
    loadDetails();
  }, [orderId]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const res = await orderService.getSellerPaymentDetails(orderId);
      if (res.data) {
        setDetails(res.data);
        if (res.data.accounts && res.data.accounts.length > 0) {
          // Default to first account provider
          setSelectedProvider(res.data.accounts[0].provider);
        }
      }
    } catch (err) {
      console.error('Failed to load seller payment details:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast(t('copiedClipboard'), 'success');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast(t('invalidImage'), 'warning');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast(t('imageTooBig'), 'warning');
      return;
    }

    setScreenshotFile(file);
    setUploadedProofUrl(null);
    const token = ++uploadToken.current;

    // Create local preview immediately
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setScreenshotPreview(dataUrl);
    };
    reader.readAsDataURL(file);

    // Asynchronously upload to backend
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('proof', file);
      const res = await apiClient.post('/upload/payment-proof', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (token === uploadToken.current && res.data?.success && res.data.data?.url) {
        setUploadedProofUrl(res.data.data.url);
      }
    } catch (err) {
      console.warn('Payment proof upload failed:', err);
      if (token !== uploadToken.current) return;
      setScreenshotFile(null);
      setScreenshotPreview(null);
      showToast(t('uploadFailed'), 'error');
    } finally {
      if (token === uploadToken.current) setUploadingImage(false);
    }
  };

  const removeScreenshot = () => {
    uploadToken.current++;
    setUploadingImage(false);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setUploadedProofUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    // Friendly validation: user can provide screenshot OR TID OR simply indicate transfer
    // Only a proof that actually uploaded: the local preview is a base64 data URL
    // (up to the full image size) which the server rejects and must never be sent.
    const activeProofUrl = uploadedProofUrl || undefined;
    const cleanTid = transactionId.trim();

    if (!cleanTid && !activeProofUrl) {
      showToast(t('needProof'), 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const activeAccountObj = details?.accounts.find((a) => a.provider === selectedProvider);
      const resolvedMethod = selectedProvider || 'Direct Transfer';
      const referenceToSave = cleanTid || `Sent via ${resolvedMethod} (Proof Attached)`;

      await orderService.submitManualPayment(orderId, {
        referenceNumber: referenceToSave,
        senderName: senderName.trim() || undefined,
        senderAccount: senderAccount.trim() || activeAccountObj?.accountNumber || selectedProvider || undefined,
        proofUrl: activeProofUrl,
        notes: notes.trim()
          ? `${resolvedMethod}: ${notes.trim()}`
          : `Payment sent to kitchen via ${resolvedMethod}`,
      });

      showToast(t('proofSubmittedToast'), 'success');
      setLocalTid(referenceToSave);
      setLocalMethod(resolvedMethod);
      setLocalProofUrl(activeProofUrl || null);
      setSubmittedLocal(true);
      setShowSubmitModal(false);
      onPaymentSubmitted();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || t('submitFailed');
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getProviderBadge = (provider: string) => {
    const p = provider.toLowerCase();
    if (p.includes('jazz')) {
      return { label: 'JazzCash', bg: 'bg-red-50 text-red-700 border-red-200', icon: '📱' };
    }
    if (p.includes('easy') || p.includes('paisa')) {
      return { label: 'EasyPaisa', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: '🟢' };
    }
    if (p.includes('alfalah') || p.includes('bank') || p.includes('raast')) {
      return { label: provider, bg: 'bg-sky-50 text-sky-800 border-sky-200', icon: '🏛️' };
    }
    return { label: provider, bg: 'bg-amber-50 text-amber-800 border-amber-200', icon: '💳' };
  };

  // If order is already confirmed as paid, show clean verified card
  if (paymentStatus === 'paid') {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black flex-shrink-0 shadow-xs">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-black text-sm text-emerald-950">{t('paidTitle')}</h4>
          <p className="text-xs text-emerald-800 font-medium mt-0.5">
            {t('paidText', { amount: formatPrice(totalAmount) })}
          </p>
        </div>
      </div>
    );
  }

  // If buyer has submitted payment proof and it's awaiting verification
  if (paymentStatus === 'payment_submitted' || submittedLocal) {
    const tidToDisplay = paymentReferenceNumber || localTid;
    const proofToDisplay = paymentProofUrl || localProofUrl;
    const methodToDisplay = paymentSenderAccount || localMethod;

    return (
      <div className="bg-amber-50/90 border border-amber-200 rounded-3xl p-6 space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black flex-shrink-0 shadow-md">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-black text-base text-amber-950">
                {t('proofSubmitted')}
              </h4>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900">
                {t('awaitingVerification')}
              </span>
            </div>
            <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed">
              {t('notifiedText')}
            </p>
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-white rounded-2xl border border-amber-200/80 p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                {t('refMethod')}
              </span>
              <span className="font-semibold text-xs text-slate-800">
                {tidToDisplay ? <span data-ltr>{tidToDisplay}</span> : methodToDisplay ? t('transferredVia', { method: methodToDisplay }) : t('receiptAttached')}
              </span>
            </div>

            {tidToDisplay && !tidToDisplay.includes('(') && (
              <button
                onClick={() => copyToClipboard(tidToDisplay, 'tid')}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors text-xs font-bold flex items-center gap-1"
                title={t('copyReference')}
              >
                {copiedKey === 'tid' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{t('copy')}</span>
              </button>
            )}
          </div>

          {proofToDisplay && (
            <div className="pt-2 border-t border-slate-100 flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center flex-shrink-0">
                <img
                  src={proofToDisplay}
                  alt={t('receiptAlt')}
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                  onClick={() => window.open(proofToDisplay, '_blank')}
                />
              </div>
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">{t('screenshotAttached')}</span>
                <a
                  href={proofToDisplay}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#FF5500] hover:underline font-bold text-[11px]"
                >
                  {t('viewReceipt')}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Payment is pending: show direct kitchen payment details and redesigned submit button
  return (
    <div className="bg-white rounded-3xl border-2 border-orange-200 shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-100 text-[#FF5500] text-[10px] font-black uppercase tracking-wider mb-1.5">
            {t('directBadge')}
          </div>
          <h3 className="text-lg font-black text-slate-900">
            {t('payDirectlyTo', { name: details?.sellerName || t('kitchen') })}
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {richText(t('transferExact'), { amount: <span className="font-black text-slate-900">{formatPrice(totalAmount)}</span> })}
          </p>
        </div>

        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FF5500] to-amber-500 text-white flex items-center justify-center text-xl shadow-md flex-shrink-0">
          💸
        </div>
      </div>

      {/* Account Info Cards */}
      {loading ? (
        <div className="p-8 text-center text-slate-400">
          <div className="w-6 h-6 border-2 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs font-bold">{t('fetchingAccounts')}</span>
        </div>
      ) : details?.accounts && details.accounts.length > 0 ? (
        <div className="space-y-3">
          {details.accounts.map((acc: SellerPaymentAccount, idx: number) => {
            const badge = getProviderBadge(acc.provider);
            return (
              <div
                key={idx}
                className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between gap-3 hover:border-orange-300 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{badge.icon}</span>
                    <span className="font-black text-xs text-slate-900 uppercase tracking-wider">
                      {acc.provider}
                    </span>
                    {acc.accountTitle && (
                      <span className="text-[11px] font-bold text-slate-500 truncate">
                        • {acc.accountTitle}
                      </span>
                    )}
                  </div>
                  <div className="font-mono font-black text-sm text-slate-900 tracking-wider" data-ltr>
                    {acc.accountNumber}
                  </div>
                </div>

                <button
                  onClick={() => copyToClipboard(acc.accountNumber, `acc-${idx}`)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-extrabold transition-colors flex-shrink-0 shadow-2xs"
                >
                  {copiedKey === `acc-${idx}` ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">{t('copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('copy')}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 text-xs text-slate-600">
          <p className="font-bold text-slate-900">{t('directTransfer')}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {t('pleaseTransfer', { amount: formatPrice(totalAmount) })}
          </p>
        </div>
      )}

      {/* Quick Action Button */}
      <button
        onClick={() => setShowSubmitModal(true)}
        className="w-full py-3.5 px-4 rounded-2xl font-black text-xs text-white bg-[#FF5500] hover:bg-[#e04400] active:scale-[0.98] transition-all shadow-md flex items-center justify-center gap-2"
      >
        <span>{t('iHavePaid')}</span>
      </button>

      {/* Redesigned Submit Payment Proof Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#0C1016] text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🧾</span>
                <div>
                  <h3 className="font-black text-sm">{t('submitProof')}</h3>
                  <p className="text-[11px] text-slate-400">
                    {richText(t('orderTotal'), { amount: <strong className="text-white">{formatPrice(totalAmount)}</strong> })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSubmitModal(false)}
                aria-label={tc('close')}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4 overflow-y-auto">
              {/* Account Selection */}
              <div>
                <label className="block text-xs font-black text-slate-900 mb-2">
                  {t('whichAccount')} <span className="text-[#FF5500]">*</span>
                </label>
                {details?.accounts && details.accounts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {details.accounts.map((acc, i) => {
                      const isSelected = selectedProvider === acc.provider;
                      const badge = getProviderBadge(acc.provider);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelectedProvider(acc.provider)}
                          className={`p-3 rounded-2xl border text-start transition-all flex items-center gap-2.5 ${
                            isSelected
                              ? 'border-[#FF5500] bg-orange-50/50 shadow-xs ring-1 ring-[#FF5500]'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="text-lg">{badge.icon}</span>
                          <div className="min-w-0 flex-1">
                            <span className="font-black text-xs text-slate-900 block truncate">
                              {acc.provider}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono block truncate" data-ltr>
                              {acc.accountNumber}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-[#FF5500] text-white flex items-center justify-center text-xs font-bold">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600 font-semibold border border-slate-200">
                    {t('transferredTo', { name: details?.sellerName || t('kitchen') })}
                  </div>
                )}
              </div>

              {/* Screenshot Upload Dropzone */}
              <div>
                <label className="block text-xs font-black text-slate-900 mb-1.5 flex items-center justify-between">
                  <span>{t('screenshotLabel')}</span>
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                    {t('recommended')}
                  </span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {!screenshotPreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-[#FF5500] bg-slate-50 hover:bg-orange-50/30 rounded-2xl p-5 text-center cursor-pointer transition-all space-y-2 group"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-white group-hover:bg-[#FF5500] group-hover:text-white text-slate-500 flex items-center justify-center mx-auto transition-colors shadow-2xs border border-slate-200">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-800 group-hover:text-[#FF5500] transition-colors">
                        {t('tapToUpload')}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {t('supportsFormats')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="relative rounded-2xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-white flex-shrink-0 flex items-center justify-center">
                      <img
                        src={screenshotPreview}
                        alt={t('previewAlt')}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate">
                        {screenshotFile?.name || 'receipt-screenshot.png'}
                      </p>
                      <p className="text-[10px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                        {uploadingImage ? (
                          <>
                            <span className="w-2.5 h-2.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                            <span>{t('uploadingScreenshot')}</span>
                          </>
                        ) : (
                          <>
                            <span>✓</span>
                            <span>{t('screenshotReady')}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={removeScreenshot}
                      className="w-7 h-7 rounded-full bg-slate-200 hover:bg-red-100 hover:text-red-600 text-slate-600 flex items-center justify-center text-xs transition-colors flex-shrink-0"
                      title={t('removeImage')}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* TID / Reference Number (Optional if screenshot is attached) */}
              <div>
                <label className="block text-xs font-black text-slate-900 mb-1">
                  {t('tidLabel')} <span className="text-slate-400 font-normal">{t('optionalIfScreenshot')}</span>
                </label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder={t('tidPlaceholder')}
                  dir="ltr"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold font-mono focus:ring-2 focus:ring-[#FF5500] focus:border-transparent bg-slate-50 focus:bg-white"
                />
              </div>

              {/* Sender Details (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {t('senderName')} <span className="text-slate-400 font-normal">{t('optional')}</span>
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder={t('senderNamePlaceholder')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#FF5500] bg-slate-50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    {t('senderMobile')} <span className="text-slate-400 font-normal">{t('optional')}</span>
                  </label>
                  <input
                    type="text"
                    value={senderAccount}
                    onChange={(e) => setSenderAccount(e.target.value)}
                    placeholder={t('senderMobilePlaceholder')}
                    dir="ltr"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#FF5500] bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex gap-3">
                <button
                  type="submit"
                  disabled={submitting || uploadingImage || (!transactionId.trim() && !uploadedProofUrl)}
                  className="flex-1 py-3 px-4 rounded-2xl font-black text-xs text-white bg-[#FF5500] hover:bg-[#e04400] disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>{t('submitting')}</span>
                    </>
                  ) : (
                    <span>{t('submitVerification')}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="py-3 px-4 rounded-2xl font-extrabold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  {tc('cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

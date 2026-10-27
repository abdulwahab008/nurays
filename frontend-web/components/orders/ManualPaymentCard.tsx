'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Copy, Check, ShieldCheck, Clock, CheckCircle2, UploadCloud, X, Image as ImageIcon, Smartphone } from 'lucide-react';
import { orderService, SellerPaymentDetails, SellerPaymentAccount } from '@/lib/services/order.service';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { paymentsMessages } from '@/lib/i18n/messages/payments';
import { richText } from '@/lib/i18n/messages/checkout';
import { ExternalLink } from '@/components/ExternalLink';
import { openExternal } from '@/lib/open-external';

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
  // Why the kitchen's account details could not be read: without them the customer would be told only "please transfer Rs X",
  // with nobody to send it to.
  const [loadError, setLoadError] = useState<unknown>(null);
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

  const loadDetails = async () => {
    setLoading(true);
    setLoadError(null);
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
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [orderId]);

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
    } catch (err) {
      const msg = apiErrorMessage(err, t('submitFailed'));
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
      return { label: 'EasyPaisa', bg: 'bg-brand-soft text-brand-soft-ink border-brand/40', icon: '🟢' };
    }
    if (p.includes('alfalah') || p.includes('bank') || p.includes('raast')) {
      return { label: provider, bg: 'bg-frozen-soft text-frozen-ink border-transparent', icon: '🏛️' };
    }
    return { label: provider, bg: 'bg-accent-soft text-accent-soft-ink border-accent/50', icon: '💳' };
  };

  // If order is already confirmed as paid, show clean verified card
  if (paymentStatus === 'paid') {
    return (
      <div className="bg-brand-soft rounded-[20px] p-5 flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-brand text-on-brand flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-extrabold text-sm text-brand-soft-ink">{t('paidTitle')}</h4>
          <p className="text-xs text-brand-soft-ink font-medium mt-0.5">
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
      <div className="bg-accent-soft rounded-[20px] p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-accent text-on-accent flex items-center justify-center flex-shrink-0">
            <Clock className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-extrabold text-base text-accent-soft-ink">
                {t('proofSubmitted')}
              </h4>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-surface text-ink">
                {t('awaitingVerification')}
              </span>
            </div>
            <p className="text-xs text-accent-soft-ink font-medium mt-1 leading-relaxed">
              {t('notifiedText')}
            </p>
          </div>
        </div>

        {/* Details Card */}
        <div className="bg-surface rounded-2xl border border-accent/50 p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-[11px] uppercase font-bold text-muted block tracking-wider">
                {t('refMethod')}
              </span>
              <span className="font-semibold text-xs text-ink">
                {tidToDisplay ? <span data-ltr>{tidToDisplay}</span> : methodToDisplay ? t('transferredVia', { method: methodToDisplay }) : t('receiptAttached')}
              </span>
            </div>

            {tidToDisplay && !tidToDisplay.includes('(') && (
              <button
                onClick={() => copyToClipboard(tidToDisplay, 'tid')}
                className="p-1.5 rounded-lg bg-raised hover:bg-line text-ink transition-colors text-xs font-bold flex items-center gap-1"
                title={t('copyReference')}
              >
                {copiedKey === 'tid' ? <Check className="w-3.5 h-3.5 text-brand-soft-ink" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{t('copy')}</span>
              </button>
            )}
          </div>

          {proofToDisplay && (
            <div className="pt-2 border-t border-line flex items-center gap-3">
              <div className="w-14 h-14 rounded-xl border border-line overflow-hidden bg-raised flex items-center justify-center flex-shrink-0">
                <img
                  src={proofToDisplay}
                  alt={t('receiptAlt')}
                  className="w-full h-full object-cover cursor-pointer hover:opacity-90"
                  onClick={() => openExternal(proofToDisplay)}
                />
              </div>
              <div className="text-xs">
                <span className="font-bold text-ink block">{t('screenshotAttached')}</span>
                <ExternalLink href={proofToDisplay} className="text-brand-ink hover:underline font-bold text-[11px]">
                  {t('viewReceipt')}
                </ExternalLink>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Payment is pending: show direct kitchen payment details and redesigned submit button
  return (
    <div className="bg-surface rounded-[20px] border-2 border-brand p-5 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-soft text-brand-soft-ink text-xs font-extrabold mb-2">
            {t('directBadge')}
          </div>
          <h3 className="text-lg font-extrabold text-ink">
            {t('payDirectlyTo', { name: details?.sellerName || t('kitchen') })}
          </h3>
          <p className="text-xs text-muted font-medium mt-0.5">
            {richText(t('transferExact'), { amount: <span className="font-extrabold text-ink">{formatPrice(totalAmount)}</span> })}
          </p>
        </div>

        <div className="w-11 h-11 rounded-2xl bg-accent-soft flex items-center justify-center text-xl flex-shrink-0" aria-hidden>
          💸
        </div>
      </div>

      {/* Account Info Cards */}
      {loading ? (
        <div className="p-8 text-center text-muted">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <span className="text-xs font-bold">{t('fetchingAccounts')}</span>
        </div>
      ) : loadError && !details ? (
        <LoadError compact error={loadError} onRetry={loadDetails} title={t('accountsLoadFailed')} />
      ) : details?.accounts && details.accounts.length > 0 ? (
        <div className="space-y-3">
          {details.accounts.map((acc: SellerPaymentAccount, idx: number) => {
            const badge = getProviderBadge(acc.provider);
            return (
              <div
                key={idx}
                className="bg-raised rounded-2xl p-4 border border-line flex items-center justify-between gap-3 hover:border-brand-300 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{badge.icon}</span>
                    <span className="font-extrabold text-xs text-ink uppercase tracking-wider">
                      {acc.provider}
                    </span>
                    {acc.accountTitle && (
                      <span className="text-[11px] font-bold text-muted truncate">
                        • {acc.accountTitle}
                      </span>
                    )}
                  </div>
                  <div className="font-mono font-extrabold text-sm text-ink tracking-wider" data-ltr>
                    {acc.accountNumber}
                  </div>
                </div>

                <button
                  onClick={() => copyToClipboard(acc.accountNumber, `acc-${idx}`)}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl bg-surface border border-line hover:bg-raised text-ink text-xs font-extrabold transition-colors flex-shrink-0 shadow-2xs"
                >
                  {copiedKey === `acc-${idx}` ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-brand-soft-ink" />
                      <span className="text-brand-soft-ink">{t('copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-muted" />
                      <span>{t('copy')}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-raised rounded-2xl p-4 border border-line text-xs text-muted">
          <p className="font-bold text-ink">{t('directTransfer')}</p>
          <p className="text-[11px] text-muted mt-1">
            {t('pleaseTransfer', { amount: formatPrice(totalAmount) })}
          </p>
        </div>
      )}

      {/* Quick Action Button */}
      <button
        onClick={() => setShowSubmitModal(true)}
        className="w-full py-3.5 px-4 rounded-2xl font-extrabold text-sm text-on-brand bg-brand hover:bg-brand-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        <span>{t('iHavePaid')}</span>
      </button>

      {/* Redesigned Submit Payment Proof Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-surface rounded-3xl shadow-2xl border border-line overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#0C1016] text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🧾</span>
                <div>
                  <h3 className="font-extrabold text-sm">{t('submitProof')}</h3>
                  <p className="text-[11px] text-muted">
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
                <label className="block text-xs font-extrabold text-ink mb-2">
                  {t('whichAccount')} <span className="text-brand-ink">*</span>
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
                              ? 'border-brand bg-brand-50/50 shadow-xs ring-1 ring-brand'
                              : 'border-line bg-surface hover:bg-raised text-ink'
                          }`}
                        >
                          <span className="text-lg">{badge.icon}</span>
                          <div className="min-w-0 flex-1">
                            <span className="font-extrabold text-xs text-ink block truncate">
                              {acc.provider}
                            </span>
                            <span className="text-[11px] text-muted font-mono block truncate" data-ltr>
                              {acc.accountNumber}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="w-5 h-5 rounded-full bg-brand text-on-brand flex items-center justify-center text-xs font-bold">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-raised rounded-xl text-xs text-muted font-semibold border border-line">
                    {t('transferredTo', { name: details?.sellerName || t('kitchen') })}
                  </div>
                )}
              </div>

              {/* Screenshot Upload Dropzone */}
              <div>
                <label className="block text-xs font-extrabold text-ink mb-1.5 flex items-center justify-between">
                  <span>{t('screenshotLabel')}</span>
                  <span className="text-[11px] font-bold text-brand-soft-ink bg-brand-soft px-2 py-0.5 rounded-md">
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
                    className="border-2 border-dashed border-line-strong hover:border-brand bg-raised hover:bg-brand-50/30 rounded-2xl p-5 text-center cursor-pointer transition-all space-y-2 group"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-surface group-hover:bg-brand group-hover:text-on-brand text-muted flex items-center justify-center mx-auto transition-colors shadow-2xs border border-line">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-ink group-hover:text-brand-ink transition-colors">
                        {t('tapToUpload')}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {t('supportsFormats')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="relative rounded-2xl border border-line bg-raised p-3 flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl border border-line overflow-hidden bg-surface flex-shrink-0 flex items-center justify-center">
                      <img
                        src={screenshotPreview}
                        alt={t('previewAlt')}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-extrabold text-ink truncate">
                        {screenshotFile?.name || 'receipt-screenshot.png'}
                      </p>
                      <p className="text-[11px] text-brand-soft-ink font-bold mt-0.5 flex items-center gap-1">
                        {uploadingImage ? (
                          <>
                            <span className="w-2.5 h-2.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
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
                      className="w-7 h-7 rounded-full bg-line hover:bg-red-100 hover:text-red-600 text-muted flex items-center justify-center text-xs transition-colors flex-shrink-0"
                      title={t('removeImage')}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* TID / Reference Number (Optional if screenshot is attached) */}
              <div>
                <label className="block text-xs font-extrabold text-ink mb-1">
                  {t('tidLabel')} <span className="text-muted font-normal">{t('optionalIfScreenshot')}</span>
                </label>
                <input
                  type="text"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                  placeholder={t('tidPlaceholder')}
                  dir="ltr"
                  className="w-full px-4 py-2.5 border border-line rounded-xl text-xs font-bold font-mono focus:ring-2 focus:ring-brand focus:border-transparent bg-raised focus:bg-surface"
                />
              </div>

              {/* Sender Details (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-ink mb-1">
                    {t('senderName')} <span className="text-muted font-normal">{t('optional')}</span>
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder={t('senderNamePlaceholder')}
                    className="w-full px-3 py-2 border border-line rounded-xl text-xs font-semibold focus:ring-2 focus:ring-brand bg-raised focus:bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-ink mb-1">
                    {t('senderMobile')} <span className="text-muted font-normal">{t('optional')}</span>
                  </label>
                  <input
                    type="text"
                    value={senderAccount}
                    onChange={(e) => setSenderAccount(e.target.value)}
                    placeholder={t('senderMobilePlaceholder')}
                    dir="ltr"
                    className="w-full px-3 py-2 border border-line rounded-xl text-xs font-semibold focus:ring-2 focus:ring-brand bg-raised focus:bg-surface"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex gap-3">
                <button
                  type="submit"
                  disabled={submitting || uploadingImage || (!transactionId.trim() && !uploadedProofUrl)}
                  className="flex-1 py-3 px-4 rounded-2xl font-extrabold text-sm text-on-brand bg-brand hover:bg-brand-500 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-1.5"
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
                  className="py-3 px-4 rounded-2xl font-extrabold text-xs text-muted bg-raised hover:bg-line transition-colors"
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

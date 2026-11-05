'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { useT } from '@/lib/i18n';
import { joinMessages } from '@/lib/i18n/messages/join';
import { bankAccountIsWrong } from '@/lib/payout-account';
import { commonMessages } from '@/lib/i18n/messages/common';
import { cn } from '@/lib/utils';
import { fieldClass, hintClass, labelClass, textareaClass } from '@/components/sellers/product-form/fields';
import { Plus, X } from 'lucide-react';

interface SellerOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface FormData {
  // Step 1: Business Info
  businessName: string;
  businessNameUrdu: string;
  description: string;
  // Step 2: Location
  city: string;
  area: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  // Step 3: Payment Info
  jazzcashNumber: string;
  easypaisaNumber: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountTitle: string;
  // Step 4: Profile & Media
  profileImageUrl: string;
  coverImageUrl: string;
  // Step 5: Verification
  cnicFrontUrl: string;
  cnicBackUrl: string;
  kitchenPhotoUrls: string[];
  kitchenVideoUrl: string;
}

import LocationMap from '@/components/ui/LocationMap';
import { CITIES } from '@/lib/cities';
import { reverseGeocode } from '@/lib/geocode';
import { useShallow } from 'zustand/react/shallow';

export function SellerOnboardingModal({ isOpen, onClose, onComplete }: SellerOnboardingModalProps) {
  const { showToast } = useToast();
  const t = useT(joinMessages);
  const tc = useT(commonMessages);
  const { user } = useAuthStore(useShallow((s) => ({ user: s.user })));
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<FormData>({
    businessName: '',
    businessNameUrdu: '',
    description: '',
    city: '',
    area: '',
    address: '',
    latitude: null,
    longitude: null,
    jazzcashNumber: '',
    easypaisaNumber: '',
    bankName: '',
    bankAccountNumber: '',
    bankAccountTitle: '',
    profileImageUrl: '',
    coverImageUrl: '',
    cnicFrontUrl: '',
    cnicBackUrl: '',
    kitchenPhotoUrls: [],
    kitchenVideoUrl: '',
  });

  const totalSteps = 5;

  const handleLocationSelect = async (coords: { lat: number; lng: number; address?: string }) => {
    setFormData(prev => ({
      ...prev,
      latitude: coords.lat,
      longitude: coords.lng,
      address: coords.address || prev.address,
    }));
    const place = await reverseGeocode(coords.lat, coords.lng);
    // The list below only offers listed cities, so an unlisted one leaves the choice as it was.
    const city = (CITIES as readonly string[]).includes(place.city) ? place.city : '';
    setFormData(prev => ({
      ...prev,
      city: city || prev.city,
      area: place.area || place.street || prev.area,
      address: place.displayName || prev.address,
      latitude: coords.lat,
      longitude: coords.lng,
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, [field]: t('ob.fileTooBig') }));
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (field === 'kitchenPhotoUrls') {
        setFormData(prev => ({ ...prev, kitchenPhotoUrls: [...prev.kitchenPhotoUrls, result] }));
      } else {
        setFormData(prev => ({ ...prev, [field]: result }));
      }
      if (errors[field]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const removeKitchenPhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      kitchenPhotoUrls: prev.kitchenPhotoUrls.filter((_, i) => i !== index),
    }));
  };

  const validateStep = (stepNum: number): boolean => {
    const newErrors: Record<string, string> = {};

    switch (stepNum) {
      case 1:
        if (!formData.businessName.trim()) {
          newErrors.businessName = t('ob.nameRequired');
        } else if (formData.businessName.trim().length < 3) {
          newErrors.businessName = t('errNameShort');
        }
        break;
      case 2:
        if (!formData.city) {
          newErrors.city = t('ob.cityRequired');
        }
        if (!formData.area.trim()) {
          newErrors.area = t('ob.areaRequired');
        }
        break;
      case 3:
        // Payment info is optional but validate format if provided
        if (formData.jazzcashNumber && !/^03\d{9}$/.test(formData.jazzcashNumber)) {
          newErrors.jazzcashNumber = t('ob.jazzInvalid');
        }
        if (formData.easypaisaNumber && !/^03\d{9}$/.test(formData.easypaisaNumber)) {
          newErrors.easypaisaNumber = t('ob.easyInvalid');
        }
        // Customers pay into this account: a wrong digit pays a stranger.
        if (bankAccountIsWrong(formData.bankAccountNumber)) {
          newErrors.bankAccountNumber = t('ob.bankInvalid');
        }
        break;
      case 4:
        // Profile image is optional
        break;
      case 5:
        // Verification docs are optional for initial submission
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, totalSteps));
    }
  };

  const handleBack = () => {
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    setLoading(true);
    try {
      const sellerData: Record<string, unknown> = {
        businessName: formData.businessName,
      };

      // Add optional fields if provided
      if (formData.businessNameUrdu) sellerData.businessNameUrdu = formData.businessNameUrdu;
      if (formData.description) sellerData.description = formData.description;
      if (formData.city) sellerData.city = formData.city;
      if (formData.area) sellerData.area = formData.area;
      if (formData.address) sellerData.address = formData.address;
      if (formData.latitude) sellerData.latitude = formData.latitude;
      if (formData.longitude) sellerData.longitude = formData.longitude;
      if (formData.jazzcashNumber) sellerData.jazzcashNumber = formData.jazzcashNumber;
      if (formData.easypaisaNumber) sellerData.easypaisaNumber = formData.easypaisaNumber;
      if (formData.bankName) sellerData.bankName = formData.bankName;
      if (formData.bankAccountNumber) sellerData.bankAccountNumber = formData.bankAccountNumber;
      if (formData.bankAccountTitle) sellerData.bankAccountTitle = formData.bankAccountTitle;
      if (formData.profileImageUrl) sellerData.profileImageUrl = formData.profileImageUrl;
      if (formData.coverImageUrl) sellerData.coverImageUrl = formData.coverImageUrl;
      if (formData.cnicFrontUrl) sellerData.cnicFrontUrl = formData.cnicFrontUrl;
      if (formData.cnicBackUrl) sellerData.cnicBackUrl = formData.cnicBackUrl;
      if (formData.kitchenPhotoUrls.length > 0) sellerData.kitchenPhotoUrls = formData.kitchenPhotoUrls;
      if (formData.kitchenVideoUrl) sellerData.kitchenVideoUrl = formData.kitchenVideoUrl;

      const response = await apiClient.post('/sellers/register', sellerData);

      if (response.data.success) {
        showToast(t('ob.submitted'), 'success');
        onComplete();
      }
    } catch (error) {
      const errorMessage = apiErrorMessage(error, t('ob.registerFailed'));
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    // Allow skipping optional steps
    if (step === 3 || step === 4 || step === 5) {
      if (step === totalSteps) {
        handleSubmit();
      } else {
        setStep(prev => prev + 1);
      }
    }
  };

  if (!isOpen) return null;

  const field = (name: string) => cn(fieldClass, errors[name] && 'border-red-700 bg-red-50');
  const fieldError = (name: string) =>
    errors[name] ? <p className="mt-1.5 text-sm text-red-700">{errors[name]}</p> : null;
  const required = <span className="text-muted">*</span>;
  const optional = <span className="text-muted font-normal">{t('ob.optional')}</span>;
  const dropClass =
    'flex flex-col items-center justify-center gap-1 border border-dashed border-line-strong bg-raised text-muted cursor-pointer hover:border-brand-600 hover:text-ink transition-colors focus-within:ring-3 focus-within:ring-brand/40';

  /** A small round "remove" mark on a photo, with a 44px tap area around it. */
  const removeButton = (onClick: () => void, place: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={tc('remove')}
      className={`absolute ${place} w-11 h-11 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40`}
    >
      <span aria-hidden="true" className="w-7 h-7 rounded-full bg-surface border border-line-strong text-ink shadow-sm flex items-center justify-center">
        <X className="w-4 h-4" />
      </span>
    </button>
  );

  const stepHeading = (title: string, sub: string) => (
    <div className="mb-6">
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
      <p className="text-sm text-muted mt-0.5">{sub}</p>
    </div>
  );

  const renderStepIndicator = () => (
    <div className="flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={`h-1.5 flex-1 rounded-full ${s < step ? 'bg-brand-600' : s === step ? 'bg-brand-300' : 'bg-raised'}`} />
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div>
      {stepHeading(t('ob.s1Title'), t('ob.s1Sub'))}
      <div className="space-y-5">
        <div>
          <label htmlFor="ob-businessName" className={labelClass}>
            {t('ob.nameEn')} {required}
          </label>
          <input
            id="ob-businessName"
            type="text"
            name="businessName"
            value={formData.businessName}
            onChange={handleInputChange}
            className={field('businessName')}
            aria-invalid={Boolean(errors.businessName)}
            placeholder={t('ob.nameEnPh')}
          />
          {fieldError('businessName')}
        </div>

        <div>
          <label htmlFor="ob-businessNameUrdu" className={labelClass}>
            {t('ob.nameUr')} {optional}
          </label>
          <input
            id="ob-businessNameUrdu"
            type="text"
            name="businessNameUrdu"
            value={formData.businessNameUrdu}
            onChange={handleInputChange}
            className={fieldClass}
            placeholder={t('ob.nameUrPh')}
            dir="rtl"
          />
        </div>

        <div>
          <label htmlFor="ob-description" className={labelClass}>
            {t('ob.description')} {optional}
          </label>
          <textarea
            id="ob-description"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            rows={3}
            className={textareaClass}
            placeholder={t('ob.descPh')}
          />
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div>
      {stepHeading(t('ob.s2Title'), t('ob.s2Sub'))}
      <div className="space-y-5">
        <LocationMap
          center={{
            lat: formData.latitude || 31.5204,
            lng: formData.longitude || 74.3587,
          }}
          markerPosition={
            formData.latitude && formData.longitude
              ? { lat: formData.latitude, lng: formData.longitude }
              : null
          }
          onLocationSelect={handleLocationSelect}
          height="240px"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ob-city" className={labelClass}>
              {t('ob.city')} {required}
            </label>
            <select
              id="ob-city"
              name="city"
              value={formData.city}
              onChange={handleInputChange}
              className={field('city')}
              aria-invalid={Boolean(errors.city)}
            >
              <option value="">{t('ob.selectCity')}</option>
              {CITIES.map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
            {fieldError('city')}
          </div>

          <div>
            <label htmlFor="ob-area" className={labelClass}>
              {t('ob.area')} {required}
            </label>
            <input
              id="ob-area"
              type="text"
              name="area"
              value={formData.area}
              onChange={handleInputChange}
              className={field('area')}
              aria-invalid={Boolean(errors.area)}
              placeholder={t('ob.areaPh')}
            />
            {fieldError('area')}
          </div>
        </div>

        <div>
          <label htmlFor="ob-address" className={labelClass}>
            {t('ob.fullAddress')}
          </label>
          <input
            id="ob-address"
            type="text"
            name="address"
            value={formData.address}
            onChange={handleInputChange}
            className={fieldClass}
            placeholder={t('ob.addressPh')}
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div>
      {stepHeading(t('ob.s3Title'), t('ob.s3Sub'))}

      <section aria-labelledby="ob-wallets">
        <h4 id="ob-wallets" className="text-sm font-semibold text-ink mb-4">{t('ob.mobileWallets')}</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ob-jazzcash" className={labelClass}>
              {t('ob.jazzcash')}
            </label>
            <input
              id="ob-jazzcash"
              dir="ltr"
              type="tel"
              name="jazzcashNumber"
              value={formData.jazzcashNumber}
              onChange={handleInputChange}
              className={field('jazzcashNumber')}
              aria-invalid={Boolean(errors.jazzcashNumber)}
              placeholder="03XXXXXXXXX"
              maxLength={11}
            />
            {fieldError('jazzcashNumber')}
          </div>
          <div>
            <label htmlFor="ob-easypaisa" className={labelClass}>
              {t('ob.easypaisa')}
            </label>
            <input
              id="ob-easypaisa"
              dir="ltr"
              type="tel"
              name="easypaisaNumber"
              value={formData.easypaisaNumber}
              onChange={handleInputChange}
              className={field('easypaisaNumber')}
              aria-invalid={Boolean(errors.easypaisaNumber)}
              placeholder="03XXXXXXXXX"
              maxLength={11}
            />
            {fieldError('easypaisaNumber')}
          </div>
        </div>
      </section>

      <section aria-labelledby="ob-bank" className="mt-6 pt-6 border-t border-line">
        <h4 id="ob-bank" className="text-sm font-semibold text-ink mb-4">{t('ob.bankOptional')}</h4>
        <div className="space-y-4">
          <div>
            <label htmlFor="ob-bankName" className={labelClass}>{t('bankName')}</label>
            <select
              id="ob-bankName"
              name="bankName"
              value={formData.bankName}
              onChange={handleInputChange}
              className={fieldClass}
            >
              <option value="">{t('ob.selectBank')}</option>
              <option value="HBL">HBL - Habib Bank Limited</option>
              <option value="MCB">MCB Bank</option>
              <option value="UBL">UBL - United Bank Limited</option>
              <option value="Allied">Allied Bank</option>
              <option value="Meezan">Meezan Bank</option>
              <option value="Faysal">Faysal Bank</option>
              <option value="Bank Alfalah">Bank Alfalah</option>
              <option value="Standard Chartered">Standard Chartered</option>
              <option value="Other">{t('ob.otherBank')}</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="ob-bankAccountNumber" className={labelClass}>{t('ob.accountNumber')}</label>
              <input
                id="ob-bankAccountNumber"
                dir="ltr"
                type="text"
                name="bankAccountNumber"
                value={formData.bankAccountNumber}
                onChange={handleInputChange}
                className={field('bankAccountNumber')}
                placeholder={t('ob.accountNumber')}
                aria-invalid={Boolean(errors.bankAccountNumber)}
              />
              {fieldError('bankAccountNumber')}
            </div>
            <div>
              <label htmlFor="ob-bankAccountTitle" className={labelClass}>{t('accountTitle')}</label>
              <input
                id="ob-bankAccountTitle"
                type="text"
                name="bankAccountTitle"
                value={formData.bankAccountTitle}
                onChange={handleInputChange}
                className={fieldClass}
                placeholder={t('ob.holderPh')}
              />
            </div>
          </div>
        </div>
      </section>

      <p className="mt-6 text-sm text-muted">{t('ob.payLater')}</p>
    </div>
  );

  const renderStep4 = () => (
    <div>
      {stepHeading(t('ob.s4Title'), t('ob.s4Sub'))}

      <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-6">
        <div>
          <p className={labelClass}>{t('ob.profileImage')}</p>
          {formData.profileImageUrl ? (
            <div className="relative w-32 h-32">
              <img
                src={formData.profileImageUrl}
                alt={t('ob.altProfile')}
                className="w-32 h-32 rounded-full object-cover border border-line"
              />
              {removeButton(() => setFormData(prev => ({ ...prev, profileImageUrl: '' })), '-top-2 -end-2')}
            </div>
          ) : (
            <label className={`${dropClass} w-32 h-32 rounded-full`}>
              <Plus className="w-6 h-6" aria-hidden="true" />
              <span className="text-sm">{t('ob.addPhoto')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'profileImageUrl')}
                className="sr-only"
              />
            </label>
          )}
          <p className={hintClass}>{t('ob.profileHint')}</p>
          {fieldError('profileImageUrl')}
        </div>

        <div>
          <p className={labelClass}>{t('ob.coverImage')}</p>
          {formData.coverImageUrl ? (
            <div className="relative">
              <img
                src={formData.coverImageUrl}
                alt={t('ob.altCover')}
                className="w-full h-32 rounded-xl object-cover border border-line"
              />
              {removeButton(() => setFormData(prev => ({ ...prev, coverImageUrl: '' })), 'top-0 end-0')}
            </div>
          ) : (
            <label className={`${dropClass} w-full h-32 rounded-xl`}>
              <Plus className="w-6 h-6" aria-hidden="true" />
              <span className="text-sm">{t('ob.addCover')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'coverImageUrl')}
                className="sr-only"
              />
            </label>
          )}
          <p className={hintClass}>{t('ob.coverHint')}</p>
          {fieldError('coverImageUrl')}
        </div>
      </div>
    </div>
  );

  const cnicSide = (key: 'cnicFrontUrl' | 'cnicBackUrl', title: string, alt: string) => (
    <div>
      <p className={labelClass}>{title}</p>
      {formData[key] ? (
        <div className="relative">
          <img src={formData[key]} alt={alt} className="w-full h-28 object-cover rounded-xl border border-line" />
          {removeButton(() => setFormData(prev => ({ ...prev, [key]: '' })), 'top-0 end-0')}
        </div>
      ) : (
        <label className={`${dropClass} h-28 rounded-xl`}>
          <Plus className="w-5 h-5" aria-hidden="true" />
          <span className="text-sm">{t('ob.upload')}</span>
          <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, key)} className="sr-only" />
        </label>
      )}
      {fieldError(key)}
    </div>
  );

  const renderStep5 = () => (
    <div>
      {stepHeading(t('ob.s5Title'), t('ob.s5Sub'))}

      <section aria-labelledby="ob-cnic">
        <h4 id="ob-cnic" className="text-sm font-semibold text-ink mb-4">{t('ob.cnicPhotos')}</h4>
        <div className="grid grid-cols-2 gap-4">
          {cnicSide('cnicFrontUrl', t('ob.frontSide'), t('ob.altCnicFront'))}
          {cnicSide('cnicBackUrl', t('ob.backSide'), t('ob.altCnicBack'))}
        </div>
      </section>

      <section aria-labelledby="ob-kitchen" className="mt-6 pt-6 border-t border-line">
        <h4 id="ob-kitchen" className="text-sm font-semibold text-ink mb-4">{t('ob.kitchenPhotos')}</h4>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {formData.kitchenPhotoUrls.map((url, index) => (
            <div key={index} className="relative">
              <img src={url} alt={t('ob.altKitchen', { n: index + 1 })} className="w-full h-20 object-cover rounded-xl border border-line" />
              {removeButton(() => removeKitchenPhoto(index), 'top-0 end-0')}
            </div>
          ))}
          {formData.kitchenPhotoUrls.length < 6 && (
            <label className={`${dropClass} h-20 rounded-xl`}>
              <Plus className="w-5 h-5" aria-hidden="true" />
              <span className="sr-only">{t('ob.kitchenPhotos')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'kitchenPhotoUrls')}
                className="sr-only"
              />
            </label>
          )}
        </div>
        <p className={hintClass}>{t('ob.kitchenPhotosHint')}</p>
        {fieldError('kitchenPhotoUrls')}
      </section>

      <section className="mt-6 pt-6 border-t border-line">
        <label htmlFor="ob-kitchenVideoUrl" className="block text-sm font-semibold text-ink mb-4">{t('ob.kitchenVideo')}</label>
        <input
          id="ob-kitchenVideoUrl"
          type="url"
          dir="ltr"
          name="kitchenVideoUrl"
          value={formData.kitchenVideoUrl}
          onChange={handleInputChange}
          className={fieldClass}
          placeholder={t('ob.videoPh')}
        />
      </section>

      <p className="mt-6 rounded-xl bg-raised px-4 py-3 text-sm text-ink">{t('ob.docsNote')}</p>
    </div>
  );

  const stepTitles = [t('ob.step1'), t('ob.step2'), t('ob.step3'), t('ob.step4'), t('ob.step5')];

  // On document.body, so the page's own layers (the fixed top bar) cannot sit above the dialog.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+var(--safe-bottom))]">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-title"
        className="relative flex flex-col bg-surface border border-line rounded-[20px] shadow-2xl w-full max-w-2xl max-h-full overflow-hidden"
      >
        <div className="px-5 sm:px-6 pt-4 pb-4 border-b border-line">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 pt-1.5">
              <h2 id="ob-title" className="text-lg font-semibold text-ink">{t('ob.header')}</h2>
              <p className="text-sm text-muted">{t('ob.stepOf', { step, total: totalSteps, title: stepTitles[step - 1] })}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={tc('close')}
              className="-me-2 w-11 h-11 shrink-0 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-4">{renderStepIndicator()}</div>
        </div>

        <div className="flex-1 min-h-0 px-5 sm:px-6 py-6 overflow-y-auto">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </div>

        <div className="border-t border-line px-5 sm:px-6 py-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={loading}
              className="self-start"
            >
              {t('ob.back')}
            </Button>
          )}

          <div className="flex items-center gap-2 sm:ms-auto">
            {(step === 3 || step === 4 || step === 5) && (
              <Button type="button" variant="ghost" onClick={handleSkip} disabled={loading} className="px-4 whitespace-nowrap">
                {t('ob.skip')}
              </Button>
            )}

            {step < totalSteps ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={loading}
                className="flex-1 sm:flex-none"
              >
                {t('ob.next')}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 sm:flex-none whitespace-nowrap"
              >
                {loading ? (
                  <>
                    <span aria-hidden="true" className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    {t('ob.submitting')}
                  </>
                ) : (
                  t('ob.submit')
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

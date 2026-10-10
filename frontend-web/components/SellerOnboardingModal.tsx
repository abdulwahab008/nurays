'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { useT } from '@/lib/i18n';
import { joinMessages } from '@/lib/i18n/messages/join';

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
import { CITIES, cityFromGeocoder } from '@/lib/cities';

export function SellerOnboardingModal({ isOpen, onClose, onComplete }: SellerOnboardingModalProps) {
  const { showToast } = useToast();
  const t = useT(joinMessages);
  const { user } = useAuthStore();
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
    await reverseGeocode(coords.lat, coords.lng);
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
      );
      if (!response.ok) return;
      const data = await response.json();
      
      if (data.address) {
        // The city the map's words name, else the one the pin is in. The list below only offers listed cities, so an
        // unlisted one leaves the choice as it was.
        const named = cityFromGeocoder(data.address, lat, lng);
        const city = (CITIES as readonly string[]).includes(named) ? named : '';

        const area = data.address.suburb || data.address.neighbourhood || data.address.road || '';
        const fullAddress = data.display_name || '';

        setFormData(prev => ({
          ...prev,
          city: city || prev.city,
          area: area || prev.area,
          address: fullAddress || prev.address,
          latitude: lat,
          longitude: lng,
        }));
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
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
      const sellerData: any = {
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
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || t('ob.registerFailed');
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

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3, 4, 5].map((s, idx) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all duration-300 ${
              s < step
                ? 'bg-gray-600 text-white'
                : s === step
                ? 'bg-gray-600 text-white ring-4 ring-gray-100'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {s < step ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              s
            )}
          </div>
          {idx < 4 && (
            <div className={`w-12 h-1 mx-1 rounded ${s < step ? 'bg-gray-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900">{t('ob.s1Title')}</h3>
        <p className="text-gray-500 mt-1">{t('ob.s1Sub')}</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('ob.nameEn')} <span className="text-gray-600">*</span>
        </label>
        <input
          type="text"
          name="businessName"
          value={formData.businessName}
          onChange={handleInputChange}
          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all ${
            errors.businessName ? 'border-red-500 bg-red-50' : 'border-gray-300'
          }`}
          placeholder={t('ob.nameEnPh')}
        />
        {errors.businessName && (
          <p className="text-gray-600 text-sm mt-1 flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {errors.businessName}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('ob.nameUr')} <span className="text-gray-400 text-xs">{t('ob.optional')}</span>
        </label>
        <input
          type="text"
          name="businessNameUrdu"
          value={formData.businessNameUrdu}
          onChange={handleInputChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
          placeholder={t('ob.nameUrPh')}
          dir="rtl"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('ob.description')} <span className="text-gray-400 text-xs">{t('ob.optional')}</span>
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all resize-none"
          placeholder={t('ob.descPh')}
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <div className="text-center mb-3">
        <h3 className="text-lg font-bold text-gray-900">{t('ob.s2Title')}</h3>
        <p className="text-gray-500 text-xs mt-0.5">{t('ob.s2Sub')}</p>
      </div>

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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {t('ob.city')} <span className="text-red-500">*</span>
          </label>
          <select
            name="city"
            value={formData.city}
            onChange={handleInputChange}
            className={`w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-emerald-500 ${
              errors.city ? 'border-red-500 bg-red-50' : 'border-gray-200'
            }`}
          >
            <option value="">{t('ob.selectCity')}</option>
            {CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {t('ob.area')} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="area"
            value={formData.area}
            onChange={handleInputChange}
            className={`w-full px-3 py-2 text-sm border rounded-xl focus:ring-2 focus:ring-emerald-500 ${
              errors.area ? 'border-red-500 bg-red-50' : 'border-gray-200'
            }`}
            placeholder={t('ob.areaPh')}
          />
          {errors.area && <p className="text-red-500 text-xs mt-1">{errors.area}</p>}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          {t('ob.fullAddress')}
        </label>
        <input
          type="text"
          name="address"
          value={formData.address}
          onChange={handleInputChange}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
          placeholder={t('ob.addressPh')}
        />
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900">{t('ob.s3Title')}</h3>
        <p className="text-gray-500 mt-1">{t('ob.s3Sub')}</p>
      </div>

      {/* Mobile Wallets */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 p-4 rounded-xl border border-red-100">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
          {t('ob.mobileWallets')}
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('ob.jazzcash')}
            </label>
            <input
              dir="ltr"
              type="tel"
              name="jazzcashNumber"
              value={formData.jazzcashNumber}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-400 focus:border-red-400 transition-all ${
                errors.jazzcashNumber ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="03XXXXXXXXX"
              maxLength={11}
            />
            {errors.jazzcashNumber && <p className="text-gray-600 text-sm mt-1">{errors.jazzcashNumber}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('ob.easypaisa')}
            </label>
            <input
              dir="ltr"
              type="tel"
              name="easypaisaNumber"
              value={formData.easypaisaNumber}
              onChange={handleInputChange}
              className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-400 focus:border-green-400 transition-all ${
                errors.easypaisaNumber ? 'border-red-500 bg-red-50' : 'border-gray-300'
              }`}
              placeholder="03XXXXXXXXX"
              maxLength={11}
            />
            {errors.easypaisaNumber && <p className="text-gray-600 text-sm mt-1">{errors.easypaisaNumber}</p>}
          </div>
        </div>
      </div>

      {/* Bank Account */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
          </svg>
          {t('ob.bankOptional')}
        </h4>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('bankName')}</label>
            <select
              name="bankName"
              value={formData.bankName}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('ob.accountNumber')}</label>
              <input
                dir="ltr"
                type="text"
                name="bankAccountNumber"
                value={formData.bankAccountNumber}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                placeholder={t('ob.accountNumber')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('accountTitle')}</label>
              <input
                type="text"
                name="bankAccountTitle"
                value={formData.bankAccountTitle}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                placeholder={t('ob.holderPh')}
              />
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        {t('ob.payLater')}
      </p>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900">{t('ob.s4Title')}</h3>
        <p className="text-gray-500 mt-1">{t('ob.s4Sub')}</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Profile Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('ob.profileImage')}</label>
          <div className="relative">
            {formData.profileImageUrl ? (
              <div className="relative">
                <img
                  src={formData.profileImageUrl}
                  alt={t('ob.altProfile')}
                  className="w-32 h-32 rounded-full object-cover mx-auto border-4 border-green-200"
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, profileImageUrl: '' }))}
                  className="absolute top-0 end-1/4 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-32 h-32 mx-auto border-2 border-dashed border-gray-300 rounded-full cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-xs text-gray-500 mt-1">{t('ob.addPhoto')}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'profileImageUrl')}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">{t('ob.profileHint')}</p>
        </div>

        {/* Cover Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('ob.coverImage')}</label>
          <div className="relative">
            {formData.coverImageUrl ? (
              <div className="relative">
                <img
                  src={formData.coverImageUrl}
                  alt={t('ob.altCover')}
                  className="w-full h-32 rounded-xl object-cover border-2 border-green-200"
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, coverImageUrl: '' }))}
                  className="absolute top-2 end-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-gray-500 mt-1">{t('ob.addCover')}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'coverImageUrl')}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">{t('ob.coverHint')}</p>
        </div>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900">{t('ob.s5Title')}</h3>
        <p className="text-gray-500 mt-1">{t('ob.s5Sub')}</p>
      </div>

      {/* CNIC Section */}
      <div className="bg-gray-50 p-4 rounded-xl">
        <h4 className="font-semibold text-gray-800 mb-3">{t('ob.cnicPhotos')}</h4>
        <div className="grid grid-cols-2 gap-4">
          {/* CNIC Front */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('ob.frontSide')}</label>
            {formData.cnicFrontUrl ? (
              <div className="relative">
                <img src={formData.cnicFrontUrl} alt={t('ob.altCnicFront')} className="w-full h-24 object-cover rounded-lg border" />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, cnicFrontUrl: '' }))}
                  className="absolute top-1 end-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-xs text-gray-500">{t('ob.upload')}</span>
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'cnicFrontUrl')} className="hidden" />
              </label>
            )}
          </div>

          {/* CNIC Back */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('ob.backSide')}</label>
            {formData.cnicBackUrl ? (
              <div className="relative">
                <img src={formData.cnicBackUrl} alt={t('ob.altCnicBack')} className="w-full h-24 object-cover rounded-lg border" />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, cnicBackUrl: '' }))}
                  className="absolute top-1 end-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-xs text-gray-500">{t('ob.upload')}</span>
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'cnicBackUrl')} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Kitchen Photos */}
      <div className="bg-gray-50 p-4 rounded-xl">
        <h4 className="font-semibold text-gray-800 mb-3">{t('ob.kitchenPhotos')}</h4>
        <div className="grid grid-cols-4 gap-2">
          {formData.kitchenPhotoUrls.map((url, index) => (
            <div key={index} className="relative">
              <img src={url} alt={t('ob.altKitchen', { n: index + 1 })} className="w-full h-20 object-cover rounded-lg border" />
              <button
                type="button"
                onClick={() => removeKitchenPhoto(index)}
                className="absolute top-1 end-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
              >
                ×
              </button>
            </div>
          ))}
          {formData.kitchenPhotoUrls.length < 6 && (
            <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleFileUpload(e, 'kitchenPhotoUrls')}
                className="hidden"
              />
            </label>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-2">{t('ob.kitchenPhotosHint')}</p>
      </div>

      {/* Kitchen Video */}
      <div className="bg-gray-50 p-4 rounded-xl">
        <h4 className="font-semibold text-gray-800 mb-3">{t('ob.kitchenVideo')}</h4>
        <input
          type="url"
          dir="ltr"
          name="kitchenVideoUrl"
          value={formData.kitchenVideoUrl}
          onChange={handleInputChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
          placeholder={t('ob.videoPh')}
        />
      </div>

      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
        <p className="text-sm text-gray-800 flex items-start gap-2">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span>
            {t('ob.docsNote')}
          </span>
        </p>
      </div>
    </div>
  );

  const stepTitles = [t('ob.step1'), t('ob.step2'), t('ob.step3'), t('ob.step4'), t('ob.step5')];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-green-500 px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{t('ob.header')}</h2>
              <p className="text-gray-100 text-sm">{t('ob.stepOf', { step, total: totalSteps, title: stepTitles[step - 1] })}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pt-6">
          {renderStepIndicator()}
        </div>

        {/* Content */}
        <div className="px-6 pb-6 overflow-y-auto max-h-[50vh]">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={loading}
              >
                {t('ob.back')}
              </Button>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            {(step === 3 || step === 4 || step === 5) && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="text-gray-500 hover:text-gray-700 text-sm font-medium"
              >
                {t('ob.skip')}
              </button>
            )}
            
            {step < totalSteps ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={loading}
                className="bg-gray-700 hover:bg-gray-800 text-white px-6"
              >
                {t('ob.next')}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="bg-gray-700 hover:bg-gray-800 text-white px-8"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('ob.submitting')}
                  </span>
                ) : (
                  t('ob.submit')
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

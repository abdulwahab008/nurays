'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import LocationMap from '@/components/ui/LocationMap';
import FileUploadField from '@/components/ui/FileUploadField';
import { useT } from '@/lib/i18n';
import { joinMessages, type JoinMessageKey } from '@/lib/i18n/messages/join';

interface CommunityOption {
  id: string;
  name: string;
  city: string;
  centerLatitude: number;
  centerLongitude: number;
}


const BUSINESS_TYPES: { id: string; title: JoinMessageKey; desc: JoinMessageKey }[] = [
  { id: 'home_kitchen', title: 'bt.home_kitchen', desc: 'bt.home_kitchen.desc' },
  { id: 'restaurant', title: 'bt.restaurant', desc: 'bt.restaurant.desc' },
  { id: 'bakery', title: 'bt.bakery', desc: 'bt.bakery.desc' },
  { id: 'cafe', title: 'bt.cafe', desc: 'bt.cafe.desc' },
  { id: 'cloud_kitchen', title: 'bt.cloud_kitchen', desc: 'bt.cloud_kitchen.desc' },
];

// The value is what gets saved (in English); the key is what the applicant reads.
const FOOD_CATEGORIES: { value: string; key: JoinMessageKey }[] = [
  { value: 'Biryani', key: 'cat.biryani' },
  { value: 'Burgers', key: 'cat.burgers' },
  { value: 'Karahi & Handi', key: 'cat.karahi' },
  { value: 'Pizza', key: 'cat.pizza' },
  { value: 'Pasta', key: 'cat.pasta' },
  { value: 'Curries', key: 'cat.curries' },
  { value: 'Parathas & Rolls', key: 'cat.parathas' },
  { value: 'Kebabs & BBQ', key: 'cat.kebabs' },
  { value: 'Desserts & Sweets', key: 'cat.desserts' },
  { value: 'Beverages & Shakes', key: 'cat.beverages' },
  { value: 'Snacks & Appetizers', key: 'cat.snacks' },
];

export default function SellerRegisterPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const t = useT(joinMessages);
  const [loading, setLoading] = useState(false);
  const [sellerInfo, setSellerInfo] = useState<any>(null);
  const [loadingSellerInfo, setLoadingSellerInfo] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);

  const [formData, setFormData] = useState({
    businessName: '',
    businessNameUrdu: '',
    businessType: 'home_kitchen',
    ownerName: '',
    phone: '',
    email: '',
    description: '',
    communityId: '',
    primaryCommunityName: '',
    houseOrUnitNumber: '',
    address: '',
    latitude: null as number | null,
    longitude: null as number | null,
    mealCategories: [] as string[],
    deliveryModes: ['delivery', 'pickup'],
    bankAccountName: '',
    bankAccountNumber: '',
    bankName: '',
    jazzcashNumber: '',
    easypaisaNumber: '',
    coverImageUrl: '',
    kitchenVideoUrl: '',
    cnicFrontUrl: null as string | null,
    cnicBackUrl: null as string | null,
    kitchenPhotoUrls: [null, null] as Array<string | null>,
    agreeToTerms: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [communities, setCommunities] = useState<CommunityOption[]>([]);

  useEffect(() => {
    apiClient
      .get('/communities')
      .then((res) => setCommunities(res.data.data || []))
      .catch(() => setCommunities([]));
  }, []);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? (sessionStorage.getItem('access_token') || localStorage.getItem('access_token')) : null;
    if (!token && !isAuthenticated) {
      router.push('/login');
      return;
    }

    loadSellerInfo();
  }, [isAuthenticated, router]);

  const loadSellerInfo = async () => {
    try {
      setLoadingSellerInfo(true);
      const response = await apiClient.get('/sellers/me/dashboard');
      if (response.data.success && response.data.data) {
        const seller = response.data.data;
        setSellerInfo(seller);
        setFormData(prev => ({
          ...prev,
          businessName: seller.businessName || '',
          businessNameUrdu: seller.businessNameUrdu || '',
          businessType: seller.businessType || 'home_kitchen',
          description: seller.description || '',
          primaryCommunityName: seller.primaryCommunityName || '',
          communityId: seller.communityId || '',
          coverImageUrl: seller.coverImageUrl || '',
          kitchenVideoUrl: seller.kitchenVideoUrl || '',
        }));
      }
    } catch {
      // User is not yet a registered seller, standard registration form applies
    } finally {
      setLoadingSellerInfo(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const n = { ...prev };
        delete n[name];
        return n;
      });
    }
  };

  const toggleCategory = (cat: string) => {
    setFormData(prev => {
      const exists = prev.mealCategories.includes(cat);
      return {
        ...prev,
        mealCategories: exists ? prev.mealCategories.filter(c => c !== cat) : [...prev.mealCategories, cat],
      };
    });
  };

  const detectLocation = () => {
    setDetectingGps(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFormData(prev => ({
            ...prev,
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
          }));
          setDetectingGps(false);
          showToast(t('reg.gpsDetected'), 'success');
        },
        () => {
          setDetectingGps(false);
          showToast(t('reg.gpsBlocked'), 'info');
        }
      );
    } else {
      setDetectingGps(false);
      showToast(t('reg.gpsUnsupported'), 'info');
    }
  };

  const isApproved = sellerInfo?.verificationStatus === 'approved' || sellerInfo?.verificationStatus === 'verified';
  const isPending = sellerInfo?.verificationStatus === 'pending';
  const isRejected = sellerInfo?.verificationStatus === 'rejected';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!formData.businessName.trim() || formData.businessName.length < 3) {
      newErrors.businessName = t('errNameShort');
    }
    if (!formData.communityId) {
      newErrors.primaryCommunityName = t('reg.errCommunity');
    }
    if (formData.latitude == null || formData.longitude == null) {
      newErrors.location = t('reg.errLocation');
    }
    if (!isRejected && (!formData.cnicFrontUrl || !formData.cnicBackUrl)) {
      newErrors.cnic = t('reg.errCnic');
    }
    if (!formData.agreeToTerms && (!sellerInfo || sellerInfo.verificationStatus === 'rejected')) {
      newErrors.agreeToTerms = t('reg.errTerms');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast(t('reg.fixErrors'), 'error');
      return;
    }

    try {
      setLoading(true);
      // Only real uploads: nothing is filled in on the applicant's behalf.
      const payload = {
        ...formData,
        latitude: formData.latitude ?? undefined,
        longitude: formData.longitude ?? undefined,
        communityId: formData.communityId || undefined,
        coverImageUrl: formData.coverImageUrl || undefined,
        cnicFrontUrl: formData.cnicFrontUrl || undefined,
        cnicBackUrl: formData.cnicBackUrl || undefined,
        kitchenPhotoUrls: formData.kitchenPhotoUrls.filter((u): u is string => !!u),
      };

      const response = await apiClient.post('/sellers/register', payload);
      if (response.data.success) {
        showToast(response.data.message || t('reg.submitted'), 'success');
        await loadSellerInfo();
        setIsEditing(false);
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || error.response?.data?.message || t('reg.submitFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/dashboard" className="text-sm font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1">
            {t('reg.back')}
          </Link>
          <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 bg-orange-100 text-orange-800 rounded-full">
            {t('reg.portalBadge')}
          </span>
        </div>

        {/* Application Status Banners */}
        {sellerInfo && !isEditing && (
          <div className="mb-8">
            {isApproved && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-black text-xl">
                      ✓
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-emerald-900">{t('reg.approvedTitle')}</h2>
                      <p className="text-sm text-emerald-700">{t('reg.approvedBody')}</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => router.push('/sellers/dashboard')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-6 py-2.5 shadow-md shadow-emerald-200"
                  >
                    {t('reg.openDashboard')}
                  </Button>
                </div>
              </div>
            )}

            {isPending && (
              <div id="pending-approval-banner" className="bg-amber-50 border border-amber-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-xl">
                    ⏳
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-amber-900">{t('reg.pendingTitle')}</h2>
                      <span className="text-xs font-semibold bg-amber-200 text-amber-800 px-3 py-1 rounded-full">{t('reg.pendingBadge')}</span>
                    </div>
                    <p className="text-sm text-amber-700 mt-1">
                      {t('reg.pendingBody')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isRejected && (
              <div id="rejected-banner" className="bg-rose-50 border border-rose-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-rose-500 text-white flex items-center justify-center font-black text-xl">
                      ✕
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-rose-900">{t('reg.rejectedTitle')}</h2>
                      <p id="rejection-reason-text" className="text-sm text-rose-700 mt-0.5">
                        <span className="font-semibold">{t('reg.rejectionReason')}</span> {sellerInfo.rejectionReason || t('reg.rejectionDefault')}
                      </p>
                    </div>
                  </div>
                  <Button
                    id="fix-resubmit-btn"
                    onClick={() => setIsEditing(true)}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl px-5 py-2.5 shadow-md shadow-rose-200"
                  >
                    {t('reg.fixResubmit')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Registration Form Card */}
        {(!sellerInfo || isEditing || (!isApproved && !isPending)) && (
          <form onSubmit={handleSubmit} className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 sm:p-10 space-y-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {isRejected ? t('reg.titleResubmit') : t('reg.title')}
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {t('reg.intro')}
              </p>
            </div>

            {/* Section 1: Business Identity & Type */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs">1</span>
                {t('reg.s1')}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('reg.nameEn')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="business-name-input"
                    type="text"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleInputChange}
                    placeholder={t('reg.nameEnPh')}
                    className={`w-full px-4 py-3 rounded-xl border bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all ${
                      errors.businessName ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                    }`}
                  />
                  {errors.businessName && <p className="text-rose-500 text-xs mt-1 font-medium">{errors.businessName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('reg.nameUr')}
                  </label>
                  <input
                    id="business-name-urdu-input"
                    type="text"
                    name="businessNameUrdu"
                    value={formData.businessNameUrdu}
                    onChange={handleInputChange}
                    placeholder="مثال: دیسی ہانڈی و کچن"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  {t('reg.selectType')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {BUSINESS_TYPES.map(bt => (
                    <button
                      key={bt.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, businessType: bt.id }))}
                      className={`p-3.5 rounded-2xl border text-start transition-all ${
                        formData.businessType === bt.id
                          ? 'border-orange-500 bg-orange-50/50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <p className={`font-bold text-sm ${formData.businessType === bt.id ? 'text-orange-950' : 'text-slate-900'}`}>
                        {t(bt.title)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 leading-snug">{t(bt.desc)}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  {t('reg.bio')}
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder={t('reg.bioPh')}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                />
              </div>
            </div>

            {/* Section 2: Location, Community & GPS */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs">2</span>
                {t('reg.s2')}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('reg.community')} <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="community-select"
                    name="communityId"
                    value={formData.communityId}
                    onChange={(e) => {
                      const c = communities.find((x) => x.id === e.target.value);
                      setFormData((prev) => ({ ...prev, communityId: e.target.value, primaryCommunityName: c ? `${c.name}, ${c.city}` : '' }));
                      setErrors((prev) => {
                        const n = { ...prev };
                        delete n.primaryCommunityName;
                        return n;
                      });
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  >
                    <option value="">{communities.length ? t('reg.chooseCommunity') : t('reg.loadingCommunities')}</option>
                    {communities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}, {c.city}
                      </option>
                    ))}
                  </select>
                  {errors.primaryCommunityName && <p className="text-rose-500 text-xs font-medium mt-1">{errors.primaryCommunityName}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('reg.house')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="house-unit-input"
                    type="text"
                    name="houseOrUnitNumber"
                    value={formData.houseOrUnitNumber}
                    onChange={handleInputChange}
                    placeholder={t('reg.housePh')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>
              </div>

              {/* Interactive Location Map */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {t('reg.mapLabel')}
                  </label>
                  <span className="font-mono text-xs text-slate-500 font-medium" data-ltr>
                    {formData.latitude != null && formData.longitude != null ? `${formData.latitude.toFixed(4)}, ${formData.longitude.toFixed(4)}` : t('reg.notPicked')}
                  </span>
                </div>
                <LocationMap
                  center={(() => {
                    if (formData.latitude != null && formData.longitude != null) return { lat: formData.latitude, lng: formData.longitude };
                    const c = communities.find((x) => x.id === formData.communityId);
                    return c ? { lat: c.centerLatitude, lng: c.centerLongitude } : { lat: 31.5204, lng: 74.3587 };
                  })()}
                  markerPosition={formData.latitude != null && formData.longitude != null ? { lat: formData.latitude, lng: formData.longitude } : null}
                  height="260px"
                  onLocationSelect={(coords) => {
                    setFormData(prev => ({
                      ...prev,
                      latitude: Number(coords.lat.toFixed(6)),
                      longitude: Number(coords.lng.toFixed(6)),
                      address: coords.address || prev.address,
                    }));
                    setErrors((prev) => {
                      const n = { ...prev };
                      delete n.location;
                      return n;
                    });
                  }}
                />
                {errors.location ? (
                  <p className="text-rose-500 text-xs font-medium">{errors.location}</p>
                ) : (
                  <p className="text-xs text-slate-500">{t('reg.mapHelp')}</p>
                )}
              </div>
            </div>

            {/* Section 3: Food Categories & Menus */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs">3</span>
                {t('reg.s3')}
              </h2>

              <div className="flex flex-wrap gap-2">
                {FOOD_CATEGORIES.map(({ value: cat, key: catKey }) => {
                  const selected = formData.mealCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                        selected
                          ? 'bg-orange-500 text-white shadow-sm shadow-orange-200'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {selected ? '✓ ' : '+ '}
                      {t(catKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 4: Bank & Digital Wallets */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs">4</span>
                {t('reg.s4')}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('bankName')}
                  </label>
                  <input
                    id="bank-name-input"
                    type="text"
                    name="bankName"
                    value={formData.bankName}
                    onChange={handleInputChange}
                    placeholder={t('reg.bankNamePh')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('accountTitle')}
                  </label>
                  <input
                    id="bank-account-name-input"
                    type="text"
                    name="bankAccountName"
                    value={formData.bankAccountName}
                    onChange={handleInputChange}
                    placeholder={t('reg.accountTitlePh')}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('reg.accountNumber')}
                  </label>
                  <input
                    dir="ltr"
                    id="bank-account-input"
                    type="text"
                    name="bankAccountNumber"
                    value={formData.bankAccountNumber}
                    onChange={handleInputChange}
                    placeholder="PK00MEZN0000000000000000"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('reg.jazzcash')}
                  </label>
                  <input
                    dir="ltr"
                    id="jazzcash-input"
                    type="text"
                    name="jazzcashNumber"
                    value={formData.jazzcashNumber}
                    onChange={handleInputChange}
                    placeholder="03001234567"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {t('reg.easypaisa')}
                  </label>
                  <input
                    dir="ltr"
                    id="easypaisa-input"
                    type="text"
                    name="easypaisaNumber"
                    value={formData.easypaisaNumber}
                    onChange={handleInputChange}
                    placeholder="03451234567"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Section 5: Documents & Media Verification */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs">5</span>
                {t('reg.s5')}
              </h2>

              <p className="text-xs text-slate-500">
                {t('reg.docsNote')}
                {isRejected ? t('reg.docsNoteRejected') : ''}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FileUploadField
                  kind="document"
                  label={t('reg.cnicFront')}
                  required={!isRejected}
                  value={formData.cnicFrontUrl}
                  onChange={(v) => setFormData((prev) => ({ ...prev, cnicFrontUrl: v }))}
                  onFileText={isRejected ? t('reg.onFileLast') : undefined}
                  testId="cnic-front-upload"
                />
                <FileUploadField
                  kind="document"
                  label={t('reg.cnicBack')}
                  required={!isRejected}
                  value={formData.cnicBackUrl}
                  onChange={(v) => setFormData((prev) => ({ ...prev, cnicBackUrl: v }))}
                  onFileText={isRejected ? t('reg.onFileLast') : undefined}
                  testId="cnic-back-upload"
                />
              </div>
              {errors.cnic && <p className="text-rose-500 text-xs font-medium">{errors.cnic}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {formData.kitchenPhotoUrls.map((url, i) => (
                  <FileUploadField
                    key={i}
                    kind="document"
                    label={t('reg.kitchenPhoto', { n: i + 1 })}
                    hint={i === 0 ? t('reg.kitchenPhotoHint') : t('reg.optional')}
                    value={url}
                    onChange={(v) =>
                      setFormData((prev) => ({ ...prev, kitchenPhotoUrls: prev.kitchenPhotoUrls.map((x, j) => (j === i ? v : x)) }))
                    }
                    testId={`kitchen-photo-${i + 1}`}
                  />
                ))}
              </div>
              <FileUploadField
                kind="cover"
                label={t('reg.cover')}
                hint={t('reg.coverHint')}
                value={formData.coverImageUrl || null}
                onChange={(v) => setFormData((prev) => ({ ...prev, coverImageUrl: v ?? '' }))}
                testId="cover-upload"
              />
            </div>

            {/* Section 6: Terms Acceptance & Submit */}
            <div className="pt-4 border-t border-slate-100 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  id="agree-terms-checkbox"
                  type="checkbox"
                  name="agreeToTerms"
                  checked={formData.agreeToTerms}
                  onChange={(e) => setFormData(prev => ({ ...prev, agreeToTerms: e.target.checked }))}
                  className="mt-1 w-5 h-5 rounded text-orange-500 focus:ring-orange-400 border-slate-300"
                />
                <span className="text-xs text-slate-600 leading-relaxed">
                  {t('reg.terms1')}<span className="font-bold text-slate-900">{t('reg.termsBold')}</span>{t('reg.terms2')}
                </span>
              </label>
              {errors.agreeToTerms && <p className="text-rose-500 text-xs font-medium">{errors.agreeToTerms}</p>}

              <div className="pt-2">
                <Button
                  id="submit-registration-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white font-black text-base rounded-2xl shadow-lg shadow-orange-200 transition-all duration-200"
                >
                  {loading 
                    ? t('reg.submitting')
                    : isRejected
                    ? t('reg.resubmit')
                    : t('reg.submit')}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

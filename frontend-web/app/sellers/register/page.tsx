'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Check, ChevronLeft, Loader2 } from 'lucide-react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { bankAccountIsWrong, walletNumberIsWrong } from '@/lib/payout-account';
import LocationMap from '@/components/ui/LocationMap';
import FileUploadField from '@/components/ui/FileUploadField';
import { useT } from '@/lib/i18n';
import { joinMessages, type JoinMessageKey } from '@/lib/i18n/messages/join';
import { useShallow } from 'zustand/react/shallow';

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
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(joinMessages);
  const [loading, setLoading] = useState(false);
  // The kitchen as GET /sellers/me/dashboard returns it; the page reads where its application stands.
  const [sellerInfo, setSellerInfo] = useState<{ verificationStatus?: string; applicationMissing?: string[]; rejectionReason?: string | null } | null>(null);
  const [loadingSellerInfo, setLoadingSellerInfo] = useState(true);
  // Why the kitchen's saved details could not be read when it was not a 404 (that one means "not registered yet"). Sending the
  // form with the details missing would write the blanks over a kitchen that already has them.
  const [loadError, setLoadError] = useState<unknown>(null);
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

  const loadSellerInfo = async () => {
    try {
      setLoadingSellerInfo(true);
      setLoadError(null);
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
          latitude: seller.latitude ?? prev.latitude,
          longitude: seller.longitude ?? prev.longitude,
          coverImageUrl: seller.coverImageUrl || '',
          kitchenVideoUrl: seller.kitchenVideoUrl || '',
        }));
      }
    } catch (error) {
      // A 404 means the user is not a registered seller yet, and the registration form is the right page. Anything else is a read
      // that failed.
      if ((error as { response?: { status?: number } })?.response?.status !== 404) setLoadError(error);
    } finally {
      setLoadingSellerInfo(false);
    }
  };

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }

    loadSellerInfo();
  }, [isAuthenticated, router]);

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
  // A kitchen that signed up with "Cook & Sell" is waiting with only a name: it adds its community, location and CNIC here.
  const missing: string[] = isPending && Array.isArray(sellerInfo?.applicationMissing) ? sellerInfo.applicationMissing : [];
  const needsCompleting = missing.length > 0;
  const gapLabel: Record<string, string> = { community: t('reg.gapCommunity'), 'kitchen location': t('reg.gapLocation'), 'CNIC photos (both sides)': t('reg.gapCnic') };
  // The CNIC photos already on file are kept (a rejected application, or a waiting one that only lacks other things).
  const cnicOnFile = isRejected || (needsCompleting && !missing.includes('CNIC photos (both sides)'));

  const steps: { id: string; title: JoinMessageKey; done: boolean }[] = [
    { id: 'step-kitchen', title: 'reg.s1', done: formData.businessName.trim().length >= 3 },
    { id: 'step-place', title: 'reg.s2', done: !!formData.communityId && formData.latitude != null && formData.longitude != null },
    { id: 'step-food', title: 'reg.s3', done: formData.mealCategories.length > 0 },
    { id: 'step-money', title: 'reg.s4', done: !!(formData.jazzcashNumber || formData.easypaisaNumber || formData.bankAccountNumber) },
    { id: 'step-documents', title: 'reg.s5', done: cnicOnFile || (!!formData.cnicFrontUrl && !!formData.cnicBackUrl) },
  ];
  const stepsDone = steps.filter((s) => s.done).length;

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
    if (!cnicOnFile && (!formData.cnicFrontUrl || !formData.cnicBackUrl)) {
      newErrors.cnic = t('reg.errCnic');
    }
    if (!formData.agreeToTerms && (!sellerInfo || sellerInfo.verificationStatus === 'rejected' || needsCompleting)) {
      newErrors.agreeToTerms = t('reg.errTerms');
    }
    // Customers pay into these: a wrong digit pays a stranger, so a number has to be one (the server checks the same).
    if (walletNumberIsWrong(formData.jazzcashNumber)) newErrors.jazzcashNumber = t('ob.jazzInvalid');
    if (walletNumberIsWrong(formData.easypaisaNumber)) newErrors.easypaisaNumber = t('ob.easyInvalid');
    if (bankAccountIsWrong(formData.bankAccountNumber)) newErrors.bankAccountNumber = t('ob.bankInvalid');

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
    } catch (error) {
      showToast(apiErrorMessage(error, t('reg.submitFailed')), 'error');
    } finally {
      setLoading(false);
    }
  };


  const showForm = !sellerInfo || isEditing || (!isApproved && !isPending) || needsCompleting;
  const showStatus = !!sellerInfo && (!isEditing || needsCompleting);

  const backLink = (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1 min-h-11 -ms-1 pe-2 text-sm font-medium text-muted hover:text-ink rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
    >
      <ChevronLeft className="w-4 h-4 rtl:rotate-180" aria-hidden />
      {t('reg.back')}
    </Link>
  );

  if (loadError && !sellerInfo) {
    return (
      <div className="min-h-screen bg-page pt-[calc(2.5rem+var(--safe-top))] pb-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto space-y-6">
          {backLink}
          <LoadError error={loadError} onRetry={loadSellerInfo} />
        </div>
      </div>
    );
  }

  if (loadingSellerInfo && !sellerInfo) {
    return (
      <div className="min-h-screen bg-page pt-[calc(2.5rem+var(--safe-top))] pb-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto space-y-6">
          {backLink}
          <p className="flex items-center gap-2 text-sm text-muted" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            {t('reg.loading')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-page pt-[calc(2.5rem+var(--safe-top))] pb-16 px-4 sm:px-6 lg:px-8">
      <div className={showForm ? 'max-w-[58rem] mx-auto' : 'max-w-2xl mx-auto'}>
        {backLink}

        <div className={showForm ? 'lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 mt-4' : 'mt-4'}>
          {showForm && (
            <nav aria-label={t('reg.progress', { done: stepsDone })} className="hidden lg:block">
              <ol className="sticky top-8 space-y-1 pt-24">
                {steps.map((step, i) => (
                  <li key={step.id}>
                    <a
                      href={`#${step.id}`}
                      className="flex items-center gap-3 min-h-11 px-2 rounded-lg text-sm text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                    >
                      <span
                        className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold tabular-nums shrink-0 ${
                          step.done ? 'bg-brand-soft text-brand-ink' : 'border border-line-strong text-muted'
                        }`}
                      >
                        {step.done ? <Check className="w-3.5 h-3.5" aria-hidden /> : i + 1}
                      </span>
                      {t(step.title)}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className="max-w-2xl min-w-0">
            {showStatus && (
              <div className="mb-10">
                {isApproved && (
                  <StatusCard title={t('reg.approvedTitle')} body={<p>{t('reg.approvedBody')}</p>}>
                    <Button onClick={() => router.push('/sellers/dashboard')}>{t('reg.openDashboard')}</Button>
                  </StatusCard>
                )}

                {isPending && !needsCompleting && (
                  <StatusCard id="pending-approval-banner" title={t('reg.pendingTitle')} body={<p>{t('reg.pendingBody')}</p>} />
                )}

                {needsCompleting && (
                  <StatusCard
                    id="incomplete-banner"
                    title={t('reg.incompleteTitle')}
                    body={
                      <>
                        <p>{t('reg.incompleteBody')}</p>
                        <p className="mt-3 rounded-lg bg-accent-soft text-accent-soft-ink px-3 py-2">
                          <span className="font-medium">{t('reg.incompleteStill')}</span> {missing.map((m) => gapLabel[m] ?? m).join(', ')}
                        </p>
                      </>
                    }
                  />
                )}

                {isRejected && (
                  <StatusCard
                    id="rejected-banner"
                    title={t('reg.rejectedTitle')}
                    body={
                      <p id="rejection-reason-text" className="rounded-lg bg-red-50 text-red-700 px-3 py-2">
                        <span className="font-medium">{t('reg.rejectionReason')}</span> {sellerInfo.rejectionReason || t('reg.rejectionDefault')}
                      </p>
                    }
                  >
                    <Button id="fix-resubmit-btn" variant="outline" onClick={() => setIsEditing(true)}>
                      {t('reg.fixResubmit')}
                    </Button>
                  </StatusCard>
                )}
              </div>
            )}

            {showForm && (
              <form onSubmit={handleSubmit}>
                <h1 className="text-2xl sm:text-3xl font-semibold text-ink tracking-tight">
                  {isRejected ? t('reg.titleResubmit') : needsCompleting ? t('reg.titleComplete') : t('reg.title')}
                </h1>
                <p className="text-[15px] text-muted mt-2">{t('reg.intro')}</p>

                <div className="mt-5 lg:hidden" aria-hidden>
                  <div className="flex gap-1.5">
                    {steps.map((step) => (
                      <span key={step.id} className={`h-1.5 flex-1 rounded-full ${step.done ? 'bg-brand' : 'bg-line'}`} />
                    ))}
                  </div>
                  <p className="text-sm text-muted mt-2 tabular-nums">{t('reg.progress', { done: stepsDone })}</p>
                </div>

                <Section id="step-kitchen" n={1} title={t('reg.s1')}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel htmlFor="business-name-input" required>{t('reg.nameEn')}</FieldLabel>
                      <input
                        id="business-name-input"
                        type="text"
                        name="businessName"
                        value={formData.businessName}
                        onChange={handleInputChange}
                        placeholder={t('reg.nameEnPh')}
                        aria-invalid={Boolean(errors.businessName)}
                        className={inputClass(!!errors.businessName)}
                      />
                      <FieldError message={errors.businessName} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="business-name-urdu-input">{t('reg.nameUr')}</FieldLabel>
                      <input
                        id="business-name-urdu-input"
                        type="text"
                        name="businessNameUrdu"
                        value={formData.businessNameUrdu}
                        onChange={handleInputChange}
                        placeholder="مثال: دیسی ہانڈی و کچن"
                        className={inputClass(false)}
                      />
                    </div>
                  </div>

                  <fieldset>
                    <legend className="text-sm font-medium text-ink mb-2">{t('reg.selectType')}</legend>
                    <div role="radiogroup" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {BUSINESS_TYPES.map((bt) => {
                        const selected = formData.businessType === bt.id;
                        return (
                          <button
                            key={bt.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setFormData((prev) => ({ ...prev, businessType: bt.id }))}
                            className={`flex items-start gap-3 min-h-11 px-3 py-2.5 rounded-xl border text-start transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
                              selected ? 'border-brand-600 bg-brand-soft' : 'border-line bg-surface hover:border-line-strong'
                            }`}
                          >
                            <span
                              className={`mt-0.5 w-4 h-4 rounded-full border shrink-0 flex items-center justify-center ${
                                selected ? 'border-brand-600' : 'border-line-strong'
                              }`}
                              aria-hidden
                            >
                              {selected && <span className="w-2 h-2 rounded-full bg-brand-600" />}
                            </span>
                            <span>
                              <span className="block text-sm font-medium text-ink">{t(bt.title)}</span>
                              <span className="block text-sm text-muted">{t(bt.desc)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div>
                    <FieldLabel htmlFor="kitchen-bio-input">{t('reg.bio')}</FieldLabel>
                    <textarea
                      id="kitchen-bio-input"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder={t('reg.bioPh')}
                      className={`${inputClass(false)} py-2.5`}
                    />
                  </div>
                </Section>

                <Section id="step-place" n={2} title={t('reg.s2')} help={t('reg.s2Help')}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <FieldLabel htmlFor="community-select" required>{t('reg.community')}</FieldLabel>
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
                        aria-invalid={Boolean(errors.primaryCommunityName)}
                        className={inputClass(!!errors.primaryCommunityName)}
                      >
                        <option value="">{communities.length ? t('reg.chooseCommunity') : t('reg.loadingCommunities')}</option>
                        {communities.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}, {c.city}
                          </option>
                        ))}
                      </select>
                      <FieldError message={errors.primaryCommunityName} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="house-unit-input" required>{t('reg.house')}</FieldLabel>
                      <input
                        id="house-unit-input"
                        type="text"
                        name="houseOrUnitNumber"
                        value={formData.houseOrUnitNumber}
                        onChange={handleInputChange}
                        placeholder={t('reg.housePh')}
                        className={inputClass(false)}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between gap-3 mb-1.5">
                      <span className="text-sm font-medium text-ink">
                        {t('reg.mapLabel')}
                        <span className="text-red-700" aria-hidden> *</span>
                      </span>
                      <span className="text-sm text-muted tabular-nums" data-ltr>
                        {formData.latitude != null && formData.longitude != null ? `${formData.latitude.toFixed(4)}, ${formData.longitude.toFixed(4)}` : t('reg.notPicked')}
                      </span>
                    </div>
                    <div className={`rounded-xl overflow-hidden ${errors.location ? 'ring-2 ring-red-700' : ''}`}>
                      <LocationMap
                        center={(() => {
                          if (formData.latitude != null && formData.longitude != null) return { lat: formData.latitude, lng: formData.longitude };
                          const c = communities.find((x) => x.id === formData.communityId);
                          return c ? { lat: c.centerLatitude, lng: c.centerLongitude } : { lat: 31.5204, lng: 74.3587 };
                        })()}
                        markerPosition={formData.latitude != null && formData.longitude != null ? { lat: formData.latitude, lng: formData.longitude } : null}
                        height="260px"
                        onLocationSelect={(coords) => {
                          setFormData((prev) => ({
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
                    </div>
                    {errors.location ? <FieldError message={errors.location} /> : <p className="text-sm text-muted mt-1.5">{t('reg.mapHelp')}</p>}
                  </div>
                </Section>

                <Section id="step-food" n={3} title={t('reg.s3')} help={t('reg.s3Help')}>
                  <div className="flex flex-wrap gap-2">
                    {FOOD_CATEGORIES.map(({ value: cat, key: catKey }) => {
                      const selected = formData.mealCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleCategory(cat)}
                          className={`inline-flex items-center gap-1.5 min-h-11 px-4 rounded-full border text-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
                            selected ? 'border-brand-600 bg-brand-soft text-brand-ink font-medium' : 'border-line-strong bg-surface text-ink hover:bg-raised'
                          }`}
                        >
                          {selected && <Check className="w-4 h-4" aria-hidden />}
                          {t(catKey)}
                        </button>
                      );
                    })}
                  </div>
                </Section>

                <Section id="step-money" n={4} title={t('reg.s4')} help={t('reg.s4Help')}>
                  <fieldset>
                    <legend className="text-sm font-semibold text-ink mb-3">{t('reg.wallets')}</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <FieldLabel htmlFor="jazzcash-input">{t('reg.jazzcash')}</FieldLabel>
                        <input
                          dir="ltr"
                          id="jazzcash-input"
                          type="text"
                          inputMode="tel"
                          name="jazzcashNumber"
                          value={formData.jazzcashNumber}
                          onChange={handleInputChange}
                          placeholder="03001234567"
                          aria-invalid={Boolean(errors.jazzcashNumber)}
                          className={inputClass(!!errors.jazzcashNumber)}
                        />
                        <FieldError message={errors.jazzcashNumber} alert />
                      </div>
                      <div>
                        <FieldLabel htmlFor="easypaisa-input">{t('reg.easypaisa')}</FieldLabel>
                        <input
                          dir="ltr"
                          id="easypaisa-input"
                          type="text"
                          inputMode="tel"
                          name="easypaisaNumber"
                          value={formData.easypaisaNumber}
                          onChange={handleInputChange}
                          placeholder="03451234567"
                          aria-invalid={Boolean(errors.easypaisaNumber)}
                          className={inputClass(!!errors.easypaisaNumber)}
                        />
                        <FieldError message={errors.easypaisaNumber} alert />
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="pt-2">
                    <legend className="text-sm font-semibold text-ink mb-3">{t('reg.bank')}</legend>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <FieldLabel htmlFor="bank-name-input">{t('reg.bankName')}</FieldLabel>
                        <input
                          id="bank-name-input"
                          type="text"
                          name="bankName"
                          value={formData.bankName}
                          onChange={handleInputChange}
                          placeholder={t('reg.bankNamePh')}
                          className={inputClass(false)}
                        />
                      </div>
                      <div>
                        <FieldLabel htmlFor="bank-account-name-input">{t('reg.accountTitle')}</FieldLabel>
                        <input
                          id="bank-account-name-input"
                          type="text"
                          name="bankAccountName"
                          value={formData.bankAccountName}
                          onChange={handleInputChange}
                          placeholder={t('reg.accountTitlePh')}
                          className={inputClass(false)}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <FieldLabel htmlFor="bank-account-input">{t('reg.accountNumber')}</FieldLabel>
                        <input
                          dir="ltr"
                          id="bank-account-input"
                          type="text"
                          name="bankAccountNumber"
                          value={formData.bankAccountNumber}
                          onChange={handleInputChange}
                          placeholder="PK36SCBL0000001123456702"
                          aria-invalid={Boolean(errors.bankAccountNumber)}
                          className={inputClass(!!errors.bankAccountNumber)}
                        />
                        <FieldError message={errors.bankAccountNumber} alert />
                      </div>
                    </div>
                  </fieldset>
                </Section>

                <Section
                  id="step-documents"
                  n={5}
                  title={t('reg.s5')}
                  help={`${t('reg.docsNote')}${isRejected ? t('reg.docsNoteRejected') : ''}`}
                >
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
                  <FieldError message={errors.cnic} />
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
                </Section>

                <div className="mt-10 pt-8 border-t border-line space-y-5">
                  <div>
                    <label htmlFor="agree-terms-checkbox" className="flex items-start gap-3 min-h-11 cursor-pointer">
                      <input
                        id="agree-terms-checkbox"
                        type="checkbox"
                        name="agreeToTerms"
                        checked={formData.agreeToTerms}
                        onChange={(e) => setFormData((prev) => ({ ...prev, agreeToTerms: e.target.checked }))}
                        aria-invalid={Boolean(errors.agreeToTerms)}
                        className="mt-0.5 w-5 h-5 shrink-0 rounded border-line-strong accent-brand-600 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                      />
                      <span className="text-sm text-ink leading-relaxed">
                        {t('reg.terms1')}
                        <span className="font-medium">{t('reg.termsBold')}</span>
                        {t('reg.terms2')}
                      </span>
                    </label>
                    <FieldError message={errors.agreeToTerms} />
                  </div>

                  <Button id="submit-registration-btn" type="submit" size="lg" disabled={loading} className="w-full sm:w-auto">
                    {loading ? t('reg.submitting') : isRejected ? t('reg.resubmit') : needsCompleting ? t('reg.complete') : t('reg.submit')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function inputClass(invalid: boolean) {
  return `w-full min-h-11 bg-surface border rounded-xl px-3 text-[15px] text-ink placeholder:text-muted focus:outline-none focus:ring-3 focus:ring-brand/30 ${
    invalid ? 'border-red-700' : 'border-line-strong focus:border-brand-600'
  }`;
}

function FieldLabel({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-ink mb-1.5">
      {children}
      {required && <span className="text-red-700" aria-hidden> *</span>}
    </label>
  );
}

function FieldError({ message, alert }: { message?: string; alert?: boolean }) {
  if (!message) return null;
  return (
    <p role={alert ? 'alert' : undefined} className="text-sm text-red-700 mt-1.5">
      {message}
    </p>
  );
}

function Section({ id, n, title, help, children }: { id: string; n: number; title: string; help?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 pt-8 border-t border-line scroll-mt-6 first-of-type:mt-8">
      <h2 id={`${id}-title`} className="flex items-baseline gap-2.5 text-lg font-semibold text-ink">
        <span className="text-muted tabular-nums">{n}</span>
        {title}
      </h2>
      {help && <p className="text-sm text-muted mt-1">{help}</p>}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function StatusCard({ id, title, body, children }: { id?: string; title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <div id={id} className="bg-surface border border-line rounded-2xl shadow-[var(--shadow-card)] p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="text-[15px] text-muted mt-1.5">{body}</div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

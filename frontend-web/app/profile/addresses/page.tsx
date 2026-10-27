'use client';

import { useEffect, useState, useCallback } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { userProfileService, Address } from '@/lib/services/user-profile.service';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { accountMessages } from '@/lib/i18n/messages/account';
import { CITIES } from '@/lib/cities';
import { reverseGeocode, GeocodedPlace } from '@/lib/geocode';

function MapLoading() {
  const t = useT(accountMessages);
  return <p className="text-muted font-medium">{t('loadingMap')}</p>;
}

// Dynamically import the map component (no SSR)
const LocationMap = dynamic(() => import('@/components/ui/LocationMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-raised rounded-xl flex items-center justify-center h-[300px]">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <MapLoading />
      </div>
    </div>
  ),
});

import {
  Home,
  Briefcase,
  MapPin,
  Check,
  Plus,
  Pencil,
  X,
  Navigation,
  Map as MapIcon,
  Tag,
  Truck,
  Star,
  Trash2,
  Mail,
  Lightbulb,
  Bell,
  FileText,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

// Address type labels with icons (label is what the API stores; labelKey is what we show)
const addressTypes = [
  { id: 'home', label: 'Home', labelKey: 'type.home', icon: Home, color: 'bg-brand-soft text-brand-soft-ink' },
  { id: 'work', label: 'Work', labelKey: 'type.work', icon: Briefcase, color: 'bg-accent-soft text-accent-soft-ink' },
  { id: 'other', label: 'Other', labelKey: 'type.other', icon: MapPin, color: 'bg-raised text-ink' },
] as const;

// Popular areas by city for quick selection
const popularAreasByCity: Record<string, string[]> = {
  'Karachi': [
    'DHA Phase 1', 'DHA Phase 2', 'DHA Phase 5', 'DHA Phase 6', 'DHA Phase 8',
    'Clifton', 'Gulshan-e-Iqbal', 'Gulistan-e-Johar', 'North Nazimabad', 'Nazimabad',
    'PECHS', 'Saddar', 'FB Area', 'Korangi', 'Malir', 'Bahria Town Karachi'
  ],
  'Lahore': [
    'DHA Phase 1', 'DHA Phase 2', 'DHA Phase 3', 'DHA Phase 4', 'DHA Phase 5', 'DHA Phase 6',
    'Gulberg', 'Model Town', 'Johar Town', 'Bahria Town', 'Garden Town', 'Faisal Town',
    'Allama Iqbal Town', 'Wapda Town', 'Valencia Town', 'Cantt', 'Mall Road', 'Liberty'
  ],
  'Islamabad': [
    'F-6', 'F-7', 'F-8', 'F-10', 'F-11', 'G-6', 'G-7', 'G-8', 'G-9', 'G-10', 'G-11',
    'I-8', 'I-9', 'I-10', 'E-7', 'E-11', 'Bahria Town', 'DHA Phase 1', 'DHA Phase 2', 'Blue Area'
  ],
  'Rawalpindi': [
    'Saddar', 'Bahria Town', 'DHA', 'Satellite Town', 'Commercial Market', 'Chaklala',
    'Westridge', 'Shamsabad', 'Adiala Road', 'Airport Housing Society'
  ],
};

// Get areas based on selected city
const getAreasForCity = (city: string): string[] => {
  return popularAreasByCity[city] || [];
};

// Cities for dropdown

/** The address form with what the map said about a pin filled in; whatever it did not say stays as the person had it. */
function withPlace<T extends { city: string; area: string; addressLine1: string; houseNumber: string; postalCode: string; latitude: string; longitude: string }>(
  form: T,
  place: GeocodedPlace,
  lat: number,
  lng: number
): T {
  return {
    ...form,
    latitude: lat.toString(),
    longitude: lng.toString(),
    city: place.city || form.city,
    area: place.area || form.area,
    addressLine1: place.street || form.addressLine1,
    houseNumber: place.houseNumber || form.houseNumber,
    postalCode: place.postalCode || form.postalCode,
  };
}

export default function AddressesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const t = useT(accountMessages);
  const tc = useT(commonMessages);
  // A saved label we know (Home/Work/Other) is shown in the current language; anything else as typed.
  const addressLabel = (label?: string | null) => {
    const known = addressTypes.find((a) => a.label.toLowerCase() === label?.toLowerCase() || a.id === label?.toLowerCase());
    return known ? t(known.labelKey) : label;
  };
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the list could not be read; shown instead of "No addresses saved yet", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [mapCoords, setMapCoords] = useState({ lat: 24.8607, lng: 67.0011 }); // Karachi default
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [formData, setFormData] = useState({
    label: 'home',
    addressLine1: '',
    addressLine2: '',
    houseNumber: '',
    area: '',
    city: '',
    postalCode: '',
    landmark: '',
    isDefault: false,
    deliveryInstructions: '',
    latitude: '',
    longitude: '',
  });

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  const loadAddresses = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await userProfileService.getAddresses();
      setAddresses(response.data);
    } catch (error) {
      console.error('Failed to load addresses:', error);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // The saved session loads a moment after the page; a stored token means "signed in".
    if (!isAuthenticated && !apiClient.getAccessToken()) {
      router.push(loginUrlHere());
      return;
    }
    loadAddresses();
  }, [isAuthenticated]);

  // Detect current location using GPS
  const detectCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showToast(t('geoUnsupported'), 'error');
      return;
    }

    setDetectingLocation(true);
    showToast(t('detectingLocation'), 'info');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Update map coordinates to user's ACTUAL location
        setMapCoords({ lat: latitude, lng: longitude });
        
        // What the map says is at the pin; with no answer, the city the pin itself is in (or nothing)
        const place = await reverseGeocode(latitude, longitude);
        setFormData((prev) => withPlace(prev, place, latitude, longitude));
        if (place.fromService) {
          showToast(place.city ? t('locationDetectedCity', { city: place.city }) : t('locationDetectedFill'), 'success');
        } else {
          showToast(place.city ? t('locationDetectedCityFill', { city: place.city }) : t('locationDetectedFill'), 'success');
        }

        setDetectingLocation(false);
        setShowMap(true); // Auto-open map centered on user's location
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMessage = t('locUnable');
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = t('locDenied');
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = t('locUnavailable');
            break;
          case error.TIMEOUT:
            errorMessage = t('locTimeout');
            break;
        }
        showToast(errorMessage, 'error');
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [showToast, t]);

  // Handle area input with suggestions based on selected city
  const handleAreaChange = (value: string) => {
    setFormData({ ...formData, area: value });
    if (value.length > 0) {
      const cityAreas = getAreasForCity(formData.city);
      const filtered = cityAreas.filter(area => 
        area.toLowerCase().includes(value.toLowerCase())
      );
      setSearchSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectArea = (area: string) => {
    setFormData({ ...formData, area });
    setShowSuggestions(false);
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    // Without a pin the rider only gets words, and the address cannot be matched to a community.
    if (!formData.latitude || !formData.longitude) {
      showToast(t('pinRequired'), 'error');
      return;
    }
    try {
      const addressData = {
        label: addressTypes.find(a => a.id === formData.label)?.label || formData.label,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2,
        houseNumber: formData.houseNumber,
        area: formData.area,
        city: formData.city,
        postalCode: formData.postalCode,
        landmark: formData.landmark,
        isDefault: formData.isDefault,
        // The map pin decides which community (and so which kitchens and fees) the
        // address belongs to; the server works the community out from it.
        ...(formData.latitude && formData.longitude
          ? { latitude: parseFloat(formData.latitude), longitude: parseFloat(formData.longitude) }
          : {}),
      };

      if (editingAddress) {
        await userProfileService.updateAddress(editingAddress.id, addressData);
        showToast(t('addressUpdated'), 'success');
      } else {
        await userProfileService.addAddress(addressData);
        showToast(t('addressAdded'), 'success');
      }
      
      resetForm();
      loadAddresses();
    } catch (error) {
      showToast(apiErrorMessage(error, t('addressSaveFailed')), 'error');
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!(await confirmDialog({ message: t('confirmDeleteAddress') }))) return;
    try {
      await userProfileService.deleteAddress(addressId);
      showToast(t('addressDeleted'), 'success');
      loadAddresses();
    } catch (error) {
      showToast(apiErrorMessage(error, t('addressDeleteFailed')), 'error');
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      await userProfileService.setDefaultAddress(addressId);
      showToast(t('defaultUpdated'), 'success');
      loadAddresses();
    } catch (error) {
      showToast(apiErrorMessage(error, t('updateFailed')), 'error');
    }
  };

  const handleEditAddress = (address: Address) => {
    const typeId = addressTypes.find(a => a.label.toLowerCase() === address.label?.toLowerCase())?.id || 'other';
    setFormData({
      label: typeId,
      addressLine1: address.addressLine1 || '',
      addressLine2: address.addressLine2 || '',
      houseNumber: address.houseNumber || '',
      area: address.area || '',
      city: address.city || '',
      postalCode: address.postalCode || '',
      landmark: address.landmark || '',
      isDefault: address.isDefault || false,
      deliveryInstructions: '',
      latitude: address.coordinates ? String(address.coordinates.latitude) : '',
      longitude: address.coordinates ? String(address.coordinates.longitude) : '',
    });
    setEditingAddress(address);
    setShowAddForm(true);
  };

  const resetForm = () => {
    setShowAddForm(false);
    setEditingAddress(null);
    setShowMap(false);
    setFormData({
      label: 'home',
      addressLine1: '',
      addressLine2: '',
      houseNumber: '',
      area: '',
      city: '',
      postalCode: '',
      landmark: '',
      isDefault: false,
      deliveryInstructions: '',
      latitude: '',
      longitude: '',
    });
  };

  if (loading) {
    return (
      <DashboardLayout
        title={t('myAddresses')}
        subtitle={t('manageDeliveryAddresses')}
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto mb-4"></div>
            <p className="text-muted">{t('loadingAddresses')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // The addresses could not be read: the two counters would say "0" and "None" about a list nobody has seen.
  const couldNotRead = !loading && Boolean(loadError) && addresses.length === 0;

  return (
    <DashboardLayout
      title={t('myAddresses')}
      subtitle={t('manageDeliveryLocations')}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface rounded-[20px] p-5 border border-line">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-soft text-brand-soft-ink rounded-xl flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-ink">{couldNotRead ? '–' : addresses.length}</p>
              <p className="text-sm text-muted">{t('savedAddresses')}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-surface rounded-[20px] p-5 border border-line">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-accent-soft text-accent-soft-ink rounded-xl flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-ink">
                {couldNotRead ? '–' : addressLabel(addresses.find(a => a.isDefault)?.label) || t('none')}
              </p>
              <p className="text-sm text-muted">{t('defaultAddress')}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-brand rounded-[20px] p-5">
          <div className="flex items-center justify-between">
            <div className="text-on-brand">
              <p className="font-bold text-lg">{t('addNewAddress')}</p>
              <p className="text-sm text-on-brand/80">{t('gpsOrManual')}</p>
            </div>
            <button
              onClick={() => { resetForm(); setShowAddForm(true); }}
              aria-label={t('addNewAddress')}
              className="w-12 h-12 bg-on-brand text-brand hover:opacity-90 rounded-xl flex items-center justify-center transition-all hover:scale-105"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Address Form */}
      {showAddForm && (
        <div className="bg-surface rounded-[20px] border border-line mb-6 overflow-hidden">
          {/* Form Header */}
          <div className="border-b border-line px-5 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-soft text-brand-soft-ink rounded-xl flex items-center justify-center">
                  {editingAddress ? <Pencil className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="font-extrabold text-lg text-ink">{editingAddress ? t('editAddress') : t('addNewAddress')}</h2>
                  <p className="text-sm text-muted">{t('fillLocationDetails')}</p>
                </div>
              </div>
              <button
                onClick={resetForm}
                aria-label={tc('close')}
                className="w-10 h-10 bg-raised hover:bg-line text-ink rounded-xl flex items-center justify-center transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Quick Location Options */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-brand-ink" />
                {t('quickLocationOptions')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={detectCurrentLocation}
                  disabled={detectingLocation}
                  className="flex items-center gap-3 p-4 bg-surface border border-line rounded-2xl hover:border-brand hover:bg-brand-soft/40 transition-all group"
                >
                  <div className="w-10 h-10 bg-brand text-on-brand rounded-xl flex items-center justify-center">
                    {detectingLocation ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Navigation className="w-5 h-5" />
                    )}
                  </div>
                  <div className="text-start">
                    <p className="font-bold text-ink">{t('useCurrentLocation')}</p>
                    <p className="text-xs text-muted">{t('autoDetectGps')}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setShowMap(!showMap)}
                  className="flex items-center gap-3 p-4 bg-surface border border-line rounded-2xl hover:border-brand hover:bg-brand-soft/40 transition-all group"
                >
                  <div className="w-10 h-10 bg-brand-soft text-brand-soft-ink rounded-xl flex items-center justify-center">
                    <MapIcon className="w-5 h-5" />
                  </div>
                  <div className="text-start">
                    <p className="font-bold text-ink">{t('pickFromMap')}</p>
                    <p className="text-xs text-muted">{t('selectVisually')}</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Map - FREE OpenStreetMap */}
            {showMap && (
              <div className="mb-6">
                <LocationMap
                  center={mapCoords}
                  markerPosition={formData.latitude ? { lat: parseFloat(formData.latitude), lng: parseFloat(formData.longitude) } : null}
                  onLocationSelect={async (coords) => {
                    setFormData(prev => ({
                      ...prev,
                      latitude: coords.lat.toString(),
                      longitude: coords.lng.toString(),
                    }));
                    setMapCoords({ lat: coords.lat, lng: coords.lng });
                    
                    const place = await reverseGeocode(coords.lat, coords.lng);
                    setFormData((prev) => withPlace(prev, place, coords.lat, coords.lng));
                    if (place.city) showToast(t('citySelected', { city: place.city }), 'success');
                  }}
                  height="300px"
                  draggable={true}
                />
                <div className="mt-3 flex items-center justify-between bg-raised rounded-xl p-3">
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <MapPin className="w-4 h-4 text-brand-ink" />
                    {formData.latitude ? (
                      <span>{t('selectedLabel')} <span data-ltr>{parseFloat(formData.latitude).toFixed(4)}, {parseFloat(formData.longitude).toFixed(4)}</span></span>
                    ) : (
                      <span>{t('clickMapToSelect')}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMap(false)}
                    className="text-sm text-brand-ink font-semibold hover:text-brand-ink flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" /> {t('confirmLocation')}
                  </button>
                </div>
              </div>
            )}

            {/* Address Type Selection */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-brand-ink" /> {t('addressType')}
              </p>
              <div className="flex gap-3">
                {addressTypes.map((type) => {
                  const TypeIcon = type.icon;
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, label: type.id })}
                      className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                        formData.label === type.id
                          ? `border-brand bg-brand-50`
                          : 'border-line hover:border-line-strong bg-surface'
                      }`}
                    >
                      <div className={`w-10 h-10 ${type.color} rounded-xl flex items-center justify-center mx-auto mb-2`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <p className={`font-semibold text-sm ${
                        formData.label === type.id ? 'text-brand-ink' : 'text-ink'
                      }`}>{t(type.labelKey)}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleAddAddress} className="space-y-5">
              {/* City & Area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-ink mb-2">
                    {t('city')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="address-cities"
                    required
                    maxLength={100}
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder={t('cityPlaceholder')}
                    className="w-full px-4 py-3 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-brand transition-all bg-surface"
                  />
                  <datalist id="address-cities">
                    {CITIES.map(city => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>
                </div>
                
                <div className="relative">
                  <label className="block text-sm font-semibold text-ink mb-2">
                    {t('areaLocality')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.area}
                    onChange={(e) => handleAreaChange(e.target.value)}
                    onFocus={() => formData.area && setShowSuggestions(searchSuggestions.length > 0)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder={t('areaLocalityPlaceholder')}
                    required
                    className="w-full px-4 py-3 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-brand transition-all"
                  />
                  {/* Area Suggestions Dropdown */}
                  {showSuggestions && (
                    <div className="absolute z-10 w-full mt-1 bg-surface border border-line rounded-xl shadow-lg max-h-48 overflow-auto">
                      {searchSuggestions.map((area) => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => selectArea(area)}
                          className="w-full px-4 py-3 text-start hover:bg-brand-50 transition-colors flex items-center gap-2"
                        >
                          <MapPin className="w-4 h-4 text-muted shrink-0" />
                          <span className="text-ink">{area}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Street Address */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-2">
                  {t('streetAddress')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.addressLine1}
                  onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                  placeholder={t('streetAddressPlaceholder')}
                  required
                  className="w-full px-4 py-3 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-brand transition-all"
                />
              </div>

              {/* House number & Flat/Floor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-ink mb-2">
                    {t('houseNumber')}
                  </label>
                  <input
                    type="text"
                    value={formData.houseNumber}
                    onChange={(e) => setFormData({ ...formData, houseNumber: e.target.value })}
                    placeholder={t('houseNumberPlaceholder')}
                    maxLength={50}
                    className="w-full px-4 py-3 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-brand transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink mb-2">
                    {t('flatFloor')}
                  </label>
                  <input
                    type="text"
                    value={formData.addressLine2}
                    onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                    placeholder={t('flatFloorPlaceholder')}
                    className="w-full px-4 py-3 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-brand transition-all"
                  />
                </div>
              </div>

              {/* Landmark & Postal Code */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-ink mb-2">
                    {t('nearbyLandmark')}
                  </label>
                  <input
                    type="text"
                    value={formData.landmark}
                    onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                    placeholder={t('landmarkPlaceholder')}
                    className="w-full px-4 py-3 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-brand transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-ink mb-2">
                    {t('postalCode')}
                  </label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    placeholder={t('postalCodePlaceholder')}
                    className="w-full px-4 py-3 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-brand transition-all"
                  />
                </div>
              </div>

              {/* Delivery Instructions */}
              <div>
                <label className="block text-sm font-semibold text-ink mb-2 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-muted" />
                  {t('deliveryInstructions')}
                </label>
                <textarea
                  value={formData.deliveryInstructions}
                  onChange={(e) => setFormData({ ...formData, deliveryInstructions: e.target.value })}
                  placeholder={t('deliveryInstructionsPlaceholder')}
                  rows={3}
                  className="w-full px-4 py-3 border border-line rounded-xl focus:ring-2 focus:ring-brand focus:border-brand transition-all resize-none"
                />
              </div>

              {/* Set as Default */}
              <div className="flex items-center p-4 bg-raised rounded-2xl">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="w-5 h-5 text-brand-ink rounded border-line-strong focus:ring-brand cursor-pointer"
                />
                <label htmlFor="isDefault" className="ms-3 cursor-pointer">
                  <span className="font-semibold text-ink">{t('setDefaultDelivery')}</span>
                  <p className="text-muted text-sm">{t('autoSelectedCheckout')}</p>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-surface border border-line-strong hover:bg-raised text-ink h-12 font-bold"
                >
                  {tc('cancel')}
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-brand hover:bg-brand-500 text-on-brand h-12 font-extrabold flex items-center justify-center gap-2"
                >
                  {editingAddress ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingAddress ? t('updateAddress') : t('saveAddress')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Addresses List */}
      {loadError && addresses.length === 0 ? (
        <LoadError error={loadError} onRetry={loadAddresses} title={t('addressesLoadFailed')} />
      ) : addresses.length === 0 ? (
        <div className="bg-surface rounded-[24px] border border-dashed border-line-strong p-10 sm:p-12 text-center">
          <div className="w-20 h-20 bg-brand-soft rounded-3xl flex items-center justify-center mx-auto mb-5 text-brand-soft-ink">
            <MapPin className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-extrabold text-ink mb-2">{t('noAddresses')}</h2>
          <p className="text-muted mb-6 max-w-md mx-auto">
            {t('noAddressesDesc')}
          </p>
          <Button 
            onClick={() => setShowAddForm(true)} 
            className="bg-brand hover:bg-brand-500 text-on-brand h-12 px-6 font-extrabold flex items-center gap-2 mx-auto"
          >
            <Plus className="w-4 h-4" /> {t('addFirstAddress')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-ink">{t('savedAddressesCount', { count: addresses.length })}</h3>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {addresses.map((address) => {
              const typeInfo = addressTypes.find(a => a.id === address.label?.toLowerCase() || a.label.toLowerCase() === address.label?.toLowerCase()) || addressTypes[2];
              const TypeIcon = typeInfo.icon;
              return (
                <div
                  key={address.id}
                  className={`bg-surface rounded-[20px] overflow-hidden border transition-colors group ${
                    address.isDefault ? 'border-brand' : 'border-line hover:border-line-strong'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`px-5 py-3 flex items-center justify-between ${
                    address.isDefault ? 'bg-brand-soft/50' : 'bg-raised'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${typeInfo.color} rounded-xl flex items-center justify-center`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-ink capitalize">{addressLabel(address.label) || t('address')}</h4>
                        {address.isDefault && (
                          <span className="text-xs bg-brand text-on-brand px-2 py-0.5 rounded-full font-bold flex items-center gap-1 mt-0.5">
                            <Check className="w-3 h-3" /> {t('default')}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {!address.coordinates && (
                      <span className="text-[11px] bg-accent-soft text-accent-soft-ink px-2 py-0.5 rounded-full font-semibold" data-testid="address-no-pin">{t('noPinBadge')}</span>
                    )}
                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!address.isDefault && (
                        <button 
                          onClick={() => handleSetDefault(address.id)}
                          className="p-2 text-muted hover:text-brand-ink hover:bg-brand-50 rounded-lg transition-colors"
                          title={t('setAsDefault')}
                        >
                          <Star className="w-4 h-4 text-accent" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleEditAddress(address)}
                        className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink hover:bg-raised rounded-xl transition-colors"
                        title={tc('edit')}
                      >
                        <Pencil className="w-4 h-4 text-muted" />
                      </button>
                      <button 
                        onClick={() => handleDeleteAddress(address.id)}
                        className="p-2 text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title={tc('delete')}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Card Body */}
                  <div className="p-5">
                    <div className="space-y-1 text-ink">
                      <p className="font-medium">{[address.houseNumber, address.addressLine1].filter(Boolean).join(', ')}</p>
                      {address.addressLine2 && <p className="text-muted">{address.addressLine2}</p>}
                      <p className="text-muted">{address.area}, {address.city}</p>
                    </div>
                    
                    {(address.landmark || address.postalCode) && (
                      <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-2">
                        {address.landmark && (
                          <span className="inline-flex items-center gap-1.5 text-xs bg-raised text-muted px-3 py-1.5 rounded-lg">
                            <MapPin className="w-3.5 h-3.5 text-muted shrink-0" /> {address.landmark}
                          </span>
                        )}
                        {address.postalCode && (
                          <span className="inline-flex items-center gap-1.5 text-xs bg-raised text-muted px-3 py-1.5 rounded-lg">
                            <Mail className="w-3.5 h-3.5 text-muted shrink-0" /> {address.postalCode}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tips Section */}
      <div className="mt-8 bg-surface rounded-[20px] p-5 sm:p-6 border border-line">
        <h3 className="font-extrabold text-ink mb-4 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-accent" /> {t('tipsTitle')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-brand-soft rounded-xl flex items-center justify-center flex-shrink-0 text-brand-soft-ink">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-ink text-sm">{t('tipLandmarks')}</p>
              <p className="text-xs text-muted">{t('tipLandmarksDesc')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-brand-soft rounded-xl flex items-center justify-center flex-shrink-0 text-brand-soft-ink">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-ink text-sm">{t('tipPhone')}</p>
              <p className="text-xs text-muted">{t('tipPhoneDesc')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-brand-soft rounded-xl flex items-center justify-center flex-shrink-0 text-brand-soft-ink">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-ink text-sm">{t('tipInstructions')}</p>
              <p className="text-xs text-muted">{t('tipInstructionsDesc')}</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}


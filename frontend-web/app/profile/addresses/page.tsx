'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { userProfileService, Address } from '@/lib/services/user-profile.service';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { accountMessages } from '@/lib/i18n/messages/account';
import { CITIES } from '@/lib/cities';
import { reverseGeocode, GeocodedPlace } from '@/lib/geocode';

function MapLoading() {
  const t = useT(accountMessages);
  return <p className="text-gray-600 font-medium">{t('loadingMap')}</p>;
}

// Dynamically import the map component (no SSR)
const LocationMap = dynamic(() => import('@/components/ui/LocationMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-100 rounded-xl flex items-center justify-center h-[300px]">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
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

// Address type labels with icons (label is what the API stores; labelKey is what we show)
const addressTypes = [
  { id: 'home', label: 'Home', labelKey: 'type.home', icon: Home, color: 'from-blue-500 to-blue-600' },
  { id: 'work', label: 'Work', labelKey: 'type.work', icon: Briefcase, color: 'from-purple-500 to-purple-600' },
  { id: 'other', label: 'Other', labelKey: 'type.other', icon: MapPin, color: 'from-gray-500 to-gray-600' },
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
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();
  const t = useT(accountMessages);
  const tc = useT(commonMessages);
  // A saved label we know (Home/Work/Other) is shown in the current language; anything else as typed.
  const addressLabel = (label?: string | null) => {
    const known = addressTypes.find((a) => a.label.toLowerCase() === label?.toLowerCase() || a.id === label?.toLowerCase());
    return known ? t(known.labelKey) : label;
  };
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    // The saved session loads a moment after the page; a stored token means "signed in".
    if (!isAuthenticated && !apiClient.getAccessToken()) {
      router.push('/login');
      return;
    }
    loadAddresses();
  }, [isAuthenticated]);

  const loadAddresses = async () => {
    setLoading(true);
    try {
      const response = await userProfileService.getAddresses();
      setAddresses(response.data);
    } catch (error) {
      console.error('Failed to load addresses:', error);
    } finally {
      setLoading(false);
    }
  };

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
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('addressSaveFailed'), 'error');
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm(t('confirmDeleteAddress'))) return;
    try {
      await userProfileService.deleteAddress(addressId);
      showToast(t('addressDeleted'), 'success');
      loadAddresses();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('addressDeleteFailed'), 'error');
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      await userProfileService.setDefaultAddress(addressId);
      showToast(t('defaultUpdated'), 'success');
      loadAddresses();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('updateFailed'), 'error');
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-gray-600">{t('loadingAddresses')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={t('myAddresses')}
      subtitle={t('manageDeliveryLocations')}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30 text-white">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{addresses.length}</p>
              <p className="text-sm text-gray-500">{t('savedAddresses')}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/30 text-white">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {addressLabel(addresses.find(a => a.isDefault)?.label) || t('none')}
              </p>
              <p className="text-sm text-gray-500">{t('defaultAddress')}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="text-white">
              <p className="font-bold text-lg">{t('addNewAddress')}</p>
              <p className="text-sm text-white/80">{t('gpsOrManual')}</p>
            </div>
            <button
              onClick={() => { resetForm(); setShowAddForm(true); }}
              aria-label={t('addNewAddress')}
              className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all hover:scale-105 text-white"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Address Form */}
      {showAddForm && (
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 mb-6 overflow-hidden">
          {/* Form Header */}
          <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white">
                  {editingAddress ? <Pencil className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                </div>
                <div className="text-white">
                  <h2 className="font-bold text-lg">{editingAddress ? t('editAddress') : t('addNewAddress')}</h2>
                  <p className="text-sm text-white/80">{t('fillLocationDetails')}</p>
                </div>
              </div>
              <button
                onClick={resetForm}
                aria-label={tc('close')}
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Quick Location Options */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-[#FF5500]" />
                {t('quickLocationOptions')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={detectCurrentLocation}
                  disabled={detectingLocation}
                  className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl hover:border-blue-400 transition-all group"
                >
                  <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform text-white">
                    {detectingLocation ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Navigation className="w-5 h-5" />
                    )}
                  </div>
                  <div className="text-start">
                    <p className="font-semibold text-blue-800">{t('useCurrentLocation')}</p>
                    <p className="text-xs text-blue-600">{t('autoDetectGps')}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setShowMap(!showMap)}
                  className="flex items-center gap-3 p-4 bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-200 rounded-xl hover:border-green-400 transition-all group"
                >
                  <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform text-white">
                    <MapIcon className="w-5 h-5" />
                  </div>
                  <div className="text-start">
                    <p className="font-semibold text-green-800">{t('pickFromMap')}</p>
                    <p className="text-xs text-green-600">{t('selectVisually')}</p>
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
                <div className="mt-3 flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4 text-[#FF5500]" />
                    {formData.latitude ? (
                      <span>{t('selectedLabel')} <span data-ltr>{parseFloat(formData.latitude).toFixed(4)}, {parseFloat(formData.longitude).toFixed(4)}</span></span>
                    ) : (
                      <span>{t('clickMapToSelect')}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMap(false)}
                    className="text-sm text-orange-600 font-semibold hover:text-orange-700 flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" /> {t('confirmLocation')}
                  </button>
                </div>
              </div>
            )}

            {/* Address Type Selection */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-[#FF5500]" /> {t('addressType')}
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
                          ? `border-orange-500 bg-orange-50`
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className={`w-10 h-10 bg-gradient-to-br ${type.color} rounded-lg flex items-center justify-center mx-auto mb-2 text-white`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <p className={`font-semibold text-sm ${
                        formData.label === type.id ? 'text-orange-700' : 'text-gray-700'
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
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white"
                  />
                  <datalist id="address-cities">
                    {CITIES.map(city => (
                      <option key={city} value={city} />
                    ))}
                  </datalist>
                </div>
                
                <div className="relative">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
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
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  />
                  {/* Area Suggestions Dropdown */}
                  {showSuggestions && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-auto">
                      {searchSuggestions.map((area) => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => selectArea(area)}
                          className="w-full px-4 py-3 text-start hover:bg-orange-50 transition-colors flex items-center gap-2"
                        >
                          <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                          <span className="text-gray-700">{area}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Street Address */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('streetAddress')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.addressLine1}
                  onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                  placeholder={t('streetAddressPlaceholder')}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                />
              </div>

              {/* House number & Flat/Floor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('houseNumber')}
                  </label>
                  <input
                    type="text"
                    value={formData.houseNumber}
                    onChange={(e) => setFormData({ ...formData, houseNumber: e.target.value })}
                    placeholder={t('houseNumberPlaceholder')}
                    maxLength={50}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('flatFloor')}
                  </label>
                  <input
                    type="text"
                    value={formData.addressLine2}
                    onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                    placeholder={t('flatFloorPlaceholder')}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>

              {/* Landmark & Postal Code */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('nearbyLandmark')}
                  </label>
                  <input
                    type="text"
                    value={formData.landmark}
                    onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                    placeholder={t('landmarkPlaceholder')}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('postalCode')}
                  </label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    placeholder={t('postalCodePlaceholder')}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>

              {/* Delivery Instructions */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-slate-500" />
                  {t('deliveryInstructions')}
                </label>
                <textarea
                  value={formData.deliveryInstructions}
                  onChange={(e) => setFormData({ ...formData, deliveryInstructions: e.target.value })}
                  placeholder={t('deliveryInstructionsPlaceholder')}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all resize-none"
                />
              </div>

              {/* Set as Default */}
              <div className="flex items-center p-4 bg-gradient-to-r from-orange-50 to-red-50 rounded-xl border border-orange-100">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="w-5 h-5 text-orange-500 rounded border-gray-300 focus:ring-orange-500 cursor-pointer"
                />
                <label htmlFor="isDefault" className="ms-3 cursor-pointer">
                  <span className="font-semibold text-gray-800">{t('setDefaultDelivery')}</span>
                  <p className="text-gray-500 text-sm">{t('autoSelectedCheckout')}</p>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3"
                >
                  {tc('cancel')}
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white py-3 shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2"
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
      {addresses.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-orange-100 to-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-[#FF5500]">
            <MapPin className="w-12 h-12" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('noAddresses')}</h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {t('noAddressesDesc')}
          </p>
          <Button 
            onClick={() => setShowAddForm(true)} 
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:from-red-600 shadow-lg shadow-orange-500/30 flex items-center gap-2 mx-auto"
          >
            <Plus className="w-4 h-4" /> {t('addFirstAddress')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-gray-900">{t('savedAddressesCount', { count: addresses.length })}</h3>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {addresses.map((address) => {
              const typeInfo = addressTypes.find(a => a.id === address.label?.toLowerCase() || a.label.toLowerCase() === address.label?.toLowerCase()) || addressTypes[2];
              const TypeIcon = typeInfo.icon;
              return (
                <div
                  key={address.id}
                  className={`bg-white rounded-2xl shadow-sm overflow-hidden border-2 transition-all hover:shadow-lg group ${
                    address.isDefault ? 'border-orange-400 ring-2 ring-orange-100' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {/* Card Header */}
                  <div className={`px-5 py-3 flex items-center justify-between ${
                    address.isDefault ? 'bg-gradient-to-r from-orange-50 to-red-50' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 bg-gradient-to-br ${typeInfo.color} rounded-xl flex items-center justify-center shadow-sm text-white`}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 capitalize">{addressLabel(address.label) || t('address')}</h4>
                        {address.isDefault && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 mt-0.5">
                            <Check className="w-3 h-3" /> {t('default')}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {!address.coordinates && (
                      <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold" data-testid="address-no-pin">{t('noPinBadge')}</span>
                    )}
                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!address.isDefault && (
                        <button 
                          onClick={() => handleSetDefault(address.id)}
                          className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title={t('setAsDefault')}
                        >
                          <Star className="w-4 h-4 text-amber-500" />
                        </button>
                      )}
                      <button 
                        onClick={() => handleEditAddress(address)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title={tc('edit')}
                      >
                        <Pencil className="w-4 h-4 text-slate-600" />
                      </button>
                      <button 
                        onClick={() => handleDeleteAddress(address.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title={tc('delete')}
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Card Body */}
                  <div className="p-5">
                    <div className="space-y-1 text-gray-700">
                      <p className="font-medium">{[address.houseNumber, address.addressLine1].filter(Boolean).join(', ')}</p>
                      {address.addressLine2 && <p className="text-gray-500">{address.addressLine2}</p>}
                      <p className="text-gray-500">{address.area}, {address.city}</p>
                    </div>
                    
                    {(address.landmark || address.postalCode) && (
                      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                        {address.landmark && (
                          <span className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {address.landmark}
                          </span>
                        )}
                        {address.postalCode && (
                          <span className="inline-flex items-center gap-1.5 text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" /> {address.postalCode}
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
      <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
        <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-amber-500" /> {t('tipsTitle')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 text-blue-600">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-blue-800 text-sm">{t('tipLandmarks')}</p>
              <p className="text-xs text-blue-600">{t('tipLandmarksDesc')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 text-blue-600">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-blue-800 text-sm">{t('tipPhone')}</p>
              <p className="text-xs text-blue-600">{t('tipPhoneDesc')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0 text-blue-600">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="font-medium text-blue-800 text-sm">{t('tipInstructions')}</p>
              <p className="text-xs text-blue-600">{t('tipInstructionsDesc')}</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}


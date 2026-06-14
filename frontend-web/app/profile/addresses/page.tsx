'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { userProfileService, Address } from '@/lib/services/user-profile.service';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import {
  Home,
  Briefcase,
  MapPin,
  Check,
  Pencil,
  X,
  Map as MapIcon,
  Tag,
  Bike,
  Plus,
  Star,
  Trash2,
  Mailbox,
  Lightbulb,
  Bell,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';

// Dynamically import the map component (no SSR)
const LocationMap = dynamic(() => import('@/components/ui/LocationMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-gray-100 rounded-xl flex items-center justify-center h-[300px]">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-gray-600 font-medium">Loading map...</p>
      </div>
    </div>
  ),
});

// Address type labels with icons
const addressTypes: { id: string; label: string; icon: LucideIcon; color: string }[] = [
  { id: 'home', label: 'Home', icon: Home, color: 'from-blue-500 to-blue-600' },
  { id: 'work', label: 'Work', icon: Briefcase, color: 'from-purple-500 to-purple-600' },
  { id: 'other', label: 'Other', icon: MapPin, color: 'from-gray-500 to-gray-600' },
];

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
  return popularAreasByCity[city] || popularAreasByCity['Karachi'];
};

// Cities for dropdown
const cities = ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta', 'Hyderabad', 'Sialkot'];

export default function AddressesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();
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
    area: '',
    city: 'Karachi',
    postalCode: '',
    landmark: '',
    isDefault: false,
    deliveryInstructions: '',
    latitude: '',
    longitude: '',
  });

  const sidebarItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '' },
    { name: 'Browse Products', href: '/products', icon: '' },
    { name: 'My Orders', href: '/orders', icon: '' },
    { name: 'My Cart', href: '/cart', icon: '' },
    { name: 'My Profile', href: '/profile', icon: '' },
    { name: 'Addresses', href: '/profile/addresses', icon: '' },
    { name: 'Help & Support', href: '/support', icon: '' },
  ];

  useEffect(() => {
    if (!isAuthenticated) {
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

  // City name mappings (Urdu to English) for Pakistan
  const cityMappings: Record<string, string> = {
    'لاہور': 'Lahore',
    'ضلع لاہور': 'Lahore',
    'کراچی': 'Karachi',
    'اسلام آباد': 'Islamabad',
    'راولپنڈی': 'Rawalpindi',
    'فیصل آباد': 'Faisalabad',
    'ملتان': 'Multan',
    'پشاور': 'Peshawar',
    'کوئٹہ': 'Quetta',
    'حیدرآباد': 'Hyderabad',
    'سیالکوٹ': 'Sialkot',
  };

  // Detect city from coordinates (approximate bounding boxes for major cities)
  const detectCityFromCoords = (lat: number, lng: number): string | null => {
    // Lahore: ~31.3-31.7 lat, ~74.1-74.5 lng
    if (lat >= 31.3 && lat <= 31.7 && lng >= 74.1 && lng <= 74.5) return 'Lahore';
    // Karachi: ~24.7-25.1 lat, ~66.8-67.3 lng
    if (lat >= 24.7 && lat <= 25.1 && lng >= 66.8 && lng <= 67.3) return 'Karachi';
    // Islamabad: ~33.5-33.8 lat, ~72.8-73.3 lng
    if (lat >= 33.5 && lat <= 33.8 && lng >= 72.8 && lng <= 73.3) return 'Islamabad';
    // Rawalpindi: ~33.4-33.7 lat, ~73.0-73.2 lng
    if (lat >= 33.4 && lat <= 33.7 && lng >= 73.0 && lng <= 73.2) return 'Rawalpindi';
    // Faisalabad: ~31.3-31.6 lat, ~72.9-73.2 lng
    if (lat >= 31.3 && lat <= 31.6 && lng >= 72.9 && lng <= 73.2) return 'Faisalabad';
    // Multan: ~29.9-30.3 lat, ~71.3-71.6 lng
    if (lat >= 29.9 && lat <= 30.3 && lng >= 71.3 && lng <= 71.6) return 'Multan';
    // Peshawar: ~33.9-34.1 lat, ~71.4-71.7 lng
    if (lat >= 33.9 && lat <= 34.1 && lng >= 71.4 && lng <= 71.7) return 'Peshawar';
    // Quetta: ~30.1-30.3 lat, ~66.9-67.1 lng
    if (lat >= 30.1 && lat <= 30.3 && lng >= 66.9 && lng <= 67.1) return 'Quetta';
    // Hyderabad: ~25.3-25.5 lat, ~68.3-68.5 lng
    if (lat >= 25.3 && lat <= 25.5 && lng >= 68.3 && lng <= 68.5) return 'Hyderabad';
    // Sialkot: ~32.4-32.6 lat, ~74.4-74.6 lng
    if (lat >= 32.4 && lat <= 32.6 && lng >= 74.4 && lng <= 74.6) return 'Sialkot';
    return null;
  };

  // Match city name (handles English, Urdu, and partial matches)
  const matchCityName = (addressData: Record<string, string>, lat: number, lng: number): string => {
    // Collect all possible city fields
    const possibleCityFields = [
      addressData.city,
      addressData.town,
      addressData.village,
      addressData.county,
      addressData.district,
      addressData.state_district,
      addressData.municipality,
    ].filter(Boolean);

    // First, try to match from Urdu mappings
    for (const field of possibleCityFields) {
      if (cityMappings[field]) {
        return cityMappings[field];
      }
    }

    // Then, try to match English names (case-insensitive, partial match)
    for (const field of possibleCityFields) {
      const fieldLower = field.toLowerCase();
      const match = cities.find(city => 
        fieldLower.includes(city.toLowerCase()) ||
        city.toLowerCase().includes(fieldLower)
      );
      if (match) return match;
    }

    // Finally, fallback to coordinate-based detection
    const coordCity = detectCityFromCoords(lat, lng);
    if (coordCity) return coordCity;

    // Default fallback
    return 'Karachi';
  };

  // Detect current location using GPS
  const detectCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }

    setDetectingLocation(true);
    showToast('Detecting your location...', 'info');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        // Update map coordinates to user's ACTUAL location
        setMapCoords({ lat: latitude, lng: longitude });
        
        // Use our API proxy for reverse geocoding (avoids CORS with Nominatim)
        try {
          const response = await fetch(
            `/api/geocode/reverse?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`
          );
          if (!response.ok) throw new Error('Geocode failed');
          const data = await response.json();
          
          if (data && data.address) {
            const addr = data.address;
            
            // Use our smart city matching (handles Urdu names + coordinate fallback)
            const matchedCity = matchCityName(addr, latitude, longitude);
            
            // Auto-fill form fields from reverse geocoding
            setFormData(prev => ({
              ...prev,
              latitude: latitude.toString(),
              longitude: longitude.toString(),
              // Set matched city from our dropdown list
              city: matchedCity,
              // Try to get area/suburb (handle Urdu suburb names)
              area: addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || prev.area,
              // Try to get street address
              addressLine1: addr.road ? `${addr.house_number || ''} ${addr.road}`.trim() : prev.addressLine1,
              postalCode: addr.postcode || prev.postalCode,
            }));
            
            showToast(`Location detected: ${matchedCity}!`, 'success');
          } else {
            // No address data, use coordinate-based city detection
            const coordCity = detectCityFromCoords(latitude, longitude);
            setFormData(prev => ({
              ...prev,
              latitude: latitude.toString(),
              longitude: longitude.toString(),
              city: coordCity || prev.city,
            }));
            showToast(`Location detected${coordCity ? `: ${coordCity}` : ''}! Please fill in address details.`, 'success');
          }
        } catch (error) {
          console.error('Reverse geocoding error:', error);
          // Use coordinate-based detection as fallback
          const coordCity = detectCityFromCoords(latitude, longitude);
          setFormData(prev => ({
            ...prev,
            latitude: latitude.toString(),
            longitude: longitude.toString(),
            city: coordCity || prev.city,
          }));
          showToast(`Location detected${coordCity ? `: ${coordCity}` : ''}! Please fill in address details.`, 'success');
        }
        
        setDetectingLocation(false);
        setShowMap(true); // Auto-open map centered on user's location
      },
      (error) => {
        console.error('Error getting location:', error);
        let errorMessage = 'Unable to detect location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access in your browser.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable. Please try again.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
        }
        showToast(errorMessage, 'error');
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [showToast]);

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
    try {
      const addressData = {
        label: addressTypes.find(t => t.id === formData.label)?.label || formData.label,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2,
        area: formData.area,
        city: formData.city,
        postalCode: formData.postalCode,
        landmark: formData.landmark,
        isDefault: formData.isDefault,
      };

      if (editingAddress) {
        await userProfileService.updateAddress(editingAddress.id, addressData);
        showToast('Address updated successfully', 'success');
      } else {
        await userProfileService.addAddress(addressData);
        showToast('Address added successfully', 'success');
      }
      
      resetForm();
      loadAddresses();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to save address', 'error');
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    try {
      await userProfileService.deleteAddress(addressId);
      showToast('Address deleted', 'success');
      loadAddresses();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to delete address', 'error');
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      await userProfileService.setDefaultAddress(addressId);
      showToast('Default address updated', 'success');
      loadAddresses();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update', 'error');
    }
  };

  const handleEditAddress = (address: Address) => {
    const typeId = addressTypes.find(t => t.label.toLowerCase() === address.label?.toLowerCase())?.id || 'other';
    setFormData({
      label: typeId,
      addressLine1: address.addressLine1 || '',
      addressLine2: address.addressLine2 || '',
      area: address.area || '',
      city: address.city || 'Karachi',
      postalCode: address.postalCode || '',
      landmark: address.landmark || '',
      isDefault: address.isDefault || false,
      deliveryInstructions: '',
      latitude: '',
      longitude: '',
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
      area: '',
      city: 'Karachi',
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
        title="My Addresses"
        subtitle="Manage your delivery addresses"
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading addresses...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="My Addresses"
      subtitle="Manage your delivery locations"
      sidebarItems={sidebarItems}
      userType="customer"
    >
      {/* Header with Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{addresses.length}</p>
              <p className="text-sm text-gray-500">Saved Addresses</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/30">
              <Check className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {addresses.find(a => a.isDefault)?.label || 'None'}
              </p>
              <p className="text-sm text-gray-500">Default Address</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-2xl p-5 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="text-white">
              <p className="font-bold text-lg">Add New Address</p>
              <p className="text-sm text-white/80">Use GPS or enter manually</p>
            </div>
            <button
              onClick={() => { resetForm(); setShowAddForm(true); }}
              className="w-12 h-12 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all hover:scale-105"
              aria-label="Add new address"
            >
              <Plus className="w-6 h-6 text-white" />
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
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  {editingAddress
                    ? <Pencil className="w-5 h-5 text-white" />
                    : <MapPin className="w-5 h-5 text-white" />}
                </div>
                <div className="text-white">
                  <h2 className="font-bold text-lg">{editingAddress ? 'Edit Address' : 'Add New Address'}</h2>
                  <p className="text-sm text-white/80">Fill in your delivery location details</p>
                </div>
              </div>
              <button
                onClick={resetForm}
                className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Quick Location Options */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Quick Location Options</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={detectCurrentLocation}
                  disabled={detectingLocation}
                  className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl hover:border-blue-400 transition-all group"
                >
                  <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    {detectingLocation ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <MapPin className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-blue-800">Use My Current Location</p>
                    <p className="text-xs text-blue-600">Auto-detect via GPS</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setShowMap(!showMap)}
                  className="flex items-center gap-3 p-4 bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-200 rounded-xl hover:border-green-400 transition-all group"
                >
                  <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <MapIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-green-800">Pick from Map</p>
                    <p className="text-xs text-green-600">Select location visually</p>
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
                    
                    // Reverse geocode the clicked location via our API proxy
                    try {
                      const response = await fetch(
                        `/api/geocode/reverse?lat=${encodeURIComponent(coords.lat)}&lon=${encodeURIComponent(coords.lng)}`
                      );
                      if (!response.ok) throw new Error('Geocode failed');
                      const data = await response.json();
                      
                      if (data && data.address) {
                        const addr = data.address;
                        
                        // Use smart city matching (handles Urdu + coordinate fallback)
                        const matchedCity = matchCityName(addr, coords.lat, coords.lng);
                        
                        setFormData(prev => ({
                          ...prev,
                          latitude: coords.lat.toString(),
                          longitude: coords.lng.toString(),
                          city: matchedCity,
                          area: addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || prev.area,
                          addressLine1: addr.road ? `${addr.house_number || ''} ${addr.road}`.trim() : prev.addressLine1,
                          postalCode: addr.postcode || prev.postalCode,
                        }));
                        
                        showToast(`${matchedCity} selected!`, 'success');
                      } else {
                        // No address data, use coordinate-based detection
                        const coordCity = detectCityFromCoords(coords.lat, coords.lng);
                        if (coordCity) {
                          setFormData(prev => ({ ...prev, city: coordCity }));
                          showToast(`${coordCity} selected!`, 'success');
                        }
                      }
                    } catch (error) {
                      console.error('Reverse geocoding error:', error);
                      // Fallback to coordinate-based detection
                      const coordCity = detectCityFromCoords(coords.lat, coords.lng);
                      if (coordCity) {
                        setFormData(prev => ({ ...prev, city: coordCity }));
                        showToast(`${coordCity} selected!`, 'success');
                      }
                    }
                  }}
                  height="300px"
                  draggable={true}
                />
                <div className="mt-3 flex items-center justify-between bg-gray-50 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4" />
                    {formData.latitude ? (
                      <span>Selected: {parseFloat(formData.latitude).toFixed(4)}, {parseFloat(formData.longitude).toFixed(4)}</span>
                    ) : (
                      <span>Click on map to select location</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMap(false)}
                    className="text-sm text-orange-600 font-semibold hover:text-orange-700 inline-flex items-center gap-1"
                  >
                    <Check className="w-4 h-4" /> Confirm Location
                  </button>
                </div>
              </div>
            )}

            {/* Address Type Selection */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Tag className="w-4 h-4" /> Address Type</p>
              <div className="flex gap-3">
                {addressTypes.map((type) => (
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
                    <div className={`w-10 h-10 bg-gradient-to-br ${type.color} rounded-lg flex items-center justify-center mx-auto mb-2`}>
                      <type.icon className="w-5 h-5 text-white" />
                    </div>
                    <p className={`font-semibold text-sm ${
                      formData.label === type.id ? 'text-orange-700' : 'text-gray-700'
                    }`}>{type.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddAddress} className="space-y-5">
              {/* City & Area */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    City <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all bg-white"
                  >
                    {cities.map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                
                <div className="relative">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Area / Locality <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.area}
                    onChange={(e) => handleAreaChange(e.target.value)}
                    onFocus={() => formData.area && setShowSuggestions(searchSuggestions.length > 0)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="e.g., DHA Phase 5, Gulshan"
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
                          className="w-full px-4 py-3 text-left hover:bg-orange-50 transition-colors flex items-center gap-2"
                        >
                          <MapPin className="w-4 h-4 text-gray-400" />
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
                  Street Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.addressLine1}
                  onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                  placeholder="House/Building number, Street name"
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                />
              </div>

              {/* Flat/Floor */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Flat / Floor / Building (Optional)
                </label>
                <input
                  type="text"
                  value={formData.addressLine2}
                  onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                  placeholder="e.g., Apartment 4B, 2nd Floor, XYZ Building"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                />
              </div>

              {/* Landmark & Postal Code */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nearby Landmark
                  </label>
                  <input
                    type="text"
                    value={formData.landmark}
                    onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                    placeholder="e.g., Near KFC, Opposite Park Tower"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    placeholder="e.g., 75500"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                  />
                </div>
              </div>

              {/* Delivery Instructions */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <Bike className="w-4 h-4" /> Delivery Instructions (Optional)
                </label>
                <textarea
                  value={formData.deliveryInstructions}
                  onChange={(e) => setFormData({ ...formData, deliveryInstructions: e.target.value })}
                  placeholder="e.g., Ring the bell twice, Leave at the gate, Call before arriving..."
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
                  className="w-5 h-5 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                />
                <label htmlFor="isDefault" className="ml-3">
                  <span className="font-semibold text-gray-800">Set as default delivery address</span>
                  <p className="text-gray-500 text-sm">This will be auto-selected at checkout</p>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white py-3 shadow-lg shadow-orange-500/30"
                >
                  {editingAddress
                    ? <Check className="w-4 h-4 mr-2" />
                    : <Plus className="w-4 h-4 mr-2" />}
                  {editingAddress ? 'Update Address' : 'Save Address'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Addresses List */}
      {addresses.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-orange-100 to-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <MapPin className="w-12 h-12 text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No addresses saved yet</h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Add your delivery addresses to make checkout faster and ensure your food arrives at the right place!
          </p>
          <Button 
            onClick={() => setShowAddForm(true)} 
            className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-lg shadow-orange-500/30"
          >
            <Plus className="w-4 h-4 mr-2" /> Add Your First Address
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-gray-900">Saved Addresses ({addresses.length})</h3>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {addresses.map((address) => {
              const typeInfo = addressTypes.find(t => t.label.toLowerCase() === address.label?.toLowerCase()) || addressTypes[2];
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
                      <div className={`w-10 h-10 bg-gradient-to-br ${typeInfo.color} rounded-xl flex items-center justify-center shadow-sm`}>
                        <typeInfo.icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{address.label || 'Address'}</h4>
                        {address.isDefault && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1">
                            <Check className="w-3 h-3" /> Default
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!address.isDefault && (
                        <button
                          onClick={() => handleSetDefault(address.id)}
                          className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Set as default"
                          aria-label="Set as default"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEditAddress(address)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Edit"
                        aria-label="Edit address"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteAddress(address.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                        aria-label="Delete address"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Card Body */}
                  <div className="p-5">
                    <div className="space-y-1 text-gray-700">
                      <p className="font-medium">{address.addressLine1}</p>
                      {address.addressLine2 && <p className="text-gray-500">{address.addressLine2}</p>}
                      <p className="text-gray-500">{address.area}, {address.city}</p>
                    </div>
                    
                    {(address.landmark || address.postalCode) && (
                      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                        {address.landmark && (
                          <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg">
                            <MapPin className="w-3.5 h-3.5" /> {address.landmark}
                          </span>
                        )}
                        {address.postalCode && (
                          <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg">
                            <Mailbox className="w-3.5 h-3.5" /> {address.postalCode}
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
          <Lightbulb className="w-5 h-5" /> Tips for Better Delivery
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <MapPin className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-blue-800 text-sm">Add Landmarks</p>
              <p className="text-xs text-blue-600">Help riders find you faster</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-blue-800 text-sm">Keep Phone On</p>
              <p className="text-xs text-blue-600">Rider may call on arrival</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-blue-800 text-sm">Add Instructions</p>
              <p className="text-xs text-blue-600">Gate code, bell, etc.</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}


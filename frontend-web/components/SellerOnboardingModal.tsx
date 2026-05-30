'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';

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

const PAKISTANI_CITIES = [
  'Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad',
  'Multan', 'Peshawar', 'Quetta', 'Sialkot', 'Gujranwala',
  'Hyderabad', 'Bahawalpur', 'Sargodha', 'Sukkur', 'Larkana',
  'Sheikhupura', 'Jhang', 'Rahim Yar Khan', 'Mardan', 'Kasur',
  'Mingora', 'Dera Ghazi Khan', 'Sahiwal', 'Nawabshah', 'Okara'
];

export function SellerOnboardingModal({ isOpen, onClose, onComplete }: SellerOnboardingModalProps) {
  const { showToast } = useToast();
  const { user } = useAuthStore();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [detectingLocation, setDetectingLocation] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

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

  // Initialize map when on step 2
  useEffect(() => {
    if (step === 2 && mapRef.current && !mapInstanceRef.current && typeof window !== 'undefined') {
      initializeMap();
    }
  }, [step]);

  const initializeMap = async () => {
    if (typeof window === 'undefined') return;
    
    const L = (await import('leaflet')).default;
    // @ts-ignore - CSS import
    await import('leaflet/dist/leaflet.css');

    // Default to Lahore center
    const defaultLat = formData.latitude || 31.5204;
    const defaultLng = formData.longitude || 74.3587;

    const map = L.map(mapRef.current!, {
      center: [defaultLat, defaultLng],
      zoom: 13,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Custom marker icon
    const customIcon = L.divIcon({
      html: `<div style="background: linear-gradient(135deg, #16a34a, #22c55e); width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      className: 'custom-marker'
    });

    const marker = L.marker([defaultLat, defaultLng], { 
      icon: customIcon,
      draggable: true 
    }).addTo(map);

    marker.on('dragend', async (e: any) => {
      const { lat, lng } = e.target.getLatLng();
      await reverseGeocode(lat, lng);
    });

    map.on('click', async (e: any) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);
      await reverseGeocode(lat, lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    // Delay to ensure map renders properly
    setTimeout(() => map.invalidateSize(), 100);
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`
      );
      if (!response.ok) return;
      const data = await response.json();
      
      if (data.address) {
        // City mapping for Pakistani cities
        const cityMapping: Record<string, string> = {
          'لاہور': 'Lahore', 'کراچی': 'Karachi', 'اسلام آباد': 'Islamabad',
          'راولپنڈی': 'Rawalpindi', 'فیصل آباد': 'Faisalabad', 'ملتان': 'Multan',
          'پشاور': 'Peshawar', 'کوئٹہ': 'Quetta',
        };

        let city = data.address.city || data.address.town || data.address.village || data.address.county || '';
        city = cityMapping[city] || city;

        // Coordinate-based city detection
        if (!city || !PAKISTANI_CITIES.includes(city)) {
          if (lat >= 31.4 && lat <= 31.7 && lng >= 74.1 && lng <= 74.5) city = 'Lahore';
          else if (lat >= 24.8 && lat <= 25.0 && lng >= 66.9 && lng <= 67.2) city = 'Karachi';
          else if (lat >= 33.6 && lat <= 33.8 && lng >= 72.8 && lng <= 73.2) city = 'Islamabad';
          else if (lat >= 33.5 && lat <= 33.7 && lng >= 73.0 && lng <= 73.2) city = 'Rawalpindi';
        }

        const area = data.address.suburb || data.address.neighbourhood || data.address.road || '';
        const fullAddress = data.display_name || '';

        setFormData(prev => ({
          ...prev,
          city,
          area,
          address: fullAddress,
          latitude: lat,
          longitude: lng,
        }));
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
  };

  const detectCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }

    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setView([latitude, longitude], 15);
          markerRef.current.setLatLng([latitude, longitude]);
        }
        
        await reverseGeocode(latitude, longitude);
        setDetectingLocation(false);
      },
      (error) => {
        showToast('Unable to get your location. Please select manually.', 'error');
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
      setErrors(prev => ({ ...prev, [field]: 'File size must be less than 5MB' }));
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
          newErrors.businessName = 'Business name is required';
        } else if (formData.businessName.trim().length < 3) {
          newErrors.businessName = 'Business name must be at least 3 characters';
        }
        break;
      case 2:
        if (!formData.city) {
          newErrors.city = 'Please select your city';
        }
        if (!formData.area.trim()) {
          newErrors.area = 'Area/Neighborhood is required';
        }
        break;
      case 3:
        // Payment info is optional but validate format if provided
        if (formData.jazzcashNumber && !/^03\d{9}$/.test(formData.jazzcashNumber)) {
          newErrors.jazzcashNumber = 'Enter valid JazzCash number (03XXXXXXXXX)';
        }
        if (formData.easypaisaNumber && !/^03\d{9}$/.test(formData.easypaisaNumber)) {
          newErrors.easypaisaNumber = 'Enter valid Easypaisa number (03XXXXXXXXX)';
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
        showToast('🎉 Seller application submitted successfully!', 'success');
        onComplete();
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to register as seller';
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
        <h3 className="text-xl font-bold text-gray-900">Tell us about your business</h3>
        <p className="text-gray-500 mt-1">This helps customers find and recognize your brand</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Business Name (English) <span className="text-gray-600">*</span>
        </label>
        <input
          type="text"
          name="businessName"
          value={formData.businessName}
          onChange={handleInputChange}
          className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all ${
            errors.businessName ? 'border-red-500 bg-red-50' : 'border-gray-300'
          }`}
          placeholder="e.g., Mom's Kitchen, Desi Delights"
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
          Business Name (Urdu) <span className="text-gray-400 text-xs">(Optional)</span>
        </label>
        <input
          type="text"
          name="businessNameUrdu"
          value={formData.businessNameUrdu}
          onChange={handleInputChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
          placeholder="e.g., امی کا کچن"
          dir="rtl"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Description <span className="text-gray-400 text-xs">(Optional)</span>
        </label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={3}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all resize-none"
          placeholder="Tell customers what makes your food special..."
        />
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-gray-900">Where are you located?</h3>
        <p className="text-gray-500 mt-1">Help customers and riders find you easily</p>
      </div>

      {/* GPS Detection Button */}
      <button
        type="button"
        onClick={detectCurrentLocation}
        disabled={detectingLocation}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50"
      >
        {detectingLocation ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Detecting your location...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Use My Current Location
          </>
        )}
      </button>

      {/* Map */}
      <div 
        ref={mapRef} 
        className="h-48 rounded-xl border-2 border-gray-200 overflow-hidden"
        style={{ zIndex: 1 }}
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            City <span className="text-gray-600">*</span>
          </label>
          <select
            name="city"
            value={formData.city}
            onChange={handleInputChange}
            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all ${
              errors.city ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
          >
            <option value="">Select City</option>
            {PAKISTANI_CITIES.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          {errors.city && <p className="text-gray-600 text-sm mt-1">{errors.city}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Area/Neighborhood <span className="text-gray-600">*</span>
          </label>
          <input
            type="text"
            name="area"
            value={formData.area}
            onChange={handleInputChange}
            className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all ${
              errors.area ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
            placeholder="e.g., DHA Phase 5"
          />
          {errors.area && <p className="text-gray-600 text-sm mt-1">{errors.area}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Full Address <span className="text-gray-400 text-xs">(Auto-filled from map)</span>
        </label>
        <textarea
          name="address"
          value={formData.address}
          onChange={handleInputChange}
          rows={2}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all resize-none text-sm"
          placeholder="Full address will be auto-filled when you select location on map"
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
        <h3 className="text-xl font-bold text-gray-900">Payment Information</h3>
        <p className="text-gray-500 mt-1">How would you like to receive your earnings?</p>
      </div>

      {/* Mobile Wallets */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 p-4 rounded-xl border border-red-100">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
          </svg>
          Mobile Wallets
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              JazzCash Number
            </label>
            <input
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
              Easypaisa Number
            </label>
            <input
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
          Bank Account (Optional)
        </h4>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>
            <select
              name="bankName"
              value={formData.bankName}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
            >
              <option value="">Select Bank</option>
              <option value="HBL">HBL - Habib Bank Limited</option>
              <option value="MCB">MCB Bank</option>
              <option value="UBL">UBL - United Bank Limited</option>
              <option value="Allied">Allied Bank</option>
              <option value="Meezan">Meezan Bank</option>
              <option value="Faysal">Faysal Bank</option>
              <option value="Bank Alfalah">Bank Alfalah</option>
              <option value="Standard Chartered">Standard Chartered</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Number</label>
              <input
                type="text"
                name="bankAccountNumber"
                value={formData.bankAccountNumber}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                placeholder="Account Number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Account Title</label>
              <input
                type="text"
                name="bankAccountTitle"
                value={formData.bankAccountTitle}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                placeholder="Account Holder Name"
              />
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center">
        💡 You can update payment information later from your seller dashboard
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
        <h3 className="text-xl font-bold text-gray-900">Profile & Cover Images</h3>
        <p className="text-gray-500 mt-1">Make your store stand out with great visuals</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Profile Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Profile Image</label>
          <div className="relative">
            {formData.profileImageUrl ? (
              <div className="relative">
                <img
                  src={formData.profileImageUrl}
                  alt="Profile"
                  className="w-32 h-32 rounded-full object-cover mx-auto border-4 border-green-200"
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, profileImageUrl: '' }))}
                  className="absolute top-0 right-1/4 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-32 h-32 mx-auto border-2 border-dashed border-gray-300 rounded-full cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-xs text-gray-500 mt-1">Add Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'profileImageUrl')}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">Your brand logo or photo</p>
        </div>

        {/* Cover Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Cover Image</label>
          <div className="relative">
            {formData.coverImageUrl ? (
              <div className="relative">
                <img
                  src={formData.coverImageUrl}
                  alt="Cover"
                  className="w-full h-32 rounded-xl object-cover border-2 border-green-200"
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, coverImageUrl: '' }))}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-gray-500 mt-1">Add Cover</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'coverImageUrl')}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <p className="text-xs text-gray-500 text-center mt-2">Banner for your store page</p>
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
        <h3 className="text-xl font-bold text-gray-900">Verification Documents</h3>
        <p className="text-gray-500 mt-1">Help us verify your identity and kitchen</p>
      </div>

      {/* CNIC Section */}
      <div className="bg-gray-50 p-4 rounded-xl">
        <h4 className="font-semibold text-gray-800 mb-3">CNIC Photos</h4>
        <div className="grid grid-cols-2 gap-4">
          {/* CNIC Front */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Front Side</label>
            {formData.cnicFrontUrl ? (
              <div className="relative">
                <img src={formData.cnicFrontUrl} alt="CNIC Front" className="w-full h-24 object-cover rounded-lg border" />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, cnicFrontUrl: '' }))}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-xs text-gray-500">Upload</span>
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'cnicFrontUrl')} className="hidden" />
              </label>
            )}
          </div>

          {/* CNIC Back */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Back Side</label>
            {formData.cnicBackUrl ? (
              <div className="relative">
                <img src={formData.cnicBackUrl} alt="CNIC Back" className="w-full h-24 object-cover rounded-lg border" />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, cnicBackUrl: '' }))}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                >
                  ×
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all">
                <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="text-xs text-gray-500">Upload</span>
                <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'cnicBackUrl')} className="hidden" />
              </label>
            )}
          </div>
        </div>
      </div>

      {/* Kitchen Photos */}
      <div className="bg-gray-50 p-4 rounded-xl">
        <h4 className="font-semibold text-gray-800 mb-3">Kitchen Photos</h4>
        <div className="grid grid-cols-4 gap-2">
          {formData.kitchenPhotoUrls.map((url, index) => (
            <div key={index} className="relative">
              <img src={url} alt={`Kitchen ${index + 1}`} className="w-full h-20 object-cover rounded-lg border" />
              <button
                type="button"
                onClick={() => removeKitchenPhoto(index)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
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
        <p className="text-xs text-gray-500 mt-2">Add up to 6 photos of your kitchen</p>
      </div>

      {/* Kitchen Video */}
      <div className="bg-gray-50 p-4 rounded-xl">
        <h4 className="font-semibold text-gray-800 mb-3">Kitchen Video (Optional)</h4>
        <input
          type="url"
          name="kitchenVideoUrl"
          value={formData.kitchenVideoUrl}
          onChange={handleInputChange}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
          placeholder="YouTube or video URL"
        />
      </div>

      <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
        <p className="text-sm text-gray-800 flex items-start gap-2">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span>
            These documents help us verify your identity and ensure food safety. Your application will be reviewed within 24-48 hours.
          </span>
        </p>
      </div>
    </div>
  );

  const stepTitles = [
    'Business Info',
    'Location',
    'Payment',
    'Profile',
    'Verification'
  ];

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
              <h2 className="text-xl font-bold">Complete Your Seller Profile</h2>
              <p className="text-gray-100 text-sm">Step {step} of {totalSteps}: {stepTitles[step - 1]}</p>
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
                ← Back
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
                Skip for now
              </button>
            )}
            
            {step < totalSteps ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={loading}
                className="bg-gray-700 hover:bg-gray-800 text-white px-6"
              >
                Next →
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
                    Submitting...
                  </span>
                ) : (
                  '🎉 Submit Application'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

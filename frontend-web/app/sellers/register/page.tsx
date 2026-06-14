'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

export default function SellerRegisterPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sellerInfo, setSellerInfo] = useState<any>(null);
  const [loadingSellerInfo, setLoadingSellerInfo] = useState(true);
  const [formData, setFormData] = useState({
    businessName: '',
    businessNameUrdu: '',
    description: '',
    kitchenVideoUrl: '',
    coverImageUrl: '',
    cnicFrontUrl: '',
    cnicBackUrl: '',
    kitchenPhotoUrls: [] as string[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    // Load seller information if user is already a seller
    if (user?.user_type === 'seller' || user?.userType === 'seller') {
      loadSellerInfo();
    } else {
      setLoadingSellerInfo(false);
    }
  }, [isAuthenticated, user, router]);

  const loadSellerInfo = async () => {
    try {
      setLoadingSellerInfo(true);
      const response = await apiClient.get('/sellers/me/dashboard');
      if (response.data.success) {
        setSellerInfo(response.data.data);
        // Pre-fill form with existing seller data
        if (response.data.data) {
          const seller = response.data.data;
          setFormData({
            businessName: seller.businessName || '',
            businessNameUrdu: seller.businessNameUrdu || '',
            description: seller.description || '',
            kitchenVideoUrl: seller.kitchenVideoUrl || '',
            coverImageUrl: seller.coverImageUrl || '',
            cnicFrontUrl: seller.cnicFrontUrl || '',
            cnicBackUrl: seller.cnicBackUrl || '',
            kitchenPhotoUrls: seller.kitchenPhotoUrls || [],
          });
        }
      }
    } catch (error: any) {
      // If seller doesn't exist yet, that's okay - they can register
      console.log('No seller info found, user can register');
    } finally {
      setLoadingSellerInfo(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
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

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, [field]: 'File size must be less than 5MB' }));
      return;
    }

    // Validate file type
    if (field === 'kitchenVideoUrl') {
      if (!file.type.startsWith('video/')) {
        setErrors(prev => ({ ...prev, [field]: 'Please upload a video file' }));
        return;
      }
    } else {
      if (!file.type.startsWith('image/')) {
        setErrors(prev => ({ ...prev, [field]: 'Please upload an image file' }));
        return;
      }
    }

    try {
      // In a real app, you would upload to a file storage service (S3, Cloudinary, etc.)
      // For now, we'll create a data URL (in production, use proper file upload)
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (field === 'cnicFrontUrl') {
          setFormData(prev => ({ ...prev, cnicFrontUrl: result }));
        } else if (field === 'cnicBackUrl') {
          setFormData(prev => ({ ...prev, cnicBackUrl: result }));
        } else if (field === 'kitchenPhotoUrls') {
          setFormData(prev => ({ ...prev, kitchenPhotoUrls: [...prev.kitchenPhotoUrls, result] }));
        } else if (field === 'coverImageUrl') {
          setFormData(prev => ({ ...prev, coverImageUrl: result }));
        } else if (field === 'kitchenVideoUrl') {
          setFormData(prev => ({ ...prev, kitchenVideoUrl: result }));
        }
        // Clear error when file is uploaded successfully
        if (errors[field]) {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[field];
            return newErrors;
          });
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setErrors(prev => ({ ...prev, [field]: 'Failed to upload file' }));
    }
  };

  const removeKitchenPhoto = (index: number) => {
    setFormData(prev => ({
      ...prev,
      kitchenPhotoUrls: prev.kitchenPhotoUrls.filter((_, i) => i !== index),
    }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.businessName.trim()) {
      newErrors.businessName = 'Business name is required';
    }
    if (formData.businessName.trim().length < 3) {
      newErrors.businessName = 'Business name must be at least 3 characters';
    }
    // Only validate URLs if they are provided and look like URLs (not data URLs)
    if (formData.kitchenVideoUrl && formData.kitchenVideoUrl.startsWith('http')) {
      if (!isValidUrl(formData.kitchenVideoUrl)) {
        newErrors.kitchenVideoUrl = 'Please enter a valid URL';
      }
    }
    if (formData.coverImageUrl && formData.coverImageUrl.startsWith('http')) {
      if (!isValidUrl(formData.coverImageUrl)) {
        newErrors.coverImageUrl = 'Please enter a valid URL';
      }
    }
    if (formData.cnicFrontUrl && formData.cnicFrontUrl.startsWith('http')) {
      if (!isValidUrl(formData.cnicFrontUrl)) {
        newErrors.cnicFrontUrl = 'Please enter a valid URL';
      }
    }
    if (formData.cnicBackUrl && formData.cnicBackUrl.startsWith('http')) {
      if (!isValidUrl(formData.cnicBackUrl)) {
        newErrors.cnicBackUrl = 'Please enter a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setLoading(true);
    try {
      // Prepare seller registration data (matching backend API)
      const sellerData: any = {
        businessName: formData.businessName,
      };

      if (formData.businessNameUrdu) {
        sellerData.businessNameUrdu = formData.businessNameUrdu;
      }
      if (formData.description) {
        sellerData.description = formData.description;
      }
      if (formData.kitchenVideoUrl) {
        sellerData.kitchenVideoUrl = formData.kitchenVideoUrl;
      }
      if (formData.coverImageUrl) {
        sellerData.coverImageUrl = formData.coverImageUrl;
      }
      if (formData.cnicFrontUrl) {
        sellerData.cnicFrontUrl = formData.cnicFrontUrl;
      }
      if (formData.cnicBackUrl) {
        sellerData.cnicBackUrl = formData.cnicBackUrl;
      }
      if (formData.kitchenPhotoUrls.length > 0) {
        sellerData.kitchenPhotoUrls = formData.kitchenPhotoUrls;
      }

      // If seller already exists, update instead of create
      if (sellerInfo) {
        // TODO: Add update seller endpoint
        showToast('Seller profile update feature coming soon!', 'info');
        return;
      }

      const response = await apiClient.post('/sellers/register', sellerData);

      if (response.data.success) {
        showToast('Seller registration submitted successfully! Your application is under review.', 'success');
        // Reload seller info to show updated status
        setTimeout(() => {
          loadSellerInfo();
        }, 1000);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to register as seller';
      showToast(errorMessage, 'error');
      
      // Set field-specific errors if provided
      if (error.response?.data?.error?.fields) {
        setErrors(error.response.data.error.fields);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loadingSellerInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading seller information...</p>
        </div>
      </div>
    );
  }

  const isApprovedSeller = sellerInfo?.verificationStatus === 'approved';
  const isPendingSeller = sellerInfo?.verificationStatus === 'pending';
  const isRejectedSeller = sellerInfo?.verificationStatus === 'rejected';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/products" className="text-green-600 hover:text-green-700 mb-4 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to Products
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {isApprovedSeller ? 'Seller Profile' : isPendingSeller ? 'Seller Application Pending' : 'Become a Seller'}
          </h1>
          <p className="text-gray-600">
            {isApprovedSeller 
              ? 'View and update your seller profile information'
              : isPendingSeller
              ? 'Your seller application is under review. You can update your information below.'
              : 'Complete your seller profile to start selling your homemade food on Nuray'
            }
          </p>
          
          {/* Status Badge */}
          {sellerInfo && (
            <div className="mt-4">
              {isApprovedSeller && (
                <div className="inline-flex items-center px-4 py-2 bg-green-100 text-green-800 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 mr-2" />
                  <span className="font-medium">Approved Seller</span>
                </div>
              )}
              {isPendingSeller && (
                <div className="inline-flex items-center px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg">
                  <Clock className="w-5 h-5 mr-2" />
                  <span className="font-medium">Application Pending Review</span>
                </div>
              )}
              {isRejectedSeller && (
                <div className="inline-flex items-center px-4 py-2 bg-red-100 text-red-800 rounded-lg">
                  <XCircle className="w-5 h-5 mr-2" />
                  <span className="font-medium">Application Rejected</span>
                  {sellerInfo.rejectionReason && (
                    <span className="ml-2 text-sm">({sellerInfo.rejectionReason})</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8 space-y-6">
          {/* Business Information */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Business Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Name (English) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleInputChange}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                    errors.businessName ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="e.g., Mom's Kitchen"
                />
                {errors.businessName && (
                  <p className="text-red-500 text-sm mt-1">{errors.businessName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Business Name (Urdu)
                </label>
                <input
                  type="text"
                  name="businessNameUrdu"
                  value={formData.businessNameUrdu}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="e.g., امی کا کچن"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={4}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                  errors.description ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Tell customers about your food and cooking style..."
              />
              {errors.description && (
                <p className="text-red-500 text-sm mt-1">{errors.description}</p>
              )}
            </div>
          </div>

          {/* Cover Image & Video */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Media</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cover Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cover Image
                </label>
                
                {/* URL Input */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-600 mb-1">Or paste image URL:</label>
                  <input
                    type="url"
                    name="coverImageUrl"
                    value={formData.coverImageUrl}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm ${
                      errors.coverImageUrl ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="https://example.com/cover-image.jpg"
                  />
                </div>
                
                {/* File Upload */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Or upload file:</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'coverImageUrl')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                  />
                </div>
                
                {errors.coverImageUrl && (
                  <p className="text-red-500 text-sm mt-1">{errors.coverImageUrl}</p>
                )}
                
                {/* Preview */}
                {formData.coverImageUrl && (
                  <div className="mt-3">
                    <img 
                      src={formData.coverImageUrl} 
                      alt="Cover" 
                      className="w-full h-32 object-cover rounded border" 
                    />
                  </div>
                )}
              </div>

              {/* Kitchen Video */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Kitchen Video
                </label>
                
                {/* URL Input */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-600 mb-1">Or paste video URL:</label>
                  <input
                    type="url"
                    name="kitchenVideoUrl"
                    value={formData.kitchenVideoUrl}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm ${
                      errors.kitchenVideoUrl ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>
                
                {/* File Upload */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Or upload video file:</label>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => handleFileUpload(e, 'kitchenVideoUrl')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                  />
                </div>
                
                {errors.kitchenVideoUrl && (
                  <p className="text-red-500 text-sm mt-1">{errors.kitchenVideoUrl}</p>
                )}
                
                {/* Preview */}
                {formData.kitchenVideoUrl && isValidUrl(formData.kitchenVideoUrl) && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500">Video URL: {formData.kitchenVideoUrl}</p>
                  </div>
                )}
                {formData.kitchenVideoUrl && !isValidUrl(formData.kitchenVideoUrl) && (
                  <div className="mt-3">
                    <video src={formData.kitchenVideoUrl} controls className="w-full h-32 rounded border" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CNIC Verification */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">CNIC Verification</h2>
            <p className="text-sm text-gray-600 mb-4">
              Upload photos of your CNIC for verification. You can either upload files directly or paste image URLs.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* CNIC Front */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CNIC Front Photo
                </label>
                
                {/* URL Input */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-600 mb-1">Or paste image URL:</label>
                  <input
                    type="url"
                    name="cnicFrontUrl"
                    value={formData.cnicFrontUrl}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm ${
                      errors.cnicFrontUrl ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="https://example.com/cnic-front.jpg"
                  />
                </div>
                
                {/* File Upload */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Or upload file:</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'cnicFrontUrl')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                  />
                </div>
                
                {errors.cnicFrontUrl && (
                  <p className="text-red-500 text-sm mt-1">{errors.cnicFrontUrl}</p>
                )}
                
                {/* Preview */}
                {formData.cnicFrontUrl && (
                  <div className="mt-3">
                    <img 
                      src={formData.cnicFrontUrl} 
                      alt="CNIC Front" 
                      className="w-full h-32 object-cover rounded border" 
                    />
                  </div>
                )}
              </div>

              {/* CNIC Back */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CNIC Back Photo
                </label>
                
                {/* URL Input */}
                <div className="mb-3">
                  <label className="block text-xs text-gray-600 mb-1">Or paste image URL:</label>
                  <input
                    type="url"
                    name="cnicBackUrl"
                    value={formData.cnicBackUrl}
                    onChange={handleInputChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm ${
                      errors.cnicBackUrl ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="https://example.com/cnic-back.jpg"
                  />
                </div>
                
                {/* File Upload */}
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Or upload file:</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, 'cnicBackUrl')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                  />
                </div>
                
                {errors.cnicBackUrl && (
                  <p className="text-red-500 text-sm mt-1">{errors.cnicBackUrl}</p>
                )}
                
                {/* Preview */}
                {formData.cnicBackUrl && (
                  <div className="mt-3">
                    <img 
                      src={formData.cnicBackUrl} 
                      alt="CNIC Back" 
                      className="w-full h-32 object-cover rounded border" 
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Kitchen Photos */}
          <div className="border-b border-gray-200 pb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Kitchen Photos</h2>
            <p className="text-sm text-gray-600 mb-4">
              Add your kitchen photos. You can either upload files directly or paste image URLs.
            </p>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kitchen Photos
              </label>
              
              {/* URL Input Section */}
              <div className="mb-4">
                <label className="block text-xs text-gray-600 mb-2">Add by URL:</label>
                <div className="space-y-2">
                  {formData.kitchenPhotoUrls.map((url, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => {
                          const newUrls = [...formData.kitchenPhotoUrls];
                          newUrls[index] = e.target.value;
                          setFormData(prev => ({ ...prev, kitchenPhotoUrls: newUrls }));
                        }}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                        placeholder="https://example.com/kitchen-photo.jpg"
                      />
                      <button
                        type="button"
                        onClick={() => removeKitchenPhoto(index)}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, kitchenPhotoUrls: [...prev.kitchenPhotoUrls, ''] }))}
                    className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-green-500 hover:text-green-600 text-sm"
                  >
                    + Add Kitchen Photo URL
                  </button>
                </div>
              </div>
              
              {/* File Upload Section */}
              <div>
                <label className="block text-xs text-gray-600 mb-2">Or upload files:</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach(file => {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        const result = reader.result as string;
                        setFormData(prev => ({ 
                          ...prev, 
                          kitchenPhotoUrls: [...prev.kitchenPhotoUrls, result] 
                        }));
                      };
                      reader.readAsDataURL(file);
                    });
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">You can select multiple images at once</p>
              </div>
              
              {/* Preview Section */}
              {formData.kitchenPhotoUrls.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview ({formData.kitchenPhotoUrls.length} photo{formData.kitchenPhotoUrls.length > 1 ? 's' : ''}):</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {formData.kitchenPhotoUrls.map((url, index) => (
                      url && (
                        <div key={index} className="relative group">
                          <img 
                            src={url} 
                            alt={`Kitchen ${index + 1}`} 
                            className="w-full h-32 object-cover rounded border" 
                          />
                          <button
                            type="button"
                            onClick={() => removeKitchenPhoto(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex gap-4 justify-end pt-6">
            <Link href="/products">
              <Button type="button" variant="outline" disabled={loading}>
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700 text-white px-8">
              {loading ? 'Submitting...' : 'Submit Application'}
            </Button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            Your application will be reviewed by our team. You'll be notified once approved.
          </p>
        </form>
      </div>
    </div>
  );
}


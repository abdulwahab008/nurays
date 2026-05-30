'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

export default function AdminLoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.loginWithEmail(
        formData.email.trim().toLowerCase(),
        formData.password
      );

      // Response structure: authService.loginWithEmail returns response.data
      // response.data = ApiResponse<AuthResponse>
      // So: response.data.data = AuthResponse
      // But backend returns { user, accessToken, refreshToken } not { user, tokens }
      // So we need to handle both structures
      const authData = (response as any).data?.data || (response as any).data;
      const user = authData?.user;
      
      if (user) {
        // Check if user is admin
        const userType = (user as any).user_type || (user as any).userType;
        if (userType !== 'admin') {
          setError('Access denied. Admin credentials required.');
          showToast('Access denied. Admin credentials required.', 'error');
          return;
        }

        // Store tokens - backend returns accessToken and refreshToken directly
        if (authData?.accessToken && authData?.refreshToken) {
          apiClient.setTokens(authData.accessToken, authData.refreshToken);
        } else if (authData?.tokens) {
          // Fallback: if tokens are nested
          apiClient.setTokens(authData.tokens.access_token, authData.tokens.refresh_token);
        }

        // Set user
        setUser(user as any);

        showToast('Login successful!', 'success');
        router.push('/admin/dashboard');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || 'Login failed';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Login</h1>
          <p className="text-gray-600">Access the admin dashboard</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="admin@nuray.pk"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Enter your password"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2"
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm text-gray-600 hover:text-green-600">
              ← Back to regular login
            </Link>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> Admin access is restricted. Only users with admin privileges can access this page.
          </p>
        </div>
      </div>
    </div>
  );
}


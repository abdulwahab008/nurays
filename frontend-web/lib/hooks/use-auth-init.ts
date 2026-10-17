'use client';

import { useEffect, useState } from 'react';
import { useAuthStore, type User } from '@/lib/store/auth-store';
import { apiClient, type ApiResponse } from '@/lib/api-client';

/**
 * Hook to initialize auth state on app load
 * Verifies token and restores user session
 */
export function useAuthInit() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // Check if we have a token but no user (page refresh scenario)
        if (typeof window !== 'undefined') {
          const token = apiClient.getAccessToken();
          
          if (token && !user) {
            // Try to verify token and get user info
            try {
              const response = await apiClient.get<ApiResponse<User>>('/auth/me', { timeout: 3000 });
              if (mounted && response.data?.success && response.data?.data) {
                setUser(response.data.data);
              } else if (mounted) {
                // Invalid token, clear it
                apiClient.clearTokens();
              }
            } catch (error: any) {
              // Token is invalid or expired, clear it
              if (mounted) {
                if (error.response?.status === 401) {
                  apiClient.clearTokens();
                }
              }
            }
          } else if (!token && user && mounted) {
            // We have user but no token - invalid state, clear user
            setUser(null);
          }
        }
      } finally {
        if (mounted) {
          setInitialized(true);
        }
      }
    };

    initAuth();

    // Failsafe timer: never leave AuthProvider in uninitialized loading state
    const timer = setTimeout(() => {
      if (mounted) {
        setInitialized(true);
      }
    }, 1500);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []); // Only run once on mount

  return { initialized };
}


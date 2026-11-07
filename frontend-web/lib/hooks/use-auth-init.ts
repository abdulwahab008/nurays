'use client';

import { useEffect, useState } from 'react';
import { useAuthStore, type User } from '@/lib/store/auth-store';
import { apiClient, type ApiResponse, apiErrorStatus } from '@/lib/api-client';

/**
 * Hook to initialize auth state on app load
 * Verifies token and restores user session
 */
export function useAuthInit() {
  const setUser = useAuthStore((state) => state.setUser);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // A saved account after a reload: the first request renews the access token through the refresh cookie (or
        // finds the session ended, which signs out), and brings the account up to date.
        if (typeof window !== 'undefined') {
          // The store itself: on the first render after a load the hook's `user` is still the signed-out snapshot.
          if (useAuthStore.getState().user) {
            try {
              const response = await apiClient.get<ApiResponse<User>>('/auth/me', { timeout: 3000 });
              if (mounted && response.data?.success && response.data?.data) {
                setUser(response.data.data);
              } else if (mounted) {
                // Invalid token, clear it
                apiClient.clearTokens();
              }
            } catch (error) {
              if (mounted && apiErrorStatus(error) === 401) {
                setUser(null);
                apiClient.clearTokens();
              }
            }
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


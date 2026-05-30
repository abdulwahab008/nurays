'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

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
      // Check if we have a token but no user (page refresh scenario)
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('access_token');
        
        if (token && !user) {
          // Try to verify token and get user info
          try {
            const response = await apiClient.get('/auth/me');
            if (mounted && response.data.success && response.data.data) {
              setUser(response.data.data as any);
            } else if (mounted) {
              // Invalid token, clear it
              localStorage.removeItem('access_token');
              localStorage.removeItem('refresh_token');
            }
          } catch (error: any) {
            // Token is invalid or expired, clear it
            if (mounted) {
              if (error.response?.status === 401) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
              }
            }
          }
        } else if (!token && user && mounted) {
          // We have user but no token - invalid state, clear user
          setUser(null);
        }
      }
      if (mounted) {
        setInitialized(true);
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, []); // Only run once on mount

  return { initialized };
}


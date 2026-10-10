'use client';

import { ReactNode, useEffect } from 'react';
import { useAuthInit } from '@/lib/hooks/use-auth-init';
import { useAuthStore } from '@/lib/store/auth-store';
import { claimPushSubscription } from '@/lib/push';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  useAuthInit();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Whoever is signed in on this browser owns its push subscription (if push was ever turned on here).
  useEffect(() => {
    if (isAuthenticated) void claimPushSubscription();
  }, [isAuthenticated]);

  return <>{children}</>;
}

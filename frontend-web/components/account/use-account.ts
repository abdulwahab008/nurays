'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { userProfileService, type UserProfile } from '@/lib/services/user-profile.service';

/** The signed-in account's own profile (GET /users/me), for the account sections on the kitchen's and rider's settings. */
export function useOwnProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await userProfileService.getProfile();
      setProfile(res.data);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profile, setProfile, error, reload };
}

/**
 * Signing out (or closing the account) from a page behind RoleGuard. It leaves for the sign-in page first, then ends the
 * session, as the top bar's Sign out does: the guard must not see a signed-out visitor here and send them to sign in
 * with this page as ?next= (the next person to sign in on the device would land on it).
 */
export function useLeaveSignedOut() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  return useCallback(() => {
    router.replace('/login');
    logout();
  }, [router, logout]);
}

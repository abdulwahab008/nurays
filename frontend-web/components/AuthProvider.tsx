'use client';

import { ReactNode } from 'react';
import { useAuthInit } from '@/lib/hooks/use-auth-init';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  useAuthInit();
  return <>{children}</>;
}


'use client';

import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { useToast } from './ui/toast';
import { useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';
import { nativePlatform, nativeProviders, proofFromLogin, socialLoginInit, type NativeWindow, type SocialProof } from '@/lib/native-shell';

const ids = { web: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, ios: process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID };

let initialized: Promise<void> | null = null;

/**
 * Inside the store app: Google through the phone's own sign-in (Android's Credential Manager, Google's iOS SDK) and, on
 * an iPhone, Sign in with Apple. Each hands back a signed ID token, passed on as a `SocialProof` for the page to send.
 * Nothing shows where the phone's provider is not set up (no Google client id for it), and a cancelled sheet is quiet.
 */
export function NativeSignInButtons({ onSuccess, googleText }: { onSuccess: (proof: SocialProof) => void; googleText?: string }) {
  const t = useT(authMessages);
  const { showToast } = useToast();
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPlatform(nativePlatform(window as unknown as NativeWindow));
  }, []);

  if (!platform) return null;
  const plugin = (window as unknown as NativeWindow).Capacitor?.Plugins?.SocialLogin;
  const providers = nativeProviders(platform, ids);
  if (!plugin || (!providers.google && !providers.apple)) return null;

  const signIn = async (provider: 'google' | 'apple') => {
    setBusy(true);
    try {
      initialized ??= plugin.initialize(socialLoginInit(platform, ids));
      await initialized;
      const { result } = await plugin.login({ provider, options: { scopes: provider === 'apple' ? ['name', 'email'] : ['email', 'profile'] } });
      const proof = proofFromLogin(provider, result);
      if (!proof) throw new Error('no token');
      onSuccess(proof);
    } catch (err) {
      initialized = null;
      // The person closed the sheet: nothing to say.
      if (!/cancel/i.test(String((err as { message?: string })?.message ?? err))) {
        showToast(provider === 'apple' ? t('appleFailed') : t('googleFailed'), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="native-sign-in">
      {providers.apple && (
        // Apple's guidelines: a black button with the Apple logo and its own wording.
        <Button type="button" disabled={busy} onClick={() => signIn('apple')} className="w-full flex items-center justify-center gap-2 bg-black text-white hover:bg-black/90">
          <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.37 12.55c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.77-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.89 1.15 9.15.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.8c.63-.77 1.06-1.83.94-2.89-.91.04-2.02.61-2.67 1.37-.58.68-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.28z" />
          </svg>
          {t('continueWithApple')}
        </Button>
      )}
      {providers.google && (
        <Button type="button" variant="outline" disabled={busy} onClick={() => signIn('google')} className="w-full flex items-center justify-center gap-2 border-gray-300 hover:bg-gray-50">
          <svg aria-hidden="true" className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {googleText ?? t('continueWithGoogle')}
        </Button>
      )}
    </div>
  );
}

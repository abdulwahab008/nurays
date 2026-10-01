'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NurayButton as Button } from '@/components/ui/NurayButton';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { BrandLockup } from '@/components/ui/Mark';

export default function ForgotPasswordPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim() });
      // The server answers the same whether or not the account exists.
      setSent(true);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Could not send the reset email. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6 flex justify-center">
          <BrandLockup />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">Forgot your password?</h1>
        {sent ? (
          <>
            <p className="text-sm text-slate-600 mt-3">
              If an account exists for <strong>{email}</strong>, we&apos;ve emailed a link to choose a new password. It expires in an hour.
            </p>
            <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-emerald-700 underline">
              Back to login
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-3">
            <p className="text-sm text-slate-600">Enter your email and we&apos;ll send you a reset link.</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full h-12 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <Button type="submit" className="w-full h-12 text-sm font-bold" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
            <Link href="/login" className="block text-center text-sm text-slate-500 underline">
              Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}

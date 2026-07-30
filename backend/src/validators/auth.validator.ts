import { z } from 'zod';

export const requestOTPSchema = z.object({
  phone: z.string().min(10).max(15),
  purpose: z.enum(['registration', 'login', 'reset_password']),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  user_type: z.enum(['customer', 'seller', 'admin', 'hub_manager', 'rider']),
  full_name: z.string().min(2, 'Full name is required').max(255),
  phone: z.string().min(10).max(15).optional(),
  city: z.string().max(100).optional(),
  area: z.string().max(100).optional(),
  business_name: z.string().min(1).max(255).optional(),
});

export const loginSchema = z.object({
  phoneOrEmail: z.string().min(1, 'Phone or email is required'),
  otpCodeOrPassword: z.string().min(1, 'OTP code or password is required'),
  loginMethod: z.enum(['otp', 'email']).default('email'),
}).refine((data) => {
  // If email login, validate email format
  if (data.loginMethod === 'email') {
    return z.string().email().safeParse(data.phoneOrEmail).success;
  }
  // If OTP login, validate phone length
  if (data.loginMethod === 'otp') {
    return data.phoneOrEmail.length >= 10 && data.phoneOrEmail.length <= 15;
  }
  return true;
}, {
  message: 'Invalid email format for email login or invalid phone for OTP login',
  path: ['phoneOrEmail'],
}).refine((data) => {
  // If OTP login, validate OTP length
  if (data.loginMethod === 'otp') {
    return data.otpCodeOrPassword.length === 6;
  }
  // If email login, validate password length
  if (data.loginMethod === 'email') {
    return data.otpCodeOrPassword.length >= 6;
  }
  return true;
}, {
  message: 'OTP must be 6 digits or password must be at least 6 characters',
  path: ['otpCodeOrPassword'],
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(255).optional(),
  email: z.string().email().optional(),
  city: z.string().max(100).optional(),
  area: z.string().max(100).optional(),
  languagePreference: z.enum(['en', 'ur']).optional(),
});

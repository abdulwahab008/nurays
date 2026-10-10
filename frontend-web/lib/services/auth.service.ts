import { apiClient, ApiResponse } from '../api-client';
import type { User } from '../store/auth-store';

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  user_type: string;
  phone?: string;
  /** Code sent to `phone` (see registerSendPhoneOtp). Without it the phone is saved unverified. */
  phone_otp?: string;
  city?: string;
  area?: string;
  business_name?: string; // Required for sellers
}

export interface LoginSendOtpRequest {
  phone: string;
}

export interface LoginVerifyOtpRequest {
  phone: string;
  otp: string;
}

export interface LoginPasswordRequest {
  phone: string;
  password: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** The signed-in user is one type, the one the auth store keeps (a sign-in answers with the same fields). */
export type { User };

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
  requiresEmailVerification?: boolean;
}

export const authService = {
  // Registration (Email + Password is primary)
  register: async (data: RegisterRequest) => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      '/auth/register',
      data
    );
    return response.data;
  },

  // Signup – send a code to the phone number being registered (proves ownership)
  registerSendPhoneOtp: async (phone: string) => {
    const response = await apiClient.post<ApiResponse<{ message?: string; phone?: string }>>(
      '/auth/otp/request',
      { phone, purpose: 'registration' }
    );
    return response.data;
  },

  // Signed-in account – send a code to a number to verify it (or add a real number)
  requestPhoneVerification: async (phone: string) => {
    const response = await apiClient.post<ApiResponse<{ message?: string; phone?: string }>>(
      '/auth/phone/request',
      { phone }
    );
    return response.data;
  },

  verifyPhone: async (phone: string, otp: string) => {
    const response = await apiClient.post<ApiResponse<{ phone: string; phoneVerified: boolean }>>(
      '/auth/phone/verify',
      { phone, otp }
    );
    return response.data;
  },

  // Google OAuth login/signup
  loginWithGoogle: async (accessToken: string) => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      '/auth/google',
      { accessToken }
    );
    return response.data;
  },

  // Login – request OTP via backend /auth/otp/request with purpose 'login'
  loginSendOtp: async (data: LoginSendOtpRequest) => {
    const response = await apiClient.post<ApiResponse<{ message?: string; phone?: string }>>(
      '/auth/otp/request',
      { phone: data.phone, purpose: 'login' }
    );
    return response.data;
  },

  loginVerifyOtp: async (data: LoginVerifyOtpRequest) => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      '/auth/login',
      {
        phoneOrEmail: data.phone,
        otpCodeOrPassword: data.otp,
        loginMethod: 'otp',
      }
    );
    return response.data;
  },

  loginPassword: async (data: LoginPasswordRequest) => {
    // Note: Phone + Password login not yet supported by backend
    // This will use email login endpoint but may not work correctly
    throw new Error('Phone + Password login not yet supported. Please use Email login or OTP login.');
  },

  loginWithEmail: async (email: string, password: string) => {
    const response = await apiClient.post<ApiResponse<AuthResponse>>(
      '/auth/login',
      {
        phoneOrEmail: email,
        otpCodeOrPassword: password,
        loginMethod: 'email',
      }
    );
    return response.data;
  },

  // Email Verification
  verifyEmail: async (token: string) => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      '/auth/verify-email',
      { token }
    );
    return response.data;
  },

  resendVerificationEmail: async () => {
    const response = await apiClient.post<ApiResponse<{ message: string }>>(
      '/auth/resend-verification'
    );
    return response.data;
  },

  // Signed in: change the password. Every other device is signed out; this one is handed new tokens (store them with apiClient.setTokens).
  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await apiClient.post<ApiResponse<{ tokens: AuthTokens }>>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  },

  // E-mails a one-time link to set a new password (always answers the same, whether or not the address has an account).
  forgotPassword: async (email: string) => {
    const response = await apiClient.post<ApiResponse<{ message?: string }>>('/auth/forgot-password', { email });
    return response.data;
  },

  // Token refresh lives in lib/api-client.ts (transparent on 401).

  logout: async () => {
    await apiClient.post('/auth/logout');
  },
};

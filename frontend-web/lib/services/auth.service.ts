import { apiClient, ApiResponse } from '../api-client';

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  user_type: string;
  phone?: string;
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

export interface User {
  id: string;
  phone: string;
  email?: string;
  user_type?: string;
  userType?: string;
  profile?: {
    fullName: string;
    avatarUrl?: string;
    city?: string;
    area?: string;
  };
  emailVerified?: boolean;
}

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

  // Token management
  refreshToken: async (refreshToken: string) => {
    const response = await apiClient.post<ApiResponse<AuthTokens>>('/auth/refresh-token', {
      refresh_token: refreshToken,
    });
    return response.data;
  },

  logout: async () => {
    await apiClient.post('/auth/logout');
  },
};

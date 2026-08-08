import { Request, Response } from 'express';
import authService from '../services/auth.service';
import googleAuthService from '../services/google-auth.service';
import { AppError } from '../middleware/errorHandler';

export const requestOTP = async (req: Request, res: Response) => {
  const { phone, purpose } = req.body;

  const result = await authService.requestOTP(phone, purpose);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const register = async (req: Request, res: Response) => {
  const { email, password, user_type, full_name, phone, city, area, business_name } = req.body;

  // Validate business_name is provided for sellers
  if (user_type === 'seller' && !business_name?.trim()) {
    throw new AppError('Business name is required for seller registration', 400, 'BUSINESS_NAME_REQUIRED');
  }

  // Map snake_case from request to camelCase for service method
  const result = await authService.register(
    email,
    password,
    user_type as 'customer' | 'seller' | 'rider',
    full_name,
    phone,
    city,
    area,
    business_name
  );

  const message =
    user_type === 'seller'
      ? 'Seller account created successfully. Your account is pending approval.'
      : user_type === 'rider'
        ? 'Rider application submitted. Your account is pending admin approval.'
        : 'User registered successfully.';

  res.status(201).json({
    success: true,
    message,
    data: result,
  });
};

export const login = async (req: Request, res: Response) => {
  const { phoneOrEmail, otpCodeOrPassword, loginMethod = 'email' } = req.body;

  const result = await authService.login(phoneOrEmail, otpCodeOrPassword, loginMethod);

  res.status(200).json({
    success: true,
    message: result.requiresEmailVerification 
      ? 'Login successful. Please verify your email address.' 
      : 'Login successful',
    data: result,
  });
};

export const verifyEmail = async (req: Request, res: Response) => {
  const { token } = req.body;

  await authService.verifyEmail(token);

  res.status(200).json({
    success: true,
    message: 'Email verified successfully',
  });
};

export const resendVerificationEmail = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  await authService.resendVerificationEmail(req.user.userId);

  res.status(200).json({
    success: true,
    message: 'Verification email sent successfully',
  });
};

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  const result = await authService.refreshToken(refreshToken);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const getCurrentUser = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  const user = await authService.getCurrentUser(req.user.userId);

  res.status(200).json({
    success: true,
    data: user,
  });
};

export const loginWithGoogle = async (req: Request, res: Response) => {
  const { accessToken } = req.body;

  if (!accessToken) {
    throw new AppError('Google access token is required', 400, 'MISSING_GOOGLE_TOKEN');
  }

  const result = await googleAuthService.authenticateWithGoogle(accessToken);

  res.status(200).json({
    success: true,
    message: result.requiresEmailVerification
      ? 'Login successful. Please verify your email address.'
      : 'Login successful',
    data: result,
  });
};

export const logout = async (_req: Request, res: Response) => {
  // In a stateless JWT system, logout is handled client-side
  // You can implement token blacklisting here if needed

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

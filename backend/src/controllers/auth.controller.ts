import { Request, Response } from 'express';
import authService from '../services/auth.service';
import googleAuthService from '../services/google-auth.service';
import { AppError } from '../middleware/errorHandler';
import prisma from '../config/database';
import socketManager from '../config/socket';
import { recordAudit } from '../middleware/audit';

export const requestOTP = async (req: Request, res: Response) => {
  const { phone, purpose } = req.body;

  const result = await authService.requestOTP(phone, purpose);

  res.status(200).json({
    success: true,
    data: result,
  });
};

export const requestPhoneVerification = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }
  const result = await authService.requestPhoneVerification(req.user.userId, req.body.phone);
  res.status(200).json({ success: true, data: result });
};

export const verifyPhone = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }
  const result = await authService.verifyPhone(req.user.userId, req.body.phone, req.body.otp);
  res.status(200).json({ success: true, message: 'Phone number verified', data: result });
};

export const forgotPassword = async (req: Request, res: Response) => {
  await authService.forgotPassword(req.body.email);
  // The same answer whether or not the email has an account.
  res.status(200).json({
    success: true,
    message: 'If an account exists for that email, a reset link is on its way.',
  });
};

export const resetPassword = async (req: Request, res: Response) => {
  await authService.resetPassword(req.body.token, req.body.password);
  res.status(200).json({ success: true, message: 'Password updated. Please log in with your new password.' });
};

export const register = async (req: Request, res: Response) => {
  const { email, password, user_type, full_name, phone, phone_otp, city, area, business_name } = req.body;

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
    business_name,
    phone_otp
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
  const { accessToken, idToken } = req.body;

  if (!accessToken && !idToken) {
    throw new AppError('A Google access token or ID token is required', 400, 'MISSING_GOOGLE_TOKEN');
  }

  // The web button sends an access token; a native app's Google sign-in produces an ID token.
  const result = idToken ? await googleAuthService.authenticateWithGoogleIdToken(idToken) : await googleAuthService.authenticateWithGoogle(accessToken);

  res.status(200).json({
    success: true,
    message: result.requiresEmailVerification
      ? 'Login successful. Please verify your email address.'
      : 'Login successful',
    data: result,
  });
};

export const logout = async (req: Request, res: Response) => {
  // Logging out ends every session the account has, on every device: a copied token (and the
  // 30-day refresh token with it) stops working at once. Tokens are stateless, so this is the
  // only way a sign-out can mean anything.
  if (req.user) {
    await prisma.user.update({ where: { id: req.user.userId }, data: { tokensValidAfter: new Date() } });
    socketManager.disconnectUser(req.user.userId);
    if (req.user.userType === 'admin') {
      void recordAudit({ userId: req.user.userId, action: 'auth:LOGOUT', entityType: 'user', entityId: req.user.userId, ipAddress: req.ip, responseStatus: 200 });
    }
  }

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

import { Router } from 'express';
import {
  requestOTP,
  register,
  login,
  loginWithGoogle,
  verifyEmail,
  resendVerificationEmail,
  refreshToken,
  getCurrentUser,
  logout,
  requestPhoneVerification,
  verifyPhone,
  forgotPassword,
  resetPassword,
  changePassword,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validation.middleware';
import {
  requestOTPSchema,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  refreshTokenSchema,
  requestPhoneVerificationSchema,
  verifyPhoneSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  googleLoginSchema,
} from '../validators/auth.validator';
import { authenticate } from '../middleware/auth.middleware';
import {
  forgotIpLimiter,
  forgotTargetLimiter,
  loginAddressLimiter,
  loginLimiter,
  otpIpLimiter,
  otpTargetLimiter,
  phoneVerifyRequestLimiter,
  registerLimiter,
  resendVerificationLimiter,
} from '../middleware/rateLimiter';

const router = Router();

// Public routes
router.post('/otp/request', otpIpLimiter, otpTargetLimiter, validate(requestOTPSchema), requestOTP);
router.post('/register', registerLimiter, validate(registerSchema), register);
router.post('/login', loginAddressLimiter, loginLimiter, validate(loginSchema), login);
router.post('/google', loginAddressLimiter, loginLimiter, validate(googleLoginSchema), loginWithGoogle);
router.post('/verify-email', validate(verifyEmailSchema), verifyEmail);
router.post('/forgot-password', forgotIpLimiter, forgotTargetLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', loginLimiter, validate(resetPasswordSchema), resetPassword);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/resend-verification', authenticate, resendVerificationLimiter, resendVerificationEmail);
router.post('/logout', authenticate, logout);
// Asks for the current password again; wrong ones are counted per account (services/reauth.service.ts).
router.post('/change-password', authenticate, validate(changePasswordSchema), changePassword);

// Phone verification for the signed-in account (also how an account adds a real number)
router.post('/phone/request', authenticate, phoneVerifyRequestLimiter, otpTargetLimiter, validate(requestPhoneVerificationSchema), requestPhoneVerification);
router.post('/phone/verify', authenticate, loginLimiter, validate(verifyPhoneSchema), verifyPhone);

export default router;


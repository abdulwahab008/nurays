import { Router } from 'express';
import {
  requestOTP,
  register,
  login,
  loginWithGoogle,
  loginWithApple,
  verifyEmail,
  resendVerificationEmail,
  refreshToken,
  getCurrentUser,
  logout,
  logoutAll,
  getSessions,
  deleteSession,
  verifyTwoFactor,
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  getTwoFactorStatus,
  renewBackupCodes,
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
  appleLoginSchema,
} from '../validators/auth.validator';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
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
router.post('/apple', loginAddressLimiter, loginLimiter, validate(appleLoginSchema), loginWithApple);
router.post('/verify-email', validate(verifyEmailSchema), verifyEmail);
router.post('/forgot-password', forgotIpLimiter, forgotTargetLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', loginLimiter, validate(resetPasswordSchema), resetPassword);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);
// Staff two-step sign-in (SEC-3): the second step, and setting the authenticator app up (by the sign-in's challenge
// token, or signed in).
router.post('/2fa/verify', loginLimiter, verifyTwoFactor);
router.post('/2fa/setup', loginLimiter, optionalAuthenticate, beginTwoFactorSetup);
router.post('/2fa/setup/confirm', loginLimiter, optionalAuthenticate, confirmTwoFactorSetup);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/resend-verification', authenticate, resendVerificationLimiter, resendVerificationEmail);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/sessions', authenticate, getSessions);
router.get('/2fa', authenticate, getTwoFactorStatus);
router.post('/2fa/backup-codes', authenticate, loginLimiter, renewBackupCodes);
router.delete('/sessions/:id', authenticate, deleteSession);
// Asks for the current password again; wrong ones are counted per account (services/reauth.service.ts).
router.post('/change-password', authenticate, validate(changePasswordSchema), changePassword);

// Phone verification for the signed-in account (also how an account adds a real number)
router.post('/phone/request', authenticate, phoneVerifyRequestLimiter, otpTargetLimiter, validate(requestPhoneVerificationSchema), requestPhoneVerification);
router.post('/phone/verify', authenticate, loginLimiter, validate(verifyPhoneSchema), verifyPhone);

export default router;


import { signInWithApple } from '../services/apple-auth.service';
import { Request, Response } from 'express';
import authService from '../services/auth.service';
import googleAuthService from '../services/google-auth.service';
import { AppError } from '../middleware/errorHandler';
import socketManager from '../config/socket';
import { recordAudit } from '../middleware/audit';
import { removeAllSubscriptions, removeSubscription } from '../services/push.service';
import { endSession, listSessions } from '../services/session.service';
import { logger } from '../utils/logger';
import { guardAccountProbe } from '../middleware/accountProbe';
import * as twoFactor from '../services/staff-two-factor.service';
import { verifyChallenge, type ChallengePurpose } from '../utils/jwt';
import prisma from '../config/database';

export const requestOTP = async (req: Request, res: Response) => {
  const { phone, purpose } = req.body;

  const result = await guardAccountProbe(req, () => authService.requestOTP(phone, purpose));

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
  const result = await guardAccountProbe(req, () => authService.register(
    email,
    password,
    user_type as 'customer' | 'seller' | 'rider',
    full_name,
    phone,
    city,
    area,
    business_name,
    phone_otp
  ));

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

  const result = await guardAccountProbe(req, () => authService.login(phoneOrEmail, otpCodeOrPassword, loginMethod, req.ip));

  // A staff member's password was right, and the second step is next: no session yet (SEC-3).
  if ('challengeToken' in result) {
    res.status(200).json({
      success: true,
      message: 'twoFactorRequired' in result ? 'Enter the code from your authenticator app' : 'Set up two-step sign-in to continue',
      data: result,
    });
    return;
  }
  res.status(200).json({
    success: true,
    message: result.requiresEmailVerification 
      ? 'Login successful. Please verify your email address.' 
      : 'Login successful',
    data: result,
  });
};

const challengeUser = (token: unknown, purpose: ChallengePurpose): string => {
  if (typeof token !== 'string' || !token) throw new AppError('The sign-in has expired. Enter your password again.', 401, 'CHALLENGE_EXPIRED');
  try {
    return verifyChallenge(token, purpose).userId;
  } catch {
    throw new AppError('The sign-in has expired. Enter your password again.', 401, 'CHALLENGE_EXPIRED');
  }
};

/** The second step of a staff sign-in: the code from the app, or a backup code. Answers as a sign-in does. */
export const verifyTwoFactor = async (req: Request, res: Response) => {
  const userId = challengeUser(req.body?.challengeToken, 'mfa');
  const check = await twoFactor.verifySecondStep(userId, String(req.body?.code ?? ''), req.ip);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const result = await authService.finishStaffOrEmailLogin(user);
  res.status(200).json({ success: true, message: 'Login successful', data: { ...result, backupCodesLeft: check.backupCodesLeft, usedBackupCode: check.method === 'backup' } });
};

/** Whose set-up this is: the challenge token of a staff sign-in that must set it up, or a signed-in staff member. */
const setupUser = (req: Request): { userId: string; viaChallenge: boolean } => {
  if (req.body?.challengeToken) return { userId: challengeUser(req.body.challengeToken, 'mfa-setup'), viaChallenge: true };
  if (req.user?.userType === 'admin') return { userId: req.user.userId, viaChallenge: false };
  if (req.user) throw new AppError('Two-step sign-in is for staff accounts', 403, 'NOT_STAFF');
  throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
};

/** Start setting the authenticator app up: the secret and the link the app opens. */
export const beginTwoFactorSetup = async (req: Request, res: Response) => {
  const { userId } = setupUser(req);
  res.status(200).json({ success: true, data: await twoFactor.beginSetup(userId) });
};

/** Confirm the set-up with a first code: the backup codes (shown once) and, when it was the sign-in's step, the session. */
export const confirmTwoFactorSetup = async (req: Request, res: Response) => {
  const { userId, viaChallenge } = setupUser(req);
  const { backupCodes } = await twoFactor.confirmSetup(userId, String(req.body?.code ?? ''), req.ip);
  if (!viaChallenge) {
    res.status(200).json({ success: true, message: 'Two-step sign-in is on', data: { backupCodes } });
    return;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const result = await authService.finishStaffOrEmailLogin(user);
  res.status(200).json({ success: true, message: 'Two-step sign-in is on', data: { ...result, backupCodes } });
};

export const getTwoFactorStatus = async (req: Request, res: Response) => {
  if (req.user?.userType !== 'admin') throw new AppError('Two-step sign-in is for staff accounts', 403, 'NOT_STAFF');
  res.status(200).json({ success: true, data: await twoFactor.twoFactorStatus(req.user.userId) });
};

export const renewBackupCodes = async (req: Request, res: Response) => {
  if (req.user?.userType !== 'admin') throw new AppError('Two-step sign-in is for staff accounts', 403, 'NOT_STAFF');
  res.status(200).json({ success: true, data: await twoFactor.regenerateBackupCodes(req.user.userId, String(req.body?.code ?? ''), req.ip) });
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

/** Sign in with Apple, from the iOS app: Apple's identity token, and the name Apple gave the app at a first sign-in. */
export const loginWithApple = async (req: Request, res: Response) => {
  const { identityToken, fullName } = req.body;
  const result = await signInWithApple(identityToken, fullName);
  res.status(200).json({ success: true, message: 'Login successful', data: result });
};

export const changePassword = async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  }
  const { currentPassword, newPassword } = req.body;
  const result = await authService.changePassword(req.user.userId, currentPassword, newPassword, { ip: req.ip });
  res.status(200).json({ success: true, message: 'Password changed. Your other devices were signed out.', data: result });
};

/**
 * Sign out of this device: its session ends (its access and refresh tokens stop working) and, when the app says which
 * push subscription is this device's, that one is forgotten. The account's other devices stay signed in. A token from
 * before sessions were recorded carries no session id, so it signs out everywhere, as logout used to.
 */
export const logout = async (req: Request, res: Response) => {
  if (req.user) {
    const { userId, sid } = req.user;
    const pushEndpoint = typeof req.body?.pushEndpoint === 'string' ? req.body.pushEndpoint : null;
    if (sid) {
      await endSession(userId, sid);
      socketManager.disconnectSession(sid);
      if (pushEndpoint) {
        await removeSubscription(userId, pushEndpoint).catch((err) => logger.warn({ err: (err as Error)?.message, userId }, 'Could not forget the push subscription at logout'));
      }
    } else {
      await endEverywhere(userId);
    }
    if (req.user.userType === 'admin') {
      void recordAudit({ userId, action: 'auth:LOGOUT', entityType: 'user', entityId: userId, ipAddress: req.ip, responseStatus: 200 });
    }
  }

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};

/** Every device: sessions, live connections and push notifications. */
async function endEverywhere(userId: string) {
  await authService.revokeSessions(userId);
  socketManager.disconnectUser(userId);
  await removeAllSubscriptions(userId).catch((err) => logger.warn({ err: (err as Error)?.message, userId }, 'Could not forget the push subscriptions at logout'));
}

/** Sign out of every device, this one included. */
export const logoutAll = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  await endEverywhere(req.user.userId);
  void recordAudit({ userId: req.user.userId, action: 'auth:LOGOUT_ALL', entityType: 'user', entityId: req.user.userId, ipAddress: req.ip, responseStatus: 200 });
  res.status(200).json({ success: true, message: 'Signed out on every device' });
};

/** The devices this account is signed in on. */
export const getSessions = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const sessions = await listSessions(req.user.userId, req.user.sid);
  res.status(200).json({ success: true, data: { sessions } });
};

/** Sign one device out. */
export const deleteSession = async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
  const sessionId = String(req.params.id);
  if (!(await endSession(req.user.userId, sessionId))) {
    throw new AppError('No such signed-in device', 404, 'SESSION_NOT_FOUND');
  }
  socketManager.disconnectSession(sessionId);
  void recordAudit({ userId: req.user.userId, action: 'auth:SESSION_ENDED', entityType: 'session', entityId: sessionId, ipAddress: req.ip, responseStatus: 200 });
  res.status(200).json({ success: true, message: 'That device was signed out' });
};

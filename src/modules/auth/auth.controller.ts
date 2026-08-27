import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import * as authService from './auth.service';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../shared/errors/AppError';
import type { User } from '@prisma/client';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
};

const ACCESS_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

const REFRESH_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/api/v1/auth/refresh',
};

// POST /api/v1/auth/register
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, tokens } = await authService.registerUser(req.body);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    res.status(201).json({
      status: 'success',
      message: 'Account created. Check your email for a verification code.',
      data: { user, accessToken: tokens.accessToken, emailVerified: false },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/login
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, tokens, emailVerified } = await authService.loginUser(req.body);

    if (!emailVerified) {
      // Return 200 with emailVerified: false — frontend shows OTP stage
      res.status(200).json({
        status: 'unverified',
        message: 'Account not verified. A new OTP has been sent to your email.',
        data: { user, emailVerified: false },
      });
      return;
    }

    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    res.status(200).json({
      status: 'success',
      message: 'Logged in successfully',
      data: { user, accessToken: tokens.accessToken, emailVerified: true },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/send-otp
export async function sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.sendOtp(req.body);
    res.status(200).json({
      status: 'success',
      message: 'Verification code sent to your email.',
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/verify-otp
export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { user, tokens } = await authService.verifyOtp(req.body);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully. Welcome to REBELIVE!',
      data: { user, accessToken: tokens.accessToken, emailVerified: true },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/refresh
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.refreshToken ?? req.body?.refreshToken;
    if (!token) throw new UnauthorizedError('Refresh token missing');

    const tokens = await authService.refreshTokens(token);
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
    res.status(200).json({
      status: 'success',
      data: { accessToken: tokens.accessToken },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/logout
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken ?? req.body?.refreshToken;
    if (req.user && refreshToken) {
      await authService.logoutUser(req.user.id, refreshToken);
    }
    clearTokenCookies(res);
    res.status(200).json({ status: 'success', message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/logout-all
export async function logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError();
    await authService.logoutAllDevices(req.user.id);
    clearTokenCookies(res);
    res.status(200).json({ status: 'success', message: 'Logged out from all devices' });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/auth/me
export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { prisma } = await import('../../config/database');
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        preferences: {
          include: { personalityType: true },
        },
      },
    });
    if (!user) {
      res.status(404).json({ status: 'error', message: 'User not found' });
      return;
    }
    const { passwordHash, refreshTokens, googleId, otpCode, otpExpiry, ...safeUser } = user;
    res.status(200).json({ status: 'success', data: { user: safeUser } });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/auth/google  → redirects to Google
export function googleAuth(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate('google', { session: false, scope: ['profile', 'email'] })(req, res, next);
}

// GET /api/v1/auth/google/callback
export function googleCallback(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate(
    'google',
    { session: false, failureRedirect: `${env.CLIENT_URL}/auth/error` },
    async (err: Error | null, user: User | false) => {
      if (err || !user) return next(err ?? new UnauthorizedError('Google auth failed'));

      try {
        const tokens = await authService.generateTokensForOAuthUser(user as User);
        setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
        // Redirect to frontend with access token as query param (frontend stores it)
        res.redirect(`${env.CLIENT_URL}/auth/callback?token=${tokens.accessToken}`);
      } catch (e) {
        next(e);
      }
    },
  )(req, res, next);
}

// ─── Helpers ───────────────────────────────────────────

function setTokenCookies(res: Response, access: string, refresh: string): void {
  if (access) res.cookie('accessToken', access, ACCESS_COOKIE_OPTIONS);
  if (refresh) res.cookie('refreshToken', refresh, REFRESH_COOKIE_OPTIONS);
}

function clearTokenCookies(res: Response): void {
  res.clearCookie('accessToken', COOKIE_OPTIONS);
  res.clearCookie('refreshToken', { ...COOKIE_OPTIONS, path: '/api/v1/auth/refresh' });
}

import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { hashPassword, verifyPassword } from '../../shared/utils/password';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { sendMail } from '../../lib/mailer';
import { otpEmailHtml, greetingEmailHtml } from '../../lib/emailTemplates';
import type { RegisterInput, LoginInput, SendOtpInput, VerifyOtpInput } from './auth.validator';
import type { User } from '@prisma/client';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  jti: string;
  iat?: number;
  exp?: number;
}

// ─── Token Helpers ─────────────────────────────────────

export function generateAccessToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    jti: uuidv4(),
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function generateRefreshToken(user: Pick<User, 'id' | 'email' | 'role'>): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    jti: uuidv4(),
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyRefreshToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
}

// ─── Auth Service ──────────────────────────────────────

export async function registerUser(
  input: RegisterInput,
): Promise<{ user: Partial<User>; tokens: TokenPair }> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('Email already registered');

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      authProvider: 'local',
      role: 'CUSTOMER',
      refreshTokens: [],
      emailVerified: false,
    },
  });

  logger.info(`[Auth] User registered: ${user.email}`);

  // Welcome email is deferred — sent only after email is verified (see verifyOtp)

  // Send OTP immediately after registration
  await sendOtp({ email: user.email });

  const tokens = await generateAndStoreTokens(user);
  return { user: sanitizeUser(user), tokens };
}

export async function loginUser(
  input: LoginInput,
): Promise<{ user: Partial<User>; tokens: TokenPair; emailVerified: boolean }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.passwordHash) throw new UnauthorizedError('Invalid email or password');

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid email or password');

  // If email not verified, send a fresh OTP and respond with flag
  if (!user.emailVerified) {
    await sendOtp({ email: user.email });
    return { user: sanitizeUser(user), tokens: { accessToken: '', refreshToken: '' }, emailVerified: false };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  logger.info(`[Auth] User logged in: ${user.email}`);

  const tokens = await generateAndStoreTokens(user);
  return { user: sanitizeUser(user), tokens, emailVerified: true };
}

export async function refreshTokens(token: string): Promise<TokenPair> {
  const payload = verifyRefreshToken(token);

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw new UnauthorizedError('User not found');

  // Validate the refresh token is still stored
  if (!user.refreshTokens.includes(token)) {
    throw new UnauthorizedError('Refresh token reuse detected');
  }

  // Rotate: remove old, add new
  const newRefreshToken = generateRefreshToken(user);
  const newAccessToken = generateAccessToken(user);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshTokens: [
        ...user.refreshTokens.filter((t) => t !== token),
        newRefreshToken,
      ],
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logoutUser(userId: string, refreshToken: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      refreshTokens: {
        set: (
          await prisma.user
            .findUnique({ where: { id: userId }, select: { refreshTokens: true } })
            .then((u) => u?.refreshTokens ?? [])
        ).filter((t) => t !== refreshToken),
      },
    },
  });
}

export async function logoutAllDevices(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokens: [] },
  });
}

export async function generateTokensForOAuthUser(user: User): Promise<TokenPair> {
  return generateAndStoreTokens(user);
}

// ─── OTP Service ───────────────────────────────────────

/** Generate a 6-digit OTP, hash and store it, then send via email. */
export async function sendOtp(input: SendOtpInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new NotFoundError('No account found with this email');

  if (user.emailVerified) throw new BadRequestError('Email is already verified');

  // Generate numeric OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Hash OTP before storing (SHA-256 — lightweight, no salt needed for short-lived codes)
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: { otpCode: otpHash, otpExpiry },
  });

  await sendMail({
    to: user.email,
    subject: `${otp} is your REBELIVE verification code`,
    html: otpEmailHtml({ firstName: user.firstName, otp }),
  });

  logger.info(`[Auth] OTP sent to: ${user.email}`);
}

/** Verify the submitted OTP and mark email as verified. */
export async function verifyOtp(
  input: VerifyOtpInput,
): Promise<{ user: Partial<User>; tokens: TokenPair }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw new NotFoundError('No account found with this email');

  if (user.emailVerified) throw new BadRequestError('Email is already verified');

  if (!user.otpCode || !user.otpExpiry) {
    throw new BadRequestError('No OTP was requested. Please request a new one.');
  }

  if (new Date() > user.otpExpiry) {
    throw new BadRequestError('OTP has expired. Please request a new one.');
  }

  const submitted = crypto.createHash('sha256').update(input.otp).digest('hex');
  if (submitted !== user.otpCode) {
    throw new UnauthorizedError('Invalid OTP. Please check and try again.');
  }

  // Mark verified and clear OTP fields
  const verified = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      otpCode: null,
      otpExpiry: null,
      lastLoginAt: new Date(),
    },
  });

  logger.info(`[Auth] Email verified: ${user.email}`);

  // Now that email is confirmed, send the welcome mail (non-blocking)
  sendMail({
    to: verified.email,
    subject: 'Welcome to REBELIVE — Your Rebel ID is live 🔥',
    html: greetingEmailHtml({ firstName: verified.firstName }),
  });

  const tokens = await generateAndStoreTokens(verified);
  return { user: sanitizeUser(verified), tokens };
}

// ─── Helpers ───────────────────────────────────────────

async function generateAndStoreTokens(user: User): Promise<TokenPair> {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Keep max 5 active refresh tokens (device sessions)
  const existing = user.refreshTokens ?? [];
  const tokens = [...existing.slice(-4), refreshToken];

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshTokens: tokens },
  });

  return { accessToken, refreshToken };
}

export function sanitizeUser(user: User): Partial<User> {
  const { passwordHash, refreshTokens, googleId, otpCode, otpExpiry, ...safe } = user;
  return safe;
}

import { Router } from 'express';
import * as authController from './auth.controller';
import { authenticate } from './auth.middleware';
import { validate } from '../../shared/middleware/validate';
import { authLimiter } from '../../shared/middleware/rateLimiter';
import {
  registerSchema,
  loginSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from './auth.validator';

const router = Router();

// ─── Public Auth Routes ────────────────────────────────

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user (sends OTP + greeting email)
 * @access  Public
 */
router.post('/register', authLimiter, validate(registerSchema), authController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login with email/password (returns emailVerified flag)
 * @access  Public
 */
router.post('/login', authLimiter, validate(loginSchema), authController.login);

/**
 * @route   POST /api/v1/auth/send-otp
 * @desc    Send/resend OTP to the user's email
 * @access  Public
 */
router.post('/send-otp', authLimiter, validate(sendOtpSchema), authController.sendOtp);

/**
 * @route   POST /api/v1/auth/verify-otp
 * @desc    Verify OTP and mark email as verified, return tokens
 * @access  Public
 */
router.post('/verify-otp', authLimiter, validate(verifyOtpSchema), authController.verifyOtp);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token using refresh token (cookie or body)
 * @access  Public
 */
router.post('/refresh', authController.refresh);

// ─── Google OAuth Routes ───────────────────────────────

/**
 * @route   GET /api/v1/auth/google
 * @desc    Initiate Google OAuth flow
 * @access  Public
 */
router.get('/google', authController.googleAuth);

/**
 * @route   GET /api/v1/auth/google/callback
 * @desc    Google OAuth callback — redirects to frontend with token
 * @access  Public
 */
router.get('/google/callback', authController.googleCallback);

// ─── Protected Auth Routes ─────────────────────────────

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current authenticated user
 * @access  Private
 */
router.get('/me', authenticate, authController.me);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout (invalidate refresh token)
 * @access  Private
 */
router.post('/logout', authenticate, authController.logout);

/**
 * @route   POST /api/v1/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post('/logout-all', authenticate, authController.logoutAll);

export default router;

import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AuthUser } from '../../shared/types';
import { UnauthorizedError, ForbiddenError } from '../../shared/errors/AppError';
import { UserRole } from '@prisma/client';

// ─── JWT Authentication Guard ──────────────────────────

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate(
    'jwt',
    { session: false },
    (err: Error | null, user: AuthUser | false) => {
      if (err) return next(err);
      if (!user) return next(new UnauthorizedError('Authentication required'));
      req.user = user;
      next();
    },
  )(req, res, next);
}

// ─── Optional Auth (for public routes that benefit from user context) ───

export function optionalAuthenticate(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate(
    'jwt',
    { session: false },
    (_err: Error | null, user: AuthUser | false) => {
      if (user) req.user = user;
      next();
    },
  )(req, res, next);
}

// ─── Role-based Authorization Guard ───────────────────

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    if (!roles.includes(req.user.role as UserRole)) {
      return next(new ForbiddenError('You do not have permission to access this resource'));
    }
    next();
  };
}

// ─── Admin Guard (shorthand) ───────────────────────────

export const requireAdmin = requireRole('ADMIN', 'SUPERADMIN');
export const requireSuperAdmin = requireRole('SUPERADMIN');

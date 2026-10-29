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

// ─── Staff & Role Guards ──────────────────────────────
export const requireStaff = requireRole('TEAM', 'ADMIN', 'SUPERADMIN');
export const requireAdmin = requireRole('ADMIN', 'SUPERADMIN');
export const requireSuperAdmin = requireRole('SUPERADMIN');

/**
 * Module-level access guard:
 * - SUPERADMIN: full access to every module
 * - ADMIN: full access to operational modules
 * - TEAM: only access to modules assigned in user.assignedModules
 */
export function requireModule(moduleName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    const role = req.user.role as UserRole;
    if (role === 'SUPERADMIN' || role === 'ADMIN') {
      return next();
    }
    if (role === 'TEAM') {
      const assigned = req.user.assignedModules || [];
      if (assigned.includes(moduleName)) {
        return next();
      }
      return next(
        new ForbiddenError(
          `Access restricted: You do not have access to the "${moduleName}" module. Contact Super Admin for permissions.`
        )
      );
    }
    return next(new ForbiddenError('You do not have permission to access this resource'));
  };
}

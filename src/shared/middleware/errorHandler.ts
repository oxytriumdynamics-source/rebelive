import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';
import { env } from '../../config/env';
import { ZodError } from 'zod';

interface PrismaError {
  code?: string;
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Zod validation error (Zod v4: uses .issues)
  if (err instanceof ZodError) {
    res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: err.issues.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Known operational error
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
    return;
  }

  // Prisma known errors
  const prismaErr = err as PrismaError;
  if (prismaErr.code === 'P2002') {
    res.status(409).json({
      status: 'error',
      message: 'A record with this value already exists',
    });
    return;
  }

  if (prismaErr.code === 'P2025') {
    res.status(404).json({
      status: 'error',
      message: 'Record not found',
    });
    return;
  }

  // Unexpected error
  logger.error(`[Unhandled Error] ${req.method} ${req.path}`, {
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    status: 'error',
    message:
      env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

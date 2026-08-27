import { UserRole } from '@prisma/client';

// Extend Express Request to include authenticated user
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  emailVerified: boolean;
}

// Augment Express namespace
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function getPagination(query: Record<string, unknown>): {
  skip: number;
  take: number;
  page: number;
  limit: number;
} {
  const page = Math.max(1, parseInt((query.page as string) ?? '1'));
  const limit = Math.min(100, Math.max(1, parseInt((query.limit as string) ?? '20')));
  return { skip: (page - 1) * limit, take: limit, page, limit };
}

export function buildPaginationResult<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginationResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

// Helper to get string param safely
export function getParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

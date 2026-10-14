import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { getPagination, buildPaginationResult } from '../../shared/types';
import { hashPassword, verifyPassword } from '../../shared/utils/password';
import { formatRebelId } from '../../shared/utils/rebelId';

const userId = (req: Request): string => req.user!.id;
const paramId = (req: Request, key = 'id'): string => req.params[key] as string;

// GET /api/v1/users/profile
export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId(req) },
      include: {
        preferences: {
          include: { personalityType: true },
        },
      },
    });
    if (!user) throw new NotFoundError('User');
    const { passwordHash, refreshTokens, googleId, otpCode, otpExpiry, ...safe } = user as any;
    res.json({ status: 'success', data: { ...safe, rebelId: formatRebelId(user.id) } });
  } catch (err) { next(err); }
}

// PATCH /api/v1/users/profile
export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { firstName, lastName, phone, avatarUrl } = req.body as Record<string, string>;
    const updateData: Record<string, string> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    const user = await prisma.user.update({
      where: { id: userId(req) },
      data: updateData,
      include: {
        preferences: {
          include: { personalityType: true },
        },
      },
    });
    const { passwordHash, refreshTokens, googleId, otpCode, otpExpiry, ...safe } = user as any;
    res.json({ status: 'success', data: { ...safe, rebelId: formatRebelId(user.id) } });
  } catch (err) { next(err); }
}

// PATCH /api/v1/users/change-password
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword, password } = req.body as {
      currentPassword?: string;
      newPassword?: string;
      password?: string;
    };
    const targetPassword = newPassword || password;

    if (!targetPassword || typeof targetPassword !== 'string' || targetPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters long');
    }

    const user = await prisma.user.findUnique({ where: { id: userId(req) } });
    if (!user) throw new NotFoundError('User');

    // If local password exists, verify current password
    if (user.passwordHash) {
      if (!currentPassword) {
        throw new ValidationError('Current password is required');
      }
      const isMatch = await verifyPassword(currentPassword, user.passwordHash);
      if (!isMatch) {
        throw new ValidationError('Current password does not match');
      }
    }

    const passwordHash = await hashPassword(targetPassword);

    // Invalidate existing sessions on password change to revoke stolen tokens
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        refreshTokens: [],
      },
    });

    res.json({ status: 'success', message: 'Password updated successfully. Other active sessions revoked.' });
  } catch (err) { next(err); }
}

// GET /api/v1/users/addresses
export async function getAddresses(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: userId(req) },
      orderBy: { isDefault: 'desc' },
    });
    res.json({ status: 'success', data: addresses });
  } catch (err) { next(err); }
}

// POST /api/v1/users/addresses
export async function createAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { label, line1, line2, city, state, postalCode, country, isDefault } = req.body as Record<string, string | boolean>;
    if (isDefault) {
      await prisma.address.updateMany({ where: { userId: userId(req) }, data: { isDefault: false } });
    }
    const address = await prisma.address.create({
      data: {
        userId: userId(req),
        label: (label as string) || undefined,
        line1: line1 as string,
        line2: (line2 as string) || undefined,
        city: city as string,
        state: state as string,
        postalCode: postalCode as string,
        country: (country as string) ?? 'IN',
        isDefault: (isDefault as boolean) ?? false,
      },
    });
    res.status(201).json({ status: 'success', data: address });
  } catch (err) { next(err); }
}

// PATCH /api/v1/users/addresses/:id
export async function updateAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramId(req);
    const existing = await prisma.address.findFirst({
      where: { id, userId: userId(req) },
    });
    if (!existing) throw new NotFoundError('Address');

    if (req.body.isDefault) {
      await prisma.address.updateMany({ where: { userId: userId(req) }, data: { isDefault: false } });
    }
    const { id: _ignoreId, userId: _ignoreUserId, ...safeUpdate } = req.body as Record<string, unknown>;
    const address = await prisma.address.update({
      where: { id },
      data: safeUpdate,
    });
    res.json({ status: 'success', data: address });
  } catch (err) { next(err); }
}

// DELETE /api/v1/users/addresses/:id
export async function deleteAddress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramId(req);
    const existing = await prisma.address.findFirst({
      where: { id, userId: userId(req) },
    });
    if (!existing) throw new NotFoundError('Address');

    await prisma.address.delete({ where: { id } });
    res.json({ status: 'success', message: 'Address deleted' });
  } catch (err) { next(err); }
}

// GET /api/v1/users/notifications
export async function getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.notification.findMany({ where: { userId: userId(req) }, orderBy: { sentAt: 'desc' }, skip, take }),
      prisma.notification.count({ where: { userId: userId(req) } }),
    ]);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// PATCH /api/v1/users/notifications/:id/read
export async function markNotificationRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = paramId(req);
    const existing = await prisma.notification.findFirst({
      where: { id, userId: userId(req) },
    });
    if (!existing) throw new NotFoundError('Notification');

    await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    res.json({ status: 'success', message: 'Notification marked as read' });
  } catch (err) { next(err); }
}

// GET /api/v1/users/wishlist
export async function getWishlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const wishlist = await prisma.wishlist.findUnique({
      where: { userId: userId(req) },
      include: { items: { include: { product: { include: { images: { where: { isPrimary: true } } } }, variant: true } } },
    });
    res.json({ status: 'success', data: wishlist?.items ?? [] });
  } catch (err) { next(err); }
}

// POST /api/v1/users/wishlist
export async function addToWishlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { productId, variantId } = req.body as { productId: string; variantId: string };
    let wishlist = await prisma.wishlist.findUnique({ where: { userId: userId(req) } });
    if (!wishlist) {
      wishlist = await prisma.wishlist.create({ data: { userId: userId(req) } });
    }
    const item = await prisma.wishlistItem.upsert({
      where: { wishlistId_variantId: { wishlistId: wishlist.id, variantId } },
      create: { wishlistId: wishlist.id, productId, variantId },
      update: {},
    });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
}

// DELETE /api/v1/users/wishlist/:itemId
export async function removeFromWishlist(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const itemId = paramId(req, 'itemId');
    const item = await prisma.wishlistItem.findUnique({
      where: { id: itemId },
      include: { wishlist: true },
    });
    if (!item || item.wishlist.userId !== userId(req)) {
      throw new NotFoundError('Wishlist item');
    }
    await prisma.wishlistItem.delete({ where: { id: itemId } });
    res.json({ status: 'success', message: 'Item removed from wishlist' });
  } catch (err) { next(err); }
}

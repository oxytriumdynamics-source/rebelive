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

// ─── Phone Normalization & Order Merging Helper ───────────
export function normalizePhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits.slice(-10);
}

/**
 * Links past orders created via Fastrr / guest checkout to the given user based on phone number.
 */
export async function mergePastGuestOrdersByPhone(targetUserId: string, cleanPhone: string): Promise<number> {
  if (!cleanPhone || cleanPhone.length < 10) return 0;

  try {
    // 1. Find all other users with matching phone (e.g. Fastrr-created guest users)
    const otherUsers = await prisma.user.findMany({
      where: {
        id: { not: targetUserId },
        phone: { contains: cleanPhone },
      },
      select: { id: true },
    });
    const otherUserIds = otherUsers.map((u) => u.id);

    // 2. Find orders to reassign (either owned by those guest users or containing phone in notes)
    const candidateOrders = await prisma.order.findMany({
      where: {
        userId: { not: targetUserId },
        OR: [
          ...(otherUserIds.length > 0 ? [{ userId: { in: otherUserIds } }] : []),
          { notes: { contains: cleanPhone } },
        ],
      },
      select: { id: true, shippingAddressId: true },
    });

    if (candidateOrders.length === 0) return 0;

    const orderIds = candidateOrders.map((o) => o.id);
    const addressIds = candidateOrders.map((o) => o.shippingAddressId).filter(Boolean);

    // Reassign orders to the target user
    const res = await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { userId: targetUserId },
    });

    // Also reassign delivery addresses so they appear in user's saved addresses
    if (addressIds.length > 0) {
      await prisma.address.updateMany({
        where: { id: { in: addressIds } },
        data: { userId: targetUserId },
      });
    }

    return res.count;
  } catch (err) {
    console.warn('Non-fatal error merging past guest orders by phone:', err);
    return 0;
  }
}

// POST /api/v1/users/link-phone
export async function linkPhone(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawPhone = (req.body?.phone || '').trim();
    const cleanPhone = normalizePhone(rawPhone);

    if (!cleanPhone || cleanPhone.length < 10) {
      throw new ValidationError('Please enter a valid 10-digit mobile number');
    }

    const currentUserId = userId(req);

    // Update phone on current user
    const updatedUser = await prisma.user.update({
      where: { id: currentUserId },
      data: { phone: cleanPhone },
      include: {
        preferences: {
          include: { personalityType: true },
        },
      },
    });

    // Reassign all previous guest orders placed with this phone number
    const mergedCount = await mergePastGuestOrdersByPhone(currentUserId, cleanPhone);

    const { passwordHash, refreshTokens, googleId, otpCode, otpExpiry, ...safe } = updatedUser as any;
    res.json({
      status: 'success',
      message: `Phone number linked successfully. ${mergedCount} past orders synced to your account.`,
      data: {
        ...safe,
        rebelId: formatRebelId(updatedUser.id),
        mergedOrdersCount: mergedCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/users/profile
export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { firstName, lastName, phone, avatarUrl } = req.body as Record<string, string>;
    const updateData: Record<string, string> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = normalizePhone(phone) || phone;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    const currentUserId = userId(req);
    const user = await prisma.user.update({
      where: { id: currentUserId },
      data: updateData,
      include: {
        preferences: {
          include: { personalityType: true },
        },
      },
    });

    // If phone was provided or updated, automatically link any matching past orders
    let mergedCount = 0;
    if (updateData.phone) {
      mergedCount = await mergePastGuestOrdersByPhone(currentUserId, updateData.phone);
    }

    const { passwordHash, refreshTokens, googleId, otpCode, otpExpiry, ...safe } = user as any;
    res.json({
      status: 'success',
      data: {
        ...safe,
        rebelId: formatRebelId(user.id),
        mergedOrdersCount: mergedCount,
      },
    });
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
    const { productId, variantId } = req.body as { productId: string | number; variantId: string | number };
    const pId = /^\d+$/.test(String(productId)) ? BigInt(productId) : null;
    const vId = /^\d+$/.test(String(variantId)) ? BigInt(variantId) : null;
    if (!pId || !vId) throw new ValidationError('Valid numeric productId and variantId are required');

    let wishlist = await prisma.wishlist.findUnique({ where: { userId: userId(req) } });
    if (!wishlist) {
      wishlist = await prisma.wishlist.create({ data: { userId: userId(req) } });
    }
    const item = await prisma.wishlistItem.upsert({
      where: { wishlistId_variantId: { wishlistId: wishlist.id, variantId: vId } },
      create: { wishlistId: wishlist.id, productId: pId, variantId: vId },
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

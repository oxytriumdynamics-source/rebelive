import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError';
import { getPagination, buildPaginationResult } from '../../shared/types';
import type { SubscriptionFrequency } from '@prisma/client';

const uid = (req: Request) => req.user!.id;

// GET /api/v1/subscriptions/plans
export async function getPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plans = await prisma.subscriptionPlan.findMany({ where: { isActive: true } });
    res.json({ status: 'success', data: plans });
  } catch (err) { next(err); }
}

// GET /api/v1/subscriptions
export async function getSubscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.subscription.findMany({
        where: { userId: uid(req) },
        orderBy: { createdAt: 'desc' },
        skip, take,
        include: { plan: true, variant: { include: { product: true } }, address: true },
      }),
      prisma.subscription.count({ where: { userId: uid(req) } }),
    ]);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// POST /api/v1/subscriptions
export async function createSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { planId, variantId, quantity, addressId } = req.body as {
      planId: string;
      variantId: string;
      quantity?: number;
      addressId: string;
    };

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new NotFoundError('Subscription plan');

    const nextDelivery = calculateNextDelivery(plan.frequency);

    const subscription = await prisma.subscription.create({
      data: {
        userId: uid(req),
        planId,
        variantId,
        quantity: quantity ?? 1,
        status: 'ACTIVE',
        nextDeliveryAt: nextDelivery,
        addressId,
      },
      include: { plan: true, variant: { include: { product: true } }, address: true },
    });

    res.status(201).json({ status: 'success', data: subscription });
  } catch (err) { next(err); }
}

// PATCH /api/v1/subscriptions/:id/pause
export async function pauseSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sub = await prisma.subscription.findFirst({ where: { id: req.params['id'] as string, userId: uid(req) } });
    if (!sub) throw new NotFoundError('Subscription');
    if (sub.status !== 'ACTIVE') throw new ValidationError('Only active subscriptions can be paused');

    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'PAUSED' } });
    res.json({ status: 'success', message: 'Subscription paused' });
  } catch (err) { next(err); }
}

// PATCH /api/v1/subscriptions/:id/resume
export async function resumeSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sub = await prisma.subscription.findFirst({ where: { id: req.params['id'] as string, userId: uid(req) } });
    if (!sub) throw new NotFoundError('Subscription');
    if (sub.status !== 'PAUSED') throw new ValidationError('Only paused subscriptions can be resumed');

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: sub.planId } });
    const nextDelivery = calculateNextDelivery(plan!.frequency);

    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE', nextDeliveryAt: nextDelivery } });
    res.json({ status: 'success', message: 'Subscription resumed' });
  } catch (err) { next(err); }
}

// DELETE /api/v1/subscriptions/:id
export async function cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sub = await prisma.subscription.findFirst({ where: { id: req.params['id'] as string, userId: uid(req) } });
    if (!sub) throw new NotFoundError('Subscription');
    if (sub.status === 'CANCELLED') throw new ValidationError('Subscription is already cancelled');

    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: (req.body as { reason?: string }).reason ?? null },
    });
    res.json({ status: 'success', message: 'Subscription cancelled' });
  } catch (err) { next(err); }
}

function calculateNextDelivery(frequency: SubscriptionFrequency): Date {
  const days: Record<SubscriptionFrequency, number> = {
    WEEKLY: 7,
    BIWEEKLY: 14,
    MONTHLY: 30,
    BIMONTHLY: 60,
  };
  return new Date(Date.now() + days[frequency] * 24 * 60 * 60 * 1000);
}

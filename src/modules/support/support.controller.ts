import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../shared/errors/AppError';
import { getPagination, buildPaginationResult } from '../../shared/types';

const uid = (req: Request) => req.user!.id;
const qStr = (req: Request, key: string): string | undefined => {
  const v = req.query[key];
  return Array.isArray(v) ? (v[0] as string) : (v as string | undefined);
};

// GET /api/v1/support/faqs
export async function getFAQs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await prisma.fAQCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { faqs: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
    });
    res.json({ status: 'success', data: categories });
  } catch (err) { next(err); }
}

// PATCH /api/v1/support/faqs/:id/view
export async function incrementFAQView(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.fAQ.update({ where: { id: req.params['id'] as string }, data: { viewCount: { increment: 1 } } });
    res.json({ status: 'success' });
  } catch (err) { next(err); }
}

// GET /api/v1/support/tickets
export async function getTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { skip, take, page, limit } = getPagination(req.query as Record<string, unknown>);
    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where: { userId: uid(req) },
        orderBy: { createdAt: 'desc' },
        skip, take,
        include: { messages: { take: 1, orderBy: { createdAt: 'desc' } } },
      }),
      prisma.ticket.count({ where: { userId: uid(req) } }),
    ]);
    res.json({ status: 'success', ...buildPaginationResult(data, total, page, limit) });
  } catch (err) { next(err); }
}

// GET /api/v1/support/tickets/:id
export async function getTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params['id'] as string, userId: uid(req) },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundError('Ticket');
    res.json({ status: 'success', data: ticket });
  } catch (err) { next(err); }
}

// POST /api/v1/support/tickets
export async function createTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { subject, category, message, orderId, priority } = req.body as Record<string, string>;
    const ticket = await prisma.ticket.create({
      data: {
        userId: uid(req),
        subject,
        category,
        priority: (priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') ?? 'MEDIUM',
        orderId: orderId ?? null,
        messages: { create: { sender: 'CUSTOMER', message } },
      },
      include: { messages: true },
    });
    res.status(201).json({ status: 'success', data: ticket });
  } catch (err) { next(err); }
}

// POST /api/v1/support/tickets/:id/messages
export async function replyToTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params['id'] as string, userId: uid(req) },
    });
    if (!ticket) throw new NotFoundError('Ticket');
    if (['RESOLVED', 'CLOSED'].includes(ticket.status)) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: 'OPEN', updatedAt: new Date() } });
    }
    const msg = await prisma.ticketMessage.create({
      data: { ticketId: ticket.id, sender: 'CUSTOMER', message: (req.body as { message: string }).message },
    });
    res.status(201).json({ status: 'success', data: msg });
  } catch (err) { next(err); }
}

// POST /api/v1/support/contact-query (Public)
export async function submitContactQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { firstName, lastName, email, phone, services, message } = req.body;
    if (!firstName || !email || !message) {
      res.status(400).json({ status: 'error', message: 'Name, email, and message are required.' });
      return;
    }
    const query = await prisma.contactQuery.create({
      data: {
        firstName: String(firstName).trim(),
        lastName: String(lastName || '').trim(),
        email: String(email).trim().toLowerCase(),
        phone: String(phone || '').trim(),
        services: Array.isArray(services) ? services : services ? [String(services)] : [],
        message: String(message).trim(),
        status: 'NEW',
      },
    });
    res.status(201).json({ status: 'success', data: query });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/support/corporate-query (Public)
export async function submitCorporateQuery(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      refId,
      fullName,
      companyName,
      designation,
      email,
      phone,
      city,
      approxQuantity,
      natureOfRequirement,
      message,
    } = req.body;

    if (!fullName || !companyName || !email) {
      res.status(400).json({ status: 'error', message: 'Full name, company name, and email are required.' });
      return;
    }

    const query = await prisma.corporateQuery.create({
      data: {
        refId: refId ? String(refId).trim() : `CORP-${Math.floor(100000 + Math.random() * 900000)}`,
        fullName: String(fullName).trim(),
        companyName: String(companyName).trim(),
        designation: designation ? String(designation).trim() : null,
        email: String(email).trim().toLowerCase(),
        phone: String(phone || '').trim(),
        city: city ? String(city).trim() : null,
        approxQuantity: approxQuantity ? String(approxQuantity).trim() : null,
        natureOfRequirement: natureOfRequirement ? String(natureOfRequirement).trim() : null,
        message: message ? String(message).trim() : null,
        status: 'NEW',
      },
    });
    res.status(201).json({ status: 'success', data: query });
  } catch (err) {
    next(err);
  }
}


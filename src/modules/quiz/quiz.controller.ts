import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';

const uid = (req: Request) => req.user?.id ?? null;

// GET /api/v1/quiz/questions
export async function getQuestions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const questions = await prisma.quizQuestion.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { answers: { orderBy: { weight: 'desc' } } },
    });
    res.json({ status: 'success', data: questions });
  } catch (err) { next(err); }
}

// POST /api/v1/quiz/submit
export async function submitQuiz(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { answers, sessionId } = req.body as { answers: Record<string, string>; sessionId: string };

    const answerIds = Object.values(answers);
    const quizAnswers = await prisma.quizAnswer.findMany({
      where: { id: { in: answerIds } },
    });

    const scores: Record<string, number> = {};
    for (const qa of quizAnswers) {
      scores[qa.personalityTypeId] = (scores[qa.personalityTypeId] ?? 0) + qa.weight;
    }

    const winnerTypeId = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!winnerTypeId) {
      res.status(400).json({ status: 'error', message: 'Could not determine personality type' });
      return;
    }

    const result = await prisma.quizResult.upsert({
      where: { sessionId },
      create: { sessionId, userId: uid(req), personalityTypeId: winnerTypeId, answers },
      update: { userId: uid(req), personalityTypeId: winnerTypeId, answers },
      include: { personalityType: true },
    });

    const currentUid = uid(req);
    if (currentUid) {
      await prisma.userPreference.upsert({
        where: { userId: currentUid },
        create: { userId: currentUid, personalityTypeId: winnerTypeId },
        update: { personalityTypeId: winnerTypeId },
      });
    }

    const products = await prisma.product.findMany({
      where: { personalityTypeId: winnerTypeId, isActive: true },
      include: { images: { where: { isPrimary: true }, take: 1 }, variants: { where: { isDefault: true }, take: 1 } },
      take: 6,
    });

    res.json({ status: 'success', data: { result, recommendedProducts: products } });
  } catch (err) { next(err); }
}

// GET /api/v1/quiz/result/:sessionId
export async function getResult(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await prisma.quizResult.findUnique({
      where: { sessionId: req.params['sessionId'] as string },
      include: { personalityType: true },
    });
    if (!result) {
      res.status(404).json({ status: 'error', message: 'Quiz result not found' });
      return;
    }
    res.json({ status: 'success', data: result });
  } catch (err) { next(err); }
}

// GET /api/v1/quiz/personality-types
export async function getPersonalityTypes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const types = await prisma.personalityType.findMany();
    res.json({ status: 'success', data: types });
  } catch (err) { next(err); }
}

// POST /api/v1/quiz/claim-persona  (protected — requires auth)
export async function claimPersona(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ status: 'error', message: 'Authentication required' });
      return;
    }

    const { personaSlug } = req.body as { personaSlug: string };
    if (!personaSlug) {
      res.status(400).json({ status: 'error', message: 'personaSlug is required' });
      return;
    }

    // Look up by slug (e.g. "apex", "capella", "aviva") with name fallback
    let personalityType = await prisma.personalityType.findUnique({
      where: { slug: personaSlug.toLowerCase() },
    });

    // Fallback: try matching by name (case-insensitive)
    if (!personalityType) {
      const allTypes = await prisma.personalityType.findMany();
      personalityType = allTypes.find(
        (t) => t.name.toLowerCase() === personaSlug.toLowerCase(),
      ) ?? null;
    }

    if (!personalityType) {
      res.status(404).json({ status: 'error', message: `Personality type '${personaSlug}' not found` });
      return;
    }

    await prisma.userPreference.upsert({
      where: { userId },
      create: { userId, personalityTypeId: personalityType.id },
      update: { personalityTypeId: personalityType.id },
    });

    res.json({ status: 'success', data: { personalityType } });
  } catch (err) { next(err); }
}

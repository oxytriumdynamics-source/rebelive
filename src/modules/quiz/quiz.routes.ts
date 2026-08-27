import { Router } from 'express';
import * as quizController from './quiz.controller';
import { optionalAuthenticate, authenticate } from '../auth/auth.middleware';

const router = Router();

router.use(optionalAuthenticate); // optional — guests can take the quiz too

router.get('/questions', quizController.getQuestions);
router.post('/submit', quizController.submitQuiz);
router.get('/result/:sessionId', quizController.getResult);
router.get('/personality-types', quizController.getPersonalityTypes);

// Protected — must be logged in
router.post('/claim-persona', authenticate, quizController.claimPersona);

export default router;

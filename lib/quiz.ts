import { Persona, Question, QUESTION_BANK, QuestionOption } from "@/data/questions";

export type ShuffledQuestion = {
  id: number;
  title: string;
  prompt: string;
  options: QuestionOption[]; // pre-shuffled, positions carry no pattern
};

export type Answer = {
  questionId: number;
  persona: Persona;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick 5 random questions from the 30-question bank, and shuffle each
 * question's option order so the same letter never maps to the same
 * persona twice in a row — matches the "no detectable pattern" spec. */
export function pickSession(bank: Question[] = QUESTION_BANK): ShuffledQuestion[] {
  const chosen = shuffle(bank).slice(0, 5);
  return chosen.map((q) => ({
    id: q.id,
    title: q.title,
    prompt: q.prompt,
    options: shuffle(q.options),
  }));
}

export type ScoreResult = {
  winner: Persona;
  counts: Record<Persona, number>;
  tiebreak: boolean;
};

/** Weighted scoring with a recency tiebreaker: if two+ personas are tied for
 * the top count, the persona whose answer came latest in the session wins —
 * treated as the stronger, more current signal. */
export function scoreSession(answers: Answer[]): ScoreResult {
  const counts: Record<Persona, number> = { APEX: 0, CAPELLA: 0, AVIVA: 0 };
  const lastSeenIndex: Record<Persona, number> = { APEX: -1, CAPELLA: -1, AVIVA: -1 };

  answers.forEach((a, idx) => {
    counts[a.persona] += 1;
    lastSeenIndex[a.persona] = idx;
  });

  const max = Math.max(...Object.values(counts));
  const tied = (Object.keys(counts) as Persona[]).filter((p) => counts[p] === max);

  let winner: Persona = tied[0];
  if (tied.length > 1) {
    winner = tied.reduce((latest, p) =>
      lastSeenIndex[p] > lastSeenIndex[latest] ? p : latest
    , tied[0]);
  }

  return { winner, counts, tiebreak: tied.length > 1 };
}

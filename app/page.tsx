"use client";

import { useState, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import LandingStage from "@/components/LandingStage";
import QuizStage from "@/components/QuizStage";
import ResultStage from "@/components/ResultStage";
import ProfileStage from "@/components/ProfileStage";
import { pickSession, scoreSession, Answer, ShuffledQuestion, ScoreResult } from "@/lib/quiz";
import { Persona } from "@/data/questions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { getMe } from "@/store/slices/authslice";

type Stage = "landing" | "quiz" | "result" | "profile";

export default function Home() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, user, loading } = useAppSelector((s) => s.auth);

  const [stage, setStage] = useState<Stage>("landing");
  const [session, setSession] = useState<ShuffledQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [result, setResult] = useState<ScoreResult | null>(null);

  // Hydrate auth state on first load
  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = sessionStorage.getItem("accessToken");
      if (token && !isAuthenticated) {
        dispatch(getMe());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch to profile if user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      setStage("profile");
    }
  }, [isAuthenticated, user]);

  function startTest() {
    setSession(pickSession());
    setAnswers([]);
    setQIndex(0);
    setStage("quiz");
  }

  function handleAnswer(persona: Persona) {
    const next = [...answers, { questionId: session[qIndex].id, persona }];
    setAnswers(next);
    if (qIndex + 1 < session.length) {
      setQIndex(qIndex + 1);
    } else {
      setResult(scoreSession(next));
      setStage("result");
    }
  }

  function restart() {
    setResult(null);
    setStage("landing");
  }

  // While checking auth on first load, show nothing (prevents flash)
  if (loading && !isAuthenticated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#f0efeb]">
        <span
          className="font-mono text-[9px] uppercase tracking-[0.35em] text-[#0a0a0a]/30"
          style={{ fontFamily: "JetBrains Mono, Courier New, monospace" }}
        >
          Loading…
        </span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 h-[100dvh] w-[100dvw] overflow-hidden bg-ink overscroll-none">
      <AnimatePresence mode="wait">
        {stage === "profile" && isAuthenticated && user && (
          <ProfileStage
            key="profile"
            user={user}
            onStartQuiz={() => {
              // Allow logged-in user to retake the quiz (result will save directly)
              startTest();
            }}
          />
        )}

        {stage === "landing" && !isAuthenticated && (
          <LandingStage key="landing" onStart={startTest} />
        )}

        {stage === "quiz" && session.length > 0 && (
          <QuizStage
            key="quiz"
            question={session[qIndex]}
            index={qIndex}
            total={session.length}
            onAnswer={handleAnswer}
          />
        )}

        {stage === "result" && result && (
          <ResultStage key="result" result={result} onRestart={restart} />
        )}
      </AnimatePresence>
    </div>
  );
}

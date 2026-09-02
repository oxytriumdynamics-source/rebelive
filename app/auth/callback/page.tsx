"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { setAccessToken, getMe, claimPersona } from "@/store/slices/authslice";

/** Spinner UI shown while completing sign-in */
const LoadingSpinner = () => (
  <div
    style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      color: "rgba(255,255,255,0.5)",
      fontFamily: "JetBrains Mono, Courier New, monospace",
      fontSize: "11px",
      letterSpacing: "0.2em",
      textTransform: "uppercase",
    }}
  >
    <div
      style={{
        width: "32px",
        height: "32px",
        border: "2px solid rgba(216,172,82,0.2)",
        borderTopColor: "#d8ac52",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <span>Completing sign-in…</span>
  </div>
);

/**
 * Inner component that reads searchParams.
 * Must be wrapped in <Suspense> to avoid static prerender errors.
 */
function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get("token");

    if (!token) {
      router.replace("/auth?error=oauth_failed");
      return;
    }

    // Store token and load user profile
    dispatch(setAccessToken(token));
    dispatch(getMe()).then(async (action) => {
      if (getMe.fulfilled.match(action)) {
        // ── Auto-claim pending persona from quiz result page ──
        // sessionStorage persists across same-tab redirects (Google OAuth
        // redirects back to this tab), so the value set in ResultStage
        // is still here when we land on /auth/callback.
        if (typeof window !== "undefined") {
          const pending = sessionStorage.getItem("pendingPersona");
          if (pending) {
            sessionStorage.removeItem("pendingPersona");
            await dispatch(claimPersona(pending.toLowerCase()));
          }
        }
        router.replace("/");
      } else {
        router.replace("/auth?error=oauth_failed");
      }
    });
  }, [dispatch, router, searchParams]);

  return <LoadingSpinner />;
}

/**
 * /auth/callback — Handles Google OAuth redirect.
 * Backend redirects here with ?token=<accessToken> after successful OAuth.
 *
 * Suspense boundary is required because useSearchParams() cannot be used
 * during static prerendering (next build).
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <AuthCallbackInner />
    </Suspense>
  );
}


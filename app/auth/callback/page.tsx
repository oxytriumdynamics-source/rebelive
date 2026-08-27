"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch } from "@/store/hooks";
import { setAccessToken, getMe } from "@/store/slices/authslice";

/**
 * /auth/callback — Handles Google OAuth redirect.
 * Backend redirects here with ?token=<accessToken> after successful OAuth.
 */
export default function AuthCallbackPage() {
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
    dispatch(getMe()).then((action) => {
      if (getMe.fulfilled.match(action)) {
        router.replace("/");
      } else {
        router.replace("/auth?error=oauth_failed");
      }
    });
  }, [dispatch, router, searchParams]);

  return (
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
      {/* Spinner */}
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
}

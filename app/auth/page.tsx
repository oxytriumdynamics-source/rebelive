import type { Metadata } from "next";
import AuthPageShell from "@/components/AuthPageShell";

export const metadata: Metadata = {
  title: "Join REBELIVE — Create Your Rebel ID",
  description: "Sign up or sign in to REBELIVE. Lock in your Rebel ID and claim this year's reward.",
};

export default function AuthPage() {
  return <AuthPageShell />;
}

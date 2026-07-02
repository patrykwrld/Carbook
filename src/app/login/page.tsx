"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FadeUp } from "@/components/motion";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError(error.message);
    else {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center gap-6 px-4">
      <FadeUp>
        <h1 className="font-display text-2xl font-bold">
          {step === "email" ? "Sign in to Carbook" : "Check your inbox"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {step === "email"
            ? "We'll email you a one-time code. No passwords."
            : `We sent a 6-digit code to ${email}.`}
        </p>
      </FadeUp>
      <FadeUp delay={0.1}>
        {step === "email" ? (
          <form onSubmit={sendCode} className="flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-lg border border-edge bg-surface px-4 py-3 focus:border-amber focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !email}
              className="rounded-lg bg-amber px-4 py-3 font-display font-semibold text-background disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="flex flex-col gap-3">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              className="rounded-lg border border-edge bg-surface px-4 py-3 text-center font-mono text-xl tracking-[0.4em] focus:border-amber focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              className="rounded-lg bg-amber px-4 py-3 font-display font-semibold text-background disabled:opacity-40"
            >
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="text-sm text-muted hover:text-foreground"
            >
              Use a different email
            </button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </FadeUp>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

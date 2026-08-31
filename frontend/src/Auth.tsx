import { useState } from "react";
import { supabase } from "./supabaseClient";

type Mode = "login" | "signup";

interface Props {
  onGuestContinue: () => void;
}

export function Auth({ onGuestContinue }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email for a confirmation link, then log in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // App.tsx's onAuthStateChange listener picks up the new session automatically.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    // On success the browser navigates away to Google — nothing else to do here.
    if (error) setError(error.message);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-xl font-semibold tracking-tight">
          AI Macro Logger
        </h1>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
          <h2 className="text-base font-semibold">
            {mode === "login" ? "Log in" : "Sign up"}
          </h2>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
            <input
              type="email"
              placeholder="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
            <input
              type="password"
              placeholder="Password"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-800"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
            >
              {loading
                ? "Please wait..."
                : mode === "login"
                  ? "Log in"
                  : "Sign up"}
            </button>
          </form>

          {message && (
            <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {message}
            </p>
          )}
          {error && (
            <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="button"
            className="mt-3 text-sm text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setMessage(null);
            }}
          >
            {mode === "login"
              ? "Need an account? Sign up"
              : "Already have an account? Log in"}
          </button>

          <hr className="my-4 border-neutral-200 dark:border-neutral-800" />

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          >
            Continue with Google
          </button>

          <hr className="my-4 border-neutral-200 dark:border-neutral-800" />

          <button
            type="button"
            className="text-sm text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
            onClick={onGuestContinue}
          >
            Try it without an account
          </button>
        </section>
      </div>
    </div>
  );
}

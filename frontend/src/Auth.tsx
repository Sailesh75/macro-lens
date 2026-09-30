import { useState } from "react";
import { supabase } from "./supabaseClient";
import { ArrowRightIcon, Backdrop, Brand, GoogleIcon, LogoMark, Spinner } from "./ui";

type Mode = "login" | "signup";

interface Props {
  onGuestContinue: () => void;
}

export function Auth({ onGuestContinue }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // Stored in user_metadata; App.tsx shows it in the header instead of the email.
          options: { data: { username: username.trim() } },
        });
        if (error) throw error;
        // With email confirmation on, Supabase doesn't error for an already-registered
        // email (to prevent account enumeration) — it returns a user with no identities
        // and sends no email. Detect that so we don't claim a link was sent.
        if (data.user && data.user.identities?.length === 0) {
          throw new Error(
            "This email is already registered. Log in instead, or use Google if that's how you signed up."
          );
        }
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

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
  }

  return (
    <div className="flex min-h-svh flex-col px-4">
      <Backdrop />

      <header className="mx-auto flex h-16 w-full max-w-5xl items-center">
        <Brand />
      </header>

      <main className="flex flex-1 items-center justify-center pb-16">
        <div className="w-full max-w-sm animate-rise">
          <div className="text-center">
            {/* Lens motif: the logo mark inside a slowly rotating accent ring. */}
            <div className="relative mx-auto grid size-16 place-items-center">
              <div className="absolute inset-0 animate-spin-slow rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,var(--color-accent)_90deg,transparent_180deg)] opacity-70" />
              <div className="absolute inset-[3px] rounded-full bg-neutral-50 dark:bg-neutral-950" />
              <LogoMark className="relative size-9" />
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight">
              Every bite,{" "}
              <span className="font-display font-normal italic">measured.</span>
            </h1>
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              Snap, type or say what you ate. Get the macros.
            </p>
          </div>

          <section className="card mt-8">
            <div className="segmented flex w-full [&>button]:flex-1 [&>button]:justify-center">
              <button
                type="button"
                aria-pressed={mode === "login"}
                onClick={() => switchMode("login")}
              >
                Log in
              </button>
              <button
                type="button"
                aria-pressed={mode === "signup"}
                onClick={() => switchMode("signup")}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
              {mode === "signup" && (
                <input
                  type="text"
                  placeholder="Username"
                  aria-label="Username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength={3}
                  maxLength={24}
                  pattern="[A-Za-z0-9_.\-]+"
                  title="3–24 characters: letters, numbers, dot, underscore or hyphen"
                  required
                  className="input"
                />
              )}
              <input
                type="email"
                placeholder="you@example.com"
                aria-label="Email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
              />
              <input
                type="password"
                placeholder="Password"
                aria-label="Password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                className="input"
              />
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  aria-label="Sign in with Google"
                  title="Sign in with Google"
                  className="btn-ghost w-11 shrink-0 px-0"
                >
                  <GoogleIcon />
                </button>
                <button type="submit" disabled={loading} className="btn-primary group flex-1">
                  {loading ? (
                    <>
                      <Spinner /> Please wait
                    </>
                  ) : (
                    <>
                      {mode === "login" ? "Log in" : "Create account"}
                      <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {message && (
              <p className="mt-4 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                {message}
              </p>
            )}
            {error && (
              <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-400/10 dark:text-red-300">
                {error}
              </p>
            )}
          </section>

          <button
            type="button"
            className="link-muted group mx-auto mt-6 flex items-center gap-1.5"
            onClick={onGuestContinue}
          >
            Try it without an account
            <ArrowRightIcon className="size-3.5 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </main>
    </div>
  );
}

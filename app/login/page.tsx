"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";

function parseJwt(token: string) {
  const base64 = token.split(".")[1];
  return JSON.parse(atob(base64));
}

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.detail || "Login failed");
        return;
      }
      localStorage.setItem("jwt", data.token);
      const claims = parseJwt(data.token);
      localStorage.setItem("role", claims.role);
      localStorage.setItem("email", claims.email);
      if (claims.role === "carrier") {
        router.push("/carrier");
      } else {
        router.push("/admin");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 page-enter relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px]
                      bg-gradient-to-b from-[var(--brand-500)]/10 via-[var(--brand-400)]/5 to-transparent
                      rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-[400px] relative z-10">
        {/* Brand header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-[var(--radius-xl)]
                          bg-gradient-to-br from-[var(--brand-600)] to-[var(--brand-500)]
                          shadow-[var(--shadow-brand)] mb-5">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">
            Gate Transport
          </h1>
          <p className="mt-1.5 text-[15px] text-[var(--text-tertiary)]">
            Conditional payout enforcement
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-[var(--radius-2xl)] border border-[var(--border-default)]
                        bg-[var(--bg-surface)] p-8 shadow-[var(--shadow-lg)]">
          <form onSubmit={handleLogin}>
            <label
              htmlFor="apiKey"
              className="block text-[14px] font-semibold text-[var(--text-primary)] mb-1"
            >
              Access key
            </label>
            <p className="text-[13px] text-[var(--text-tertiary)] mb-4">
              Paste the key provided by your administrator
            </p>

            <div className="relative mb-6">
              <input
                id="apiKey"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gk_..."
                autoComplete="off"
                className="input pr-16 font-mono text-[14px]"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[var(--radius-sm)]
                           px-3 py-1.5 text-[13px] font-medium text-[var(--text-tertiary)]
                           hover:text-[var(--brand-600)] hover:bg-[var(--brand-50)]
                           transition-colors"
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={loading || !apiKey}
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          {error && (
            <div className="mt-5">
              <Alert variant="error">{error}</Alert>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <div className="flex items-center justify-center gap-2 text-[12px] text-[var(--text-tertiary)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Secure access only. All actions are audited.
          </div>
        </div>
      </div>
    </div>
  );
}

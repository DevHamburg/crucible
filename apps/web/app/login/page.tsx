"use client";

import { motion } from "framer-motion";
import { FlaskConical, LogIn, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { Card } from "@/components/ui/primitives";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useApp((s) => s.setAuth);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const res = await api.post<any>(path, { email, password });
      setAuth(res.access_token, res.user);
      toast.success(mode === "login" ? "Welcome back" : "Account created");
      router.push("/");
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-plasma shadow-glow">
            <FlaskConical className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold">{mode === "login" ? "Sign in" : "Create account"}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Unlock the <span className="gradient-text">global community leaderboards</span> — Elo
            arena, capability & safety rankings across every model. Your guest runs & keys carry over.
          </p>
        </div>
        <Card>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1 block text-xs text-zinc-400">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-sm outline-none focus:border-accent/50"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="login-password" className="mb-1 block text-xs text-zinc-400">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2.5 text-sm outline-none focus:border-accent/50"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        </Card>
        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-4 w-full text-center text-sm text-zinc-400 hover:text-zinc-200"
        >
          {mode === "login" ? "No account? Register" : "Have an account? Sign in"}
        </button>
        <p className="mt-6 text-center text-xs text-zinc-600">
          No login needed to run benchmarks — you're already a guest. Signing in just adds the
          global board and keeps your history safe.
        </p>
      </motion.div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";

// Module-level guard: React 19 StrictMode runs effects mount→cleanup→mount in dev, which
// would otherwise POST /auth/anon twice and create an orphaned anonymous account per load.
// Sharing one in-flight promise makes concurrent boots reuse the same request.
let anonBoot: Promise<any> | null = null;

/**
 * Seamless onboarding: every visitor gets an anonymous session so they can run
 * benchmarks and store keys immediately. Registering later upgrades this same
 * account in place (all runs/keys kept). Also validates a stored token on load.
 */
export function AuthBoot() {
  const { token, user, setAuth, logout } = useApp();

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!token) {
        try {
          anonBoot = anonBoot ?? api.post<any>("/auth/anon");
          const res = await anonBoot;
          if (!cancelled) setAuth(res.access_token, res.user);
        } catch {
          anonBoot = null; // allow a retry on the next mount
          /* backend offline — pages fall back to empty states */
        }
        return;
      }
      // have a token but no user in memory (fresh load) -> validate/hydrate
      if (token && !user) {
        try {
          const me = await api.get<any>("/auth/me");
          if (!cancelled && me?.authenticated && me.user) {
            setAuth(token, me.user);
          } else if (!cancelled) {
            logout();
            const res = await api.post<any>("/auth/anon");
            setAuth(res.access_token, res.user);
          }
        } catch {
          /* ignore */
        }
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return null;
}

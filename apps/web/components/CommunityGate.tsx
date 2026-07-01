"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Globe, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/store";

// Pages whose data becomes GLOBAL/community once you sign in.
const GATED = ["/leaderboard", "/arena", "/safety", "/observability"];

/**
 * Non-blocking growth hook: guests still see their OWN data on these pages, but a
 * banner nudges them to sign in to unlock the global community leaderboards.
 */
export function CommunityGate() {
  const path = usePathname();
  const user = useApp((s) => s.user);
  const isGuest = !user || user.is_anonymous;
  const show = isGuest && GATED.some((p) => path.startsWith(p));

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-plasma-radial p-4 sm:p-5">
            <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-accent/40 bg-accent/10">
                  <Lock className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    You're seeing only <span className="gradient-text">your own</span> results
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Sign in to unlock the <span className="text-zinc-200">global community leaderboards</span>{" "}
                    — Elo arena, capability & safety rankings across every model everyone tests.
                  </p>
                </div>
              </div>
              <Link href="/login" className="btn-primary shrink-0 whitespace-nowrap">
                <Globe className="h-4 w-4" /> Unlock global board
              </Link>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

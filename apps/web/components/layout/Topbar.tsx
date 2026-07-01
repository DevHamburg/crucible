"use client";

import { LogOut, Sparkles, UserPlus } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/lib/store";

export function Topbar() {
  const { user, logout } = useApp();
  const registered = user && !user.is_anonymous;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-black/30 px-6 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="hidden sm:inline">Benchmark · Battle · Red-Team · Observe</span>
      </div>
      <div className="flex items-center gap-3">
        {registered ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-1.5 text-sm">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-plasma text-xs font-semibold text-white">
                {user!.display_name?.[0]?.toUpperCase() ?? "U"}
              </span>
              <span className="hidden text-zinc-200 sm:inline">{user!.display_name}</span>
            </div>
            <button onClick={logout} className="btn-ghost h-9 w-9 !px-0" title="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="chip hidden sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" /> Guest
            </span>
            <Link href="/login" className="btn-primary !py-1.5">
              <UserPlus className="h-4 w-4" /> Sign in to rank
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

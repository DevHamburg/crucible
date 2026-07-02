"use client";

import {
  Activity,
  FlaskConical,
  Gauge,
  Home,
  KeyRound,
  Play,
  Shield,
  Swords,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/models", label: "Models & Keys", icon: KeyRound },
  { href: "/benchmarks", label: "Benchmarks", icon: FlaskConical },
  { href: "/run", label: "New Run", icon: Play },
  { href: "/runs", label: "Runs", icon: Activity },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/arena", label: "Arena", icon: Swords },
  { href: "/safety", label: "Safety & Red-Team", icon: Shield },
  { href: "/observability", label: "Observability", icon: Gauge },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-black/20 p-4 backdrop-blur-xl lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-plasma shadow-glow">
          <FlaskConical className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-base font-semibold leading-none tracking-tight">Crucible</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Proving Ground</div>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          // Match on segment boundaries so "/run" doesn't also light up on "/runs".
          const active =
            item.href === "/"
              ? path === "/"
              : path === item.href || path.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active ? "text-white" : "text-zinc-400 hover:text-zinc-100"
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 -z-10 rounded-xl border border-line bg-white/[0.05]"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className={cn("h-[18px] w-[18px]", active && "text-accent")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4 rounded-xl border border-line bg-white/[0.02] p-3 text-[11px] text-zinc-500">
        <span className="gradient-text font-semibold">Demo mode</span> runs on a simulated model
        fleet — add API keys to benchmark real models.
      </div>
    </aside>
  );
}

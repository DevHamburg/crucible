"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Award,
  Clock,
  Coins,
  Layers,
  ShieldAlert,
  Swords,
  Target,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  useDomains,
  useEloLeaderboard,
  useLeaderboard,
  useSafetyLeaderboard,
} from "@/lib/hooks";
import { money, ms, num, pct } from "@/lib/format";
import {
  AnimatedNumber,
  LiveDot,
  ModelAvatar,
  RankMedal,
  ScoreBar,
} from "@/components/ui/bits";
import { Card, EmptyState, Section, Skeleton } from "@/components/ui/primitives";
import { cn, domainColor } from "@/lib/utils";

type Tab = "capability" | "elo" | "safety";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "capability", label: "Capability", icon: Target },
  { id: "elo", label: "Arena Elo", icon: Swords },
  { id: "safety", label: "Safety", icon: ShieldAlert },
];

const ROW = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("capability");

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-plasma-radial p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid [background-size:44px_44px] opacity-40 [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="chip mb-4 !border-accent/40 !bg-accent/10 !text-accent">
            <Trophy className="h-3 w-3" /> The standings
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Model <span className="gradient-text">leaderboard</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-zinc-400">
            Ranked capability across domains, head-to-head Elo from the arena, and
            adversarial safety robustness — all in one place.
          </p>
        </motion.div>
      </div>

      {/* segmented control */}
      <div className="inline-flex rounded-2xl border border-line bg-white/[0.03] p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {active && (
                <motion.span
                  layoutId="tab-pill"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-xl border border-accent/40 bg-accent/10 shadow-glow"
                />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {tab === "capability" && <CapabilityBoard />}
          {tab === "elo" && <EloBoard />}
          {tab === "safety" && <SafetyBoard />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Capability ---------------- */

function CapabilityBoard() {
  const [domain, setDomain] = useState<string | undefined>(undefined);
  const { data: domains } = useDomains();
  const { data, isLoading } = useLeaderboard(domain);
  const rows = data?.leaderboard ?? [];

  return (
    <Section
      title="Capability ranking"
      subtitle="Weighted benchmark score across all evaluated items"
      action={
        <span className="text-xs text-zinc-500">
          {rows.length ? `${rows.length} models` : ""}
        </span>
      }
    >
      <div className="flex flex-wrap gap-2">
        <DomainPill active={!domain} onClick={() => setDomain(undefined)} label="All" />
        {(domains ?? []).map((d) => (
          <DomainPill
            key={d.domain}
            active={domain === d.domain}
            onClick={() => setDomain(d.domain)}
            label={d.label}
            color={domainColor(d.domain)}
          />
        ))}
      </div>

      {isLoading ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Target className="h-8 w-8" />} title="No results yet">
          Run a benchmark to populate the capability leaderboard.{" "}
          <Link href="/run" className="text-accent hover:underline">
            Start a run
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <motion.div
                key={r.model_ref}
                layout
                {...ROW}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 260, damping: 26 }}
              >
                <CapabilityRow row={r} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Section>
  );
}

function CapabilityRow({ row }: { row: any }) {
  const top = row.rank === 1;
  const byDomain: Record<string, { score: number; n: number }> = row.by_domain ?? {};
  const domEntries = Object.entries(byDomain);
  return (
    <Card
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center",
        top && "!border-amber-400/40 shadow-glow"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <RankMedal rank={row.rank} />
        <ModelAvatar refId={row.model_ref} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">
              {row.display_name || row.model_ref}
            </span>
            {top && (
              <span className="chip !border-amber-400/40 !bg-amber-400/10 !text-amber-300">
                <Award className="h-3 w-3" /> Top
              </span>
            )}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-zinc-500">{row.model_ref}</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wider text-zinc-500">Score</span>
          <AnimatedNumber
            value={(row.score ?? 0) * 100}
            decimals={1}
            suffix="%"
            className="text-2xl font-semibold"
          />
        </div>
        <ScoreBar value={row.score ?? 0} color={top ? "#fbbf24" : "#8b5cf6"} height={8} />
        {domEntries.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {domEntries.map(([d, v]) => {
              const c = domainColor(d);
              return (
                <span
                  key={d}
                  title={`${d}: ${pct(v.score)} · n=${v.n}`}
                  className="h-4 w-4 rounded-[4px] border border-white/5"
                  style={{
                    background: c,
                    opacity: 0.2 + Math.min(0.8, (v.score ?? 0) * 0.8),
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 sm:w-56 sm:shrink-0">
        <Metric icon={<Layers className="h-3.5 w-3.5" />} label="items" value={num(row.n)} />
        <Metric icon={<Coins className="h-3.5 w-3.5" />} label="cost" value={money(row.cost)} />
        <Metric
          icon={<Clock className="h-3.5 w-3.5" />}
          label="latency"
          value={ms(row.avg_latency_ms)}
        />
      </div>
    </Card>
  );
}

/* ---------------- Arena Elo ---------------- */

function EloBoard() {
  const { data, isLoading } = useEloLeaderboard();
  const rows = data?.leaderboard ?? [];
  const nMatches = data?.n_matches ?? 0;

  return (
    <Section
      title="Arena Elo"
      subtitle="Head-to-head ratings from judged battles"
      action={
        rows.length ? (
          <span className="chip">
            <Activity className="h-3 w-3" /> {num(nMatches)} matches
          </span>
        ) : null
      }
    >
      {isLoading ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Swords className="h-8 w-8" />} title="No battles yet">
          The Elo board fills up as models fight in the arena.{" "}
          <Link href="/arena" className="text-accent hover:underline">
            Enter the arena
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <motion.div
                key={r.model_ref}
                layout
                {...ROW}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 260, damping: 26 }}
              >
                <EloRowCard row={r} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Section>
  );
}

function EloRowCard({ row }: { row: any }) {
  const top = row.rank === 1;
  const games = row.games ?? row.wins + row.losses + row.ties;
  const winRate = games ? (row.wins ?? 0) / games : 0;
  return (
    <Card
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center",
        top && "!border-amber-400/40 shadow-glow"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <RankMedal rank={row.rank} />
        <ModelAvatar refId={row.model_ref} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">
              {row.display_name || row.model_ref}
            </span>
            {row.elo_live ? <LiveDot label={`${num(row.elo_live)}`} /> : null}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-zinc-500">{row.model_ref}</div>
        </div>
      </div>

      <div className="flex flex-col items-start sm:w-40 sm:items-end">
        <span className="text-xs uppercase tracking-wider text-zinc-500">Rating</span>
        <AnimatedNumber
          value={row.rating ?? 0}
          decimals={0}
          className={cn("text-3xl font-bold", top ? "text-amber-300" : "gradient-text")}
        />
        <span className="font-mono text-[11px] text-zinc-500">
          [{num(row.ci_low)}, {num(row.ci_high)}]
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 sm:max-w-xs">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-emerald-400">{row.wins ?? 0}W</span>
          <span className="font-semibold text-rose-400">{row.losses ?? 0}L</span>
          <span className="font-semibold text-zinc-400">{row.ties ?? 0}T</span>
          <span className="ml-auto text-xs text-zinc-500">{num(games)} games</span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${winRate * 100}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
            className="h-full bg-emerald-500"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{
              width: `${games ? ((row.ties ?? 0) / games) * 100 : 0}%`,
            }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
            className="h-full bg-zinc-600"
          />
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Safety ---------------- */

function SafetyBoard() {
  const { data, isLoading } = useSafetyLeaderboard();
  const rows = data?.leaderboard ?? [];

  return (
    <Section
      title="Safety robustness"
      subtitle="Resistance to adversarial jailbreak attempts"
      action={
        rows.length ? (
          <span className="text-xs text-zinc-500">{rows.length} models</span>
        ) : null
      }
    >
      {isLoading ? (
        <SkeletonList />
      ) : rows.length === 0 ? (
        <EmptyState icon={<ShieldAlert className="h-8 w-8" />} title="No safety runs yet">
          Red-team a model to measure its robustness.{" "}
          <Link href="/safety" className="text-accent hover:underline">
            Open safety
          </Link>
          .
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => (
              <motion.div
                key={r.model_ref}
                layout
                {...ROW}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 260, damping: 26 }}
              >
                <SafetyRowCard row={r} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Section>
  );
}

function SafetyRowCard({ row }: { row: any }) {
  const top = row.rank === 1;
  const cats = row.categories ?? {};
  const catEntries = Object.entries(cats) as [string, any][];
  return (
    <Card
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-center",
        top && "!border-emerald-400/40 shadow-glow"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <RankMedal rank={row.rank} />
        <ModelAvatar refId={row.model_ref} size={40} />
        <div className="min-w-0 flex-1">
          <span className="truncate font-semibold">
            {row.display_name || row.model_ref}
          </span>
          <div className="mt-1 truncate font-mono text-xs text-zinc-500">{row.model_ref}</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wider text-zinc-500">Robustness</span>
          <AnimatedNumber
            value={(row.robustness ?? 0) * 100}
            decimals={1}
            suffix="%"
            className="text-2xl font-semibold text-emerald-400"
          />
        </div>
        <ScoreBar value={row.robustness ?? 0} color={top ? "#34d399" : "#10b981"} height={8} />
        {catEntries.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {catEntries.map(([c, v]) => (
              <span
                key={c}
                title={`${c}: ${pct(v.jailbreak_rate)} jailbreak · n=${v.n}`}
                className="h-4 w-4 rounded-[4px] border border-white/5"
                style={{
                  background: "#ef4444",
                  opacity: 0.15 + Math.min(0.85, (v.jailbreak_rate ?? 0) * 0.85),
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:w-44 sm:shrink-0">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-zinc-500">Jailbreak</span>
          <span className="stat-num text-lg font-semibold text-rose-400">
            {pct(row.jailbreak_rate)}
          </span>
        </div>
        <Metric icon={<Layers className="h-3.5 w-3.5" />} label="attacks" value={num(row.n)} />
      </div>
    </Card>
  );
}

/* ---------------- shared bits ---------------- */

function DomainPill({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn("chip capitalize", active && "!border-accent/60 !bg-accent/10 !text-accent")}
      style={!active && color ? { borderColor: `${color}44`, color } : undefined}
    >
      {color && !active && (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      )}
      {label}
    </button>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
        {icon}
        {label}
      </span>
      <span className="stat-num text-sm font-medium">{value}</span>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

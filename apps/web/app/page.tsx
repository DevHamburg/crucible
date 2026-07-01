"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Briefcase,
  Code2,
  DollarSign,
  Gauge,
  Globe,
  Heart,
  Megaphone,
  Play,
  Shield,
  Swords,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useDomains, useLeaderboard, useObservability, useRuns } from "@/lib/hooks";
import { compactTokens, money, pct, timeAgo } from "@/lib/format";
import { AnimatedNumber, DomainBadge, ModelAvatar, RankMedal, ScoreBar, StatusPill } from "@/components/ui/bits";
import { Card, Section, Skeleton, StatCard } from "@/components/ui/primitives";
import { domainColor } from "@/lib/utils";

const DOMAIN_ICONS: Record<string, any> = {
  logic: Brain,
  software: Code2,
  psychology: Heart,
  trading: TrendingUp,
  business: Briefcase,
  marketing: Megaphone,
  general: Globe,
  safety: Shield,
};

export default function Dashboard() {
  const { data: domains } = useDomains();
  const { data: obs } = useObservability();
  const { data: lb } = useLeaderboard();
  const { data: runs } = useRuns();

  const top = lb?.leaderboard?.slice(0, 5) ?? [];
  const recent = runs?.slice(0, 5) ?? [];

  return (
    <div className="space-y-10">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-plasma-radial p-8 sm:p-12">
        <div className="pointer-events-none absolute inset-0 bg-grid [background-size:44px_44px] opacity-40 [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-2xl"
        >
          <div className="chip mb-4 !border-accent/40 !bg-accent/10 !text-accent">
            <Zap className="h-3 w-3" /> State-of-the-art evaluation pipeline
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Put frontier models <span className="gradient-text">in the crucible</span>.
          </h1>
          <p className="mt-4 max-w-xl text-zinc-400">
            Benchmark, battle and red-team any model across psychology, trading, software,
            business, marketing and logic — with live scoring, an Elo arena and full observability.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/run" className="btn-primary">
              <Play className="h-4 w-4" /> Start a benchmark
            </Link>
            <Link href="/arena" className="btn-ghost">
              <Swords className="h-4 w-4" /> Enter the arena
            </Link>
            <Link href="/leaderboard" className="btn-ghost">
              <Trophy className="h-4 w-4" /> Leaderboard
            </Link>
          </div>
        </motion.div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Runs" value={<AnimatedNumber value={obs?.runs ?? 0} />} icon={<Play className="h-4 w-4" />} delay={0.02} />
        <StatCard
          label="Model calls"
          value={<AnimatedNumber value={obs?.generations ?? 0} />}
          sub={`${compactTokens(obs?.total_tokens)} tokens`}
          icon={<Gauge className="h-4 w-4" />}
          accent="#06b6d4"
          delay={0.06}
        />
        <StatCard
          label="Total cost"
          value={<AnimatedNumber value={obs?.total_cost ?? 0} prefix="$" decimals={2} />}
          icon={<DollarSign className="h-4 w-4" />}
          accent="#10b981"
          delay={0.1}
        />
        <StatCard
          label="Avg latency"
          value={<AnimatedNumber value={obs?.avg_latency_ms ?? 0} suffix="ms" />}
          sub={`${pct(obs?.error_rate ?? 0)} errors`}
          icon={<Zap className="h-4 w-4" />}
          accent="#f59e0b"
          delay={0.14}
        />
      </div>

      {/* domains */}
      <Section title="Benchmark domains" subtitle="Curated suites across the areas that matter">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {(domains ?? []).map((d, i) => {
            const Icon = DOMAIN_ICONS[d.domain] ?? Globe;
            const c = domainColor(d.domain);
            return (
              <motion.div
                key={d.domain}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link href={d.domain === "safety" ? "/safety" : `/benchmarks?domain=${d.domain}`}>
                  <Card className="group h-full transition-all hover:-translate-y-1 hover:border-white/20">
                    <div
                      className="mb-3 grid h-10 w-10 place-items-center rounded-xl"
                      style={{ background: `${c}18`, border: `1px solid ${c}44`, color: c }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="font-medium capitalize">{d.label}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {d.benchmarks} suites · {d.items} items
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
          {!domains && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* top models */}
        <Section
          className="lg:col-span-3"
          title="Top models"
          subtitle="Aggregate capability across all runs"
          action={
            <Link href="/leaderboard" className="text-sm text-accent hover:underline">
              Full board <ArrowRight className="inline h-3 w-3" />
            </Link>
          }
        >
          <Card className="divide-y divide-line !p-0">
            {top.length === 0 && (
              <div className="p-6 text-sm text-zinc-500">
                No results yet — start a run to populate the leaderboard.
              </div>
            )}
            {top.map((r, i) => (
              <motion.div
                key={r.model_ref}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-4"
              >
                <RankMedal rank={r.rank} />
                <ModelAvatar refId={r.model_ref} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.display_name}</div>
                  <div className="mt-1">
                    <ScoreBar value={r.score} />
                  </div>
                </div>
                <div className="stat-num text-right text-sm font-semibold">{pct(r.score)}</div>
              </motion.div>
            ))}
          </Card>
        </Section>

        {/* recent runs */}
        <Section
          className="lg:col-span-2"
          title="Recent activity"
          action={
            <Link href="/runs" className="text-sm text-accent hover:underline">
              All runs
            </Link>
          }
        >
          <Card className="divide-y divide-line !p-0">
            {recent.length === 0 && <div className="p-6 text-sm text-zinc-500">No runs yet.</div>}
            {recent.map((run) => (
              <Link
                key={run.id}
                href={run.kind === "safety" ? `/safety?run=${run.id}` : `/runs/${run.id}`}
                className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-white/[0.03]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{run.name}</div>
                  <div className="text-xs text-zinc-500">{timeAgo(run.created_at)}</div>
                </div>
                <StatusPill status={run.status} />
              </Link>
            ))}
          </Card>
        </Section>
      </div>
    </div>
  );
}

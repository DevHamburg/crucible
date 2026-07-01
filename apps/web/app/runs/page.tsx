"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  DollarSign,
  Layers,
  ListChecks,
  Play,
  RefreshCw,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRuns } from "@/lib/hooks";
import { money, timeAgo } from "@/lib/format";
import { AnimatedNumber, LiveDot, StatusPill } from "@/components/ui/bits";
import { Card, EmptyState, Progress, Section, Skeleton, StatCard } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { Run } from "@/lib/types";

type Filter = "all" | "benchmark" | "safety";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "benchmark", label: "Benchmark" },
  { id: "safety", label: "Safety" },
];

function isRunning(status: string) {
  const s = status?.toLowerCase();
  return s === "running" || s === "queued" || s === "pending";
}

function runHref(run: Run) {
  return run.kind === "safety" ? `/safety?run=${run.id}` : `/runs/${run.id}`;
}

export default function RunsPage() {
  const { data, isLoading, refetch } = useRuns();
  const [filter, setFilter] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const runs = data ?? [];

  const stats = useMemo(() => {
    const total = runs.length;
    const running = runs.filter((r) => isRunning(r.status)).length;
    const spend = runs.reduce((acc, r) => acc + (r.total_cost ?? 0), 0);
    return { total, running, spend };
  }, [runs]);

  const filtered = useMemo(() => {
    if (filter === "all") return runs;
    return runs.filter((r) => (filter === "safety" ? r.kind === "safety" : r.kind !== "safety"));
  }, [runs, filter]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Runs</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Every benchmark and red-team evaluation you have launched.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="btn-ghost" disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Refresh
          </button>
          <Link href="/run" className="btn-primary">
            <Play className="h-4 w-4" /> New run
          </Link>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total runs"
          value={<AnimatedNumber value={stats.total} />}
          icon={<Layers className="h-4 w-4" />}
          delay={0.02}
        />
        <StatCard
          label="Running now"
          value={<AnimatedNumber value={stats.running} />}
          sub={stats.running > 0 ? "live" : "idle"}
          icon={<Activity className="h-4 w-4" />}
          accent="#06b6d4"
          delay={0.06}
        />
        <StatCard
          label="Total spend"
          value={<AnimatedNumber value={stats.spend} prefix="$" decimals={2} />}
          icon={<DollarSign className="h-4 w-4" />}
          accent="#10b981"
          delay={0.1}
        />
      </div>

      {/* filter + list */}
      <Section
        title="All runs"
        subtitle="Filter by kind — click a row to open its detail view"
        action={
          <div className="flex gap-1 rounded-xl border border-line bg-white/[0.03] p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-lg px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.id
                    ? "bg-accent/15 text-accent"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      >
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <EmptyState icon={<ListChecks className="h-6 w-6" />} title="No runs yet">
            <p className="mb-4 text-sm text-zinc-500">
              Launch your first evaluation to see it tracked here.
            </p>
            <Link href="/run" className="btn-primary">
              <Play className="h-4 w-4" /> Start a run
            </Link>
          </EmptyState>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {filtered.map((run, i) => {
                const running = isRunning(run.status);
                return (
                  <motion.div
                    key={run.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ delay: Math.min(i * 0.04, 0.4) }}
                  >
                    <Link href={runHref(run)}>
                      <Card className="group transition-all hover:-translate-y-0.5 hover:border-white/20">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{run.name}</span>
                              <span
                                className={cn(
                                  "chip",
                                  run.kind === "safety"
                                    ? "!border-danger/40 !bg-danger/10 !text-danger"
                                    : "!border-accent/40 !bg-accent/10 !text-accent"
                                )}
                              >
                                {run.kind === "safety" ? (
                                  <Shield className="h-3 w-3" />
                                ) : (
                                  <Layers className="h-3 w-3" />
                                )}
                                {run.kind}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                              <span>{timeAgo(run.created_at)}</span>
                              {running && <LiveDot label="live" />}
                            </div>
                          </div>

                          <div className="hidden text-right sm:block">
                            <div className="stat-num text-sm font-semibold">
                              {run.done_items}/{run.total_items}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                              items
                            </div>
                          </div>

                          <div className="hidden text-right sm:block">
                            <div className="stat-num text-sm font-semibold">
                              {money(run.total_cost)}
                            </div>
                            <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                              cost
                            </div>
                          </div>

                          <div className="shrink-0">
                            <StatusPill status={run.status} />
                          </div>
                        </div>

                        {running && (
                          <div className="mt-3">
                            <Progress value={run.progress} />
                          </div>
                        )}
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </Section>
    </div>
  );
}

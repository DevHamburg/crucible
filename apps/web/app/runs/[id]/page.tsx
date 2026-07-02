"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  Ban,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Gauge,
  Layers,
  ListChecks,
  Radio,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRun, useRunResults } from "@/lib/hooks";
import { api, subscribe, type SSEStatus } from "@/lib/api";
import { ms, money, num, pct } from "@/lib/format";
import {
  AnimatedNumber,
  DomainBadge,
  LiveDot,
  ModelAvatar,
  RankMedal,
  ScoreBar,
  StatusPill,
} from "@/components/ui/bits";
import {
  Card,
  EmptyState,
  Progress,
  Section,
  Skeleton,
  Spinner,
  StatCard,
} from "@/components/ui/primitives";
import { domainColor } from "@/lib/utils";

type Tally = { n: number; correct: number; sumScore: number; cost: number; sumLatency: number };

type FeedItem = {
  key: string;
  model_ref: string;
  benchmark?: string;
  domain?: string;
  passed?: boolean;
  score?: number;
  latency_ms?: number;
};

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  const { data: run, isError, error } = useRun(id, true);
  const status = run?.status ?? "pending";
  const isRunning = status === "running" || status === "pending";
  const isDone = status === "completed";
  const [streamStatus, setStreamStatus] = useState<SSEStatus>("connecting");

  // live state accumulated from SSE
  const [live, setLive] = useState<{
    progress: number;
    done: number;
    total: number;
    tallies: Record<string, Tally>;
    feed: FeedItem[];
    completed: boolean;
  }>({ progress: 0, done: 0, total: 0, tallies: {}, feed: [], completed: false });

  const [cancelling, setCancelling] = useState(false);
  const feedCounter = useRef(0);

  useEffect(() => {
    if (!id || !isRunning) return;
    const unsub = subscribe(
      `/runs/${id}/stream`,
      (ev: any) => {
      setLive((prev) => {
        const next = { ...prev };
        if (typeof ev.progress === "number") next.progress = ev.progress;
        if (typeof ev.done === "number") next.done = ev.done;
        if (typeof ev.total === "number") next.total = ev.total;

        if (ev.type === "item_done") {
          const ref: string = ev.model_ref ?? "unknown";
          const t = { ...(prev.tallies[ref] ?? { n: 0, correct: 0, sumScore: 0, cost: 0, sumLatency: 0 }) };
          t.n += 1;
          if (ev.passed) t.correct += 1;
          if (typeof ev.score === "number") t.sumScore += ev.score;
          if (typeof ev.cost === "number") t.cost += ev.cost;
          if (typeof ev.latency_ms === "number") t.sumLatency += ev.latency_ms;
          next.tallies = { ...prev.tallies, [ref]: t };

          const key = `f${feedCounter.current++}`;
          const feedItem: FeedItem = {
            key,
            model_ref: ref,
            benchmark: ev.benchmark,
            domain: ev.domain,
            passed: ev.passed,
            score: ev.score,
            latency_ms: ev.latency_ms,
          };
          next.feed = [feedItem, ...prev.feed].slice(0, 12);
        }

        if (ev.type === "run_completed" || ev.type === "run_error") next.completed = true;
        return next;
      });
      },
      { onStatus: setStreamStatus }
    );
    return unsub;
  }, [id, isRunning]);

  // final results (only when done)
  const wantResults = isDone || live.completed;
  const { data: results } = useRunResults(wantResults ? id : "", true);

  const cancel = async () => {
    setCancelling(true);
    try {
      await api.post(`/runs/${id}/cancel`);
      toast.success("Run cancellation requested");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to cancel run");
    } finally {
      setCancelling(false);
    }
  };

  const total = live.total || run?.total_items || 0;
  const done = live.done || run?.done_items || 0;
  const progress =
    live.progress || run?.progress || (total ? done / total : 0);

  const liveModels = useMemo(() => {
    return Object.entries(live.tallies)
      .map(([ref, t]) => ({ ref, ...t, acc: t.n ? t.sumScore / t.n : 0 }))
      .sort((a, b) => b.acc - a.acc);
  }, [live.tallies]);

  if (isError) {
    const st = (error as any)?.status;
    return (
      <EmptyState
        icon={<Ban className="h-8 w-8" />}
        title={st === 404 ? "Run not found" : st === 403 ? "This run is private" : "Couldn't load run"}
      >
        <div className="space-y-3">
          <p>
            {st === 403
              ? "Sign in to view community runs, or open one of your own."
              : (error as any)?.message ?? "The run could not be loaded."}
          </p>
          <Link href="/runs" className="btn-ghost inline-flex text-sm">
            <ArrowLeft className="h-4 w-4" /> Back to all runs
          </Link>
        </div>
      </EmptyState>
    );
  }

  if (!run) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-line bg-plasma-radial p-6 sm:p-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-grid [background-size:44px_44px] opacity-30 [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <Link
              href="/runs"
              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <ArrowLeft className="h-3 w-3" /> All runs
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
                {run.name || "Benchmark run"}
              </h1>
              <StatusPill status={status} />
              {isRunning && <span className="animate-pulse text-emerald-400"><Radio className="h-4 w-4" /></span>}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <Layers className="h-3 w-3" /> {run.kind}
              </span>
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-3 w-3" /> {num(done)}/{num(total)} items
              </span>
              <span className="inline-flex items-center gap-1">
                <Coins className="h-3 w-3" /> {money(run.total_cost)}
              </span>
            </div>
          </div>
          {isRunning && (
            <button
              type="button"
              onClick={cancel}
              disabled={cancelling}
              className="btn-ghost !border-rose-500/40 !text-rose-300 hover:!bg-rose-500/10 disabled:opacity-50"
            >
              {cancelling ? <Spinner /> : <Ban className="h-4 w-4" />} Cancel run
            </button>
          )}
        </div>
      </motion.div>

      {run.error && (
        <Card className="!border-rose-500/40 !bg-rose-500/5 text-sm text-rose-200">
          <span className="font-semibold">Error:</span> {run.error}
        </Card>
      )}

      {/* ============ LIVE VIEW ============ */}
      {isRunning && (
        <>
          {/* progress hero */}
          <Card className="relative overflow-hidden">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                <Activity className="h-4 w-4 text-accent" /> Live progress
              </div>
              <LiveDot label={streamStatus === "open" ? "streaming" : streamStatus === "reconnecting" ? "reconnecting…" : streamStatus === "closed" ? "offline" : "connecting…"} />
            </div>
            <div className="flex items-end justify-between">
              <div className="text-4xl font-bold stat-num">
                <AnimatedNumber value={progress * 100} decimals={1} suffix="%" />
              </div>
              <div className="text-right text-xs text-zinc-500">
                {num(done)} of {num(total)} evaluations
              </div>
            </div>
            <div className="mt-4">
              <Progress value={progress} />
            </div>
          </Card>

          {/* live per-model grid */}
          <Section title="Running scoreboard" subtitle="Accuracy updates as evaluations land">
            {liveModels.length === 0 ? (
              <Card className="flex items-center justify-center gap-3 py-10 text-sm text-zinc-500">
                <Spinner /> Waiting for the first results…
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {liveModels.map((m, i) => {
                    const acc = m.acc;
                    const c = domainColor(run.config?.domain as string);
                    return (
                      <motion.div
                        key={m.ref}
                        layout
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                      >
                        <Card className="space-y-3">
                          <div className="flex items-center gap-2">
                            <ModelAvatar refId={m.ref} size={28} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{m.ref.split("/").pop()}</div>
                              <div className="text-[11px] text-zinc-500">{num(m.n)} evaluated</div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-semibold stat-num" style={{ color: c }}>
                                {pct(acc)}
                              </div>
                            </div>
                          </div>
                          <ScoreBar value={acc} color={c} />
                          <div className="flex items-center justify-between text-[11px] text-zinc-500">
                            <span>{num(m.correct)} passed</span>
                            <span>{ms(m.n ? m.sumLatency / m.n : 0)} avg · {money(m.cost)}</span>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </Section>

          {/* event feed */}
          <Section title="Event feed" subtitle="Latest evaluations, freshest first">
            <Card className="!p-2">
              {live.feed.length === 0 ? (
                <div className="py-6 text-center text-sm text-zinc-500">No events yet.</div>
              ) : (
                <div className="space-y-1">
                  <AnimatePresence initial={false}>
                    {live.feed.map((f) => (
                      <motion.div
                        key={f.key}
                        layout
                        initial={{ opacity: 0, x: -12, height: 0 }}
                        animate={{ opacity: 1, x: 0, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 26 }}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.03]"
                      >
                        <span
                          className={
                            f.passed
                              ? "grid h-6 w-6 place-items-center rounded-full bg-emerald-500/15 text-emerald-400"
                              : "grid h-6 w-6 place-items-center rounded-full bg-rose-500/15 text-rose-400"
                          }
                        >
                          {f.passed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        </span>
                        <ModelAvatar refId={f.model_ref} size={22} />
                        <span className="truncate text-sm font-medium">{f.model_ref.split("/").pop()}</span>
                        {f.domain && <DomainBadge domain={f.domain} label={f.benchmark ?? f.domain} />}
                        <span className="ml-auto inline-flex items-center gap-1 text-xs text-zinc-500">
                          <Clock className="h-3 w-3" /> {ms(f.latency_ms)}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </Card>
          </Section>
        </>
      )}

      {/* ============ FINAL RESULTS ============ */}
      {wantResults && (
        <FinalResults results={results} runCost={run.total_cost} domainHint={run.config?.domain as string} />
      )}

      {status === "cancelled" && (
        <EmptyState icon={<Ban className="h-8 w-8" />} title="Run cancelled">
          This run was cancelled before completion.
        </EmptyState>
      )}
    </div>
  );
}

/* ---------------- Final results ---------------- */

function FinalResults({
  results,
  runCost,
  domainHint,
}: {
  results: any;
  runCost: number;
  domainHint?: string;
}) {
  if (!results) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const leaderboard: any[] = results.leaderboard ?? [];
  const byBenchmark: any[] = results.by_benchmark ?? [];
  const items: any[] = results.items ?? [];

  const best = leaderboard[0];
  const totalN = leaderboard.reduce((s, r) => s + (r.n ?? 0), 0);
  const avgLatency =
    leaderboard.length > 0
      ? leaderboard.reduce((s, r) => s + (r.avg_latency_ms ?? 0), 0) / leaderboard.length
      : 0;

  if (leaderboard.length === 0) {
    return (
      <EmptyState icon={<Trophy className="h-8 w-8" />} title="No results">
        This run produced no scored results.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-8">
      {/* summary stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Winner"
          value={best ? (best.display_name ?? best.model_ref.split("/").pop()) : "—"}
          sub={best ? pct(best.score) : undefined}
          icon={<Trophy className="h-4 w-4" />}
          accent="#fbbf24"
          delay={0.02}
        />
        <StatCard
          label="Models"
          value={<AnimatedNumber value={leaderboard.length} />}
          icon={<Sparkles className="h-4 w-4" />}
          accent="#8b5cf6"
          delay={0.06}
        />
        <StatCard
          label="Evaluations"
          value={<AnimatedNumber value={totalN} />}
          icon={<ListChecks className="h-4 w-4" />}
          accent="#06b6d4"
          delay={0.1}
        />
        <StatCard
          label="Total cost"
          value={<AnimatedNumber value={runCost ?? 0} prefix="$" decimals={2} />}
          sub={`${ms(avgLatency)} avg latency`}
          icon={<Coins className="h-4 w-4" />}
          accent="#10b981"
          delay={0.14}
        />
      </div>

      {/* leaderboard */}
      <Section title="Final leaderboard" subtitle="Ranked by aggregate score">
        <div className="space-y-2">
          {leaderboard.map((row, i) => {
            const c = domainColor(domainHint);
            const name = row.display_name ?? row.model_ref.split("/").pop();
            return (
              <motion.div
                key={row.model_ref}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="flex items-center gap-4 py-4">
                  <RankMedal rank={i + 1} />
                  <ModelAvatar refId={row.model_ref} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{name}</div>
                    <div className="mt-1.5 max-w-md">
                      <ScoreBar value={row.score ?? 0} color={c} />
                    </div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Score</div>
                    <div className="text-lg font-semibold stat-num" style={{ color: c }}>
                      {pct(row.score)}
                    </div>
                  </div>
                  <div className="hidden text-right md:block">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Items</div>
                    <div className="text-sm font-medium stat-num">{num(row.n)}</div>
                  </div>
                  <div className="hidden text-right md:block">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Latency</div>
                    <div className="text-sm font-medium stat-num">{ms(row.avg_latency_ms)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-500">Cost</div>
                    <div className="text-sm font-medium stat-num">{money(row.cost)}</div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </Section>

      {/* per-benchmark breakdown */}
      {byBenchmark.length > 0 && (
        <BenchmarkBreakdown rows={byBenchmark} />
      )}

      {/* item samples */}
      {items.length > 0 && <ItemSamples items={items} />}
    </div>
  );
}

function BenchmarkBreakdown({ rows }: { rows: any[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of rows) {
      const key = r.benchmark ?? "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <Section title="Per-benchmark breakdown" subtitle="How each model performed on each suite">
      <div className="space-y-5">
        {grouped.map(([benchmark, brows], gi) => {
          const domain = brows[0]?.domain ?? "mixed";
          const c = domainColor(domain);
          const sorted = [...brows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          return (
            <motion.div
              key={benchmark}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.05 }}
            >
              <Card className="!p-0 overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Gauge className="h-4 w-4" style={{ color: c }} /> {benchmark}
                  </div>
                  <DomainBadge domain={domain} />
                </div>
                <div className="divide-y divide-line">
                  {sorted.map((r) => (
                    <div key={r.model_ref} className="flex items-center gap-3 px-4 py-2.5">
                      <ModelAvatar refId={r.model_ref} size={24} />
                      <span className="w-40 shrink-0 truncate text-sm">{r.model_ref.split("/").pop()}</span>
                      <div className="min-w-0 flex-1">
                        <ScoreBar value={r.score ?? 0} color={c} height={5} />
                      </div>
                      <span className="w-14 shrink-0 text-right text-sm font-medium stat-num" style={{ color: c }}>
                        {pct(r.score)}
                      </span>
                      <span className="hidden w-24 shrink-0 text-right text-xs text-zinc-500 sm:block">
                        {pct(r.pass_rate)} pass
                      </span>
                      <span className="hidden w-16 shrink-0 text-right text-xs text-zinc-500 md:block">
                        {ms(r.avg_latency_ms)}
                      </span>
                      <span className="hidden w-16 shrink-0 text-right text-xs text-zinc-500 md:block">
                        {money(r.cost)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}

function ItemSamples({ items }: { items: any[] }) {
  const sample = items.slice(0, 20);
  return (
    <Section title="Sample results" subtitle={`${sample.length} of ${num(items.length)} evaluated items`}>
      <div className="space-y-2">
        {sample.map((it, i) => (
          <ItemRow key={i} item={it} index={i} />
        ))}
      </div>
    </Section>
  );
}

function ItemRow({ item, index }: { item: any; index: number }) {
  const [open, setOpen] = useState(false);
  const c = domainColor(item.domain);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 12) * 0.02 }}
    >
      <Card className="!p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
        >
          <span
            className={
              item.passed
                ? "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400"
                : "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-400"
            }
          >
            {item.passed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </span>
          <ModelAvatar refId={item.model_ref} size={24} />
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">{item.prompt}</span>
          {item.domain && <DomainBadge domain={item.domain} label={item.benchmark ?? item.domain} />}
          {item.needs_review && (
            <span className="chip !border-amber-500/40 !bg-amber-500/10 !text-amber-300">review</span>
          )}
          <span className="shrink-0 text-sm font-semibold stat-num" style={{ color: c }}>
            {pct(item.score)}
          </span>
          <ChevronDown
            className={
              open
                ? "h-4 w-4 shrink-0 rotate-180 text-zinc-400 transition-transform"
                : "h-4 w-4 shrink-0 text-zinc-400 transition-transform"
            }
          />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-line px-4 py-4 text-sm">
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Prompt</div>
                  <p className="whitespace-pre-wrap text-zinc-300">{item.prompt}</p>
                </div>
                <div>
                  <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Response</div>
                  <p className="whitespace-pre-wrap rounded-xl border border-line bg-white/[0.02] p-3 text-zinc-300">
                    {item.response}
                  </p>
                </div>
                {item.rationale && (
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Rationale</div>
                    <p className="whitespace-pre-wrap text-zinc-400">{item.rationale}</p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {ms(item.latency_ms)}
                  </span>
                  <span>Score {pct(item.score)}</span>
                  <span>{item.passed ? "Passed" : "Failed"}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
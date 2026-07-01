"use client";

import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Coins,
  Cpu,
  DollarSign,
  Gauge,
  Play,
  RefreshCw,
  Radio,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCosts, useObservability } from "@/lib/hooks";
import { api } from "@/lib/api";
import { compactTokens, money, ms, num, pct, timeAgo } from "@/lib/format";
import { AnimatedNumber, ModelAvatar } from "@/components/ui/bits";
import { Card, EmptyState, Section, Skeleton, StatCard } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type CostRow = {
  model_ref: string;
  display_name?: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  avg_latency_ms: number;
  error_rate: number;
  tokens_per_call: number;
};

type Trace = {
  id: string;
  run_id?: string;
  model_ref: string;
  provider: string;
  kind: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  cost: number;
  status: string;
  error?: string | null;
  created_at: string;
};

const ACCENT = "#8b5cf6";
const CYAN = "#06b6d4";

function shortRef(ref: string) {
  return ref.split("/").pop() ?? ref;
}

function ChartTooltip({ active, payload, unit }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="glass rounded-lg border border-line px-3 py-2 text-xs shadow-glow">
      <div className="font-medium text-zinc-200">{p.payload.label}</div>
      <div className="stat-num mt-0.5" style={{ color: p.fill }}>
        {unit === "cost" ? money(p.value) : unit === "ms" ? ms(p.value) : num(p.value)}
      </div>
    </div>
  );
}

export default function ObservabilityPage() {
  const { data: obs, isLoading: obsLoading, refetch: refetchObs } = useObservability();
  const { data: costs, isLoading: costsLoading, refetch: refetchCosts } = useCosts();

  const [traces, setTraces] = useState<Trace[] | undefined>(undefined);
  const [tracesLoading, setTracesLoading] = useState(true);

  async function loadTraces() {
    setTracesLoading(true);
    try {
      const rows = await api.get<Trace[]>("/observability/generations?limit=60");
      setTraces(rows);
    } catch {
      setTraces([]);
    } finally {
      setTracesLoading(false);
    }
  }

  useEffect(() => {
    loadTraces();
  }, []);

  const rows: CostRow[] = (costs as CostRow[]) ?? [];

  const topCost = useMemo(
    () =>
      [...rows]
        .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
        .slice(0, 10)
        .map((r) => ({
          label: shortRef(r.model_ref),
          cost: r.cost ?? 0,
          latency: r.avg_latency_ms ?? 0,
          tpc: r.tokens_per_call ?? 0,
        })),
    [rows]
  );

  const avgLatency = obs?.avg_latency_ms ?? obs?.avg_latency ?? 0;

  function refreshAll() {
    refetchObs();
    refetchCosts();
    loadTraces();
  }

  return (
    <div className="space-y-10">
      {/* header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="chip mb-3 !border-accent/40 !bg-accent/10 !text-accent">
            <Radio className="h-3 w-3" /> Live telemetry
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="gradient-text">Observability</span>
          </h1>
          <p className="mt-2 max-w-xl text-zinc-400">
            Every model call, token and dollar across the pipeline — cost, latency and error
            tracing in real time.
          </p>
        </div>
        <button onClick={refreshAll} className="btn-ghost shrink-0">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard
          label="Runs"
          value={<AnimatedNumber value={obs?.runs ?? 0} />}
          icon={<Play className="h-4 w-4" />}
          delay={0.02}
        />
        <StatCard
          label="Active"
          value={<AnimatedNumber value={obs?.active_runs ?? 0} />}
          icon={<Activity className="h-4 w-4" />}
          accent="#10b981"
          delay={0.04}
        />
        <StatCard
          label="Model calls"
          value={<AnimatedNumber value={obs?.generations ?? 0} />}
          icon={<Cpu className="h-4 w-4" />}
          accent="#06b6d4"
          delay={0.06}
        />
        <StatCard
          label="Total tokens"
          value={compactTokens(obs?.total_tokens)}
          icon={<Coins className="h-4 w-4" />}
          accent="#3b82f6"
          delay={0.08}
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
          value={<AnimatedNumber value={avgLatency} suffix="ms" />}
          icon={<Gauge className="h-4 w-4" />}
          accent="#f59e0b"
          delay={0.12}
        />
        <StatCard
          label="Error rate"
          value={pct(obs?.error_rate ?? 0)}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={(obs?.error_rate ?? 0) > 0 ? "#ef4444" : "#8b5cf6"}
          delay={0.14}
        />
      </div>

      {obsLoading && !obs && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {/* charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Cost by model" subtitle="Top 10 spenders across all generations">
          <Card>
            {costsLoading && !costs ? (
              <Skeleton className="h-72" />
            ) : topCost.length === 0 ? (
              <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No cost data yet">
                Run a benchmark to start accruing model spend.
              </EmptyState>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topCost}
                    layout="vertical"
                    margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#ffffff10" />
                    <XAxis
                      type="number"
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => money(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={110}
                      tick={{ fill: "#a1a1aa", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "#ffffff08" }}
                      content={<ChartTooltip unit="cost" />}
                    />
                    <Bar dataKey="cost" radius={[0, 6, 6, 0]} maxBarSize={20}>
                      {topCost.map((_, i) => (
                        <Cell key={i} fill={ACCENT} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Section>

        <Section title="Avg latency by model" subtitle="Mean response time per model call">
          <Card>
            {costsLoading && !costs ? (
              <Skeleton className="h-72" />
            ) : topCost.length === 0 ? (
              <EmptyState icon={<Clock className="h-8 w-8" />} title="No latency data yet">
                Latency populates once models start responding.
              </EmptyState>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topCost}
                    layout="vertical"
                    margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#ffffff10" />
                    <XAxis
                      type="number"
                      tick={{ fill: "#71717a", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => ms(v)}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={110}
                      tick={{ fill: "#a1a1aa", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip cursor={{ fill: "#ffffff08" }} content={<ChartTooltip unit="ms" />} />
                    <Bar dataKey="latency" radius={[0, 6, 6, 0]} maxBarSize={20}>
                      {topCost.map((_, i) => (
                        <Cell key={i} fill={CYAN} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Section>
      </div>

      {/* cost / latency table */}
      <Section title="Cost & latency breakdown" subtitle="Per-model usage across the pipeline">
        <Card className="!p-0">
          {costsLoading && !costs ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={<Coins className="h-8 w-8" />} title="No usage recorded">
              Model usage will appear here after your first run.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-zinc-500">
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 text-right font-medium">Calls</th>
                    <th className="px-4 py-3 text-right font-medium">Prompt</th>
                    <th className="px-4 py-3 text-right font-medium">Completion</th>
                    <th className="px-4 py-3 text-right font-medium">Cost</th>
                    <th className="px-4 py-3 text-right font-medium">Avg latency</th>
                    <th className="px-4 py-3 text-right font-medium">Errors</th>
                    <th className="px-4 py-3 text-right font-medium">Tok/call</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows]
                    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
                    .map((r, i) => (
                      <motion.tr
                        key={r.model_ref}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.4) }}
                        className="border-b border-line/60 last:border-0 hover:bg-white/[0.03]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <ModelAvatar refId={r.model_ref} size={26} />
                            <span className="truncate font-medium">
                              {r.display_name ?? shortRef(r.model_ref)}
                            </span>
                          </div>
                        </td>
                        <td className="stat-num px-4 py-3 text-right text-zinc-300">
                          {num(r.calls)}
                        </td>
                        <td className="stat-num px-4 py-3 text-right text-zinc-400">
                          {compactTokens(r.prompt_tokens)}
                        </td>
                        <td className="stat-num px-4 py-3 text-right text-zinc-400">
                          {compactTokens(r.completion_tokens)}
                        </td>
                        <td className="stat-num px-4 py-3 text-right font-semibold text-emerald-400">
                          {money(r.cost)}
                        </td>
                        <td className="stat-num px-4 py-3 text-right text-zinc-300">
                          {ms(r.avg_latency_ms)}
                        </td>
                        <td
                          className={cn(
                            "stat-num px-4 py-3 text-right",
                            (r.error_rate ?? 0) > 0 ? "text-red-400" : "text-zinc-500"
                          )}
                        >
                          {pct(r.error_rate ?? 0)}
                        </td>
                        <td className="stat-num px-4 py-3 text-right text-zinc-300">
                          {num(r.tokens_per_call)}
                        </td>
                      </motion.tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>

      {/* recent traces */}
      <Section
        title="Recent traces"
        subtitle="Last 60 model generations"
        action={
          <button onClick={loadTraces} className="text-sm text-accent hover:underline">
            <RefreshCw className="mr-1 inline h-3 w-3" /> Refresh
          </button>
        }
      >
        <Card className="!p-0">
          {tracesLoading && !traces ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : !traces || traces.length === 0 ? (
            <EmptyState icon={<Zap className="h-8 w-8" />} title="No generations yet">
              Traces stream in as models are called.
            </EmptyState>
          ) : (
            <div className="divide-y divide-line">
              {traces.map((t, i) => {
                const ok = t.status !== "error" && !t.error;
                const tokens = (t.prompt_tokens ?? 0) + (t.completion_tokens ?? 0);
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.5) }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        ok ? "bg-emerald-400" : "bg-red-400"
                      )}
                      style={{ boxShadow: ok ? "0 0 8px #10b98188" : "0 0 8px #ef444488" }}
                    />
                    <ModelAvatar refId={t.model_ref} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{shortRef(t.model_ref)}</div>
                      {t.error ? (
                        <div className="truncate text-xs text-red-400/80">{t.error}</div>
                      ) : (
                        <div className="text-xs text-zinc-500">{timeAgo(t.created_at)}</div>
                      )}
                    </div>
                    <span className="chip hidden shrink-0 sm:inline-flex">{t.provider}</span>
                    <span className="hidden w-16 shrink-0 text-xs capitalize text-zinc-500 md:block">
                      {t.kind}
                    </span>
                    <span className="stat-num hidden w-16 shrink-0 text-right text-xs text-zinc-400 sm:block">
                      {compactTokens(tokens)}
                    </span>
                    <span className="stat-num w-16 shrink-0 text-right text-xs text-zinc-300">
                      {ms(t.latency_ms)}
                    </span>
                    <span className="stat-num w-16 shrink-0 text-right text-xs text-emerald-400">
                      {money(t.cost)}
                    </span>
                    <span
                      className={cn(
                        "hidden w-14 shrink-0 text-right text-xs font-medium lg:block",
                        ok ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {ok ? "ok" : "error"}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}
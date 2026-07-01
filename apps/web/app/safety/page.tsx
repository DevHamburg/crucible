"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ChevronDown,
  Info,
  Layers,
  Loader2,
  MessageSquare,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  useCreateSafetyRun,
  useModels,
  useRun,
  useSafetyCategories,
  useSafetyLeaderboard,
  useSafetyReport,
} from "@/lib/hooks";
import { pct, timeAgo } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { SafetyReportRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnimatedNumber, ModelAvatar, RankMedal, StatusPill } from "@/components/ui/bits";
import {
  Card,
  EmptyState,
  Progress,
  Section,
  Skeleton,
  Spinner,
  Toggle,
} from "@/components/ui/primitives";
import { ModelPicker } from "@/components/ModelPicker";

const RED = "#ef4444";
const DEFAULT_ATTACKER = "mock/redteam-adaptive";

/** interpolate a red heat background from a 0..1 jailbreak rate */
function heat(rate: number) {
  const a = Math.min(0.85, Math.max(0.04, rate));
  return {
    background: `rgba(239,68,68,${a})`,
    borderColor: `rgba(239,68,68,${Math.min(0.6, a + 0.15)})`,
    color: rate > 0.45 ? "#fff" : "#fca5a5",
  };
}

export default function SafetyPage() {
  return (
    <Suspense fallback={null}>
      <SafetyRouter />
    </Suspense>
  );
}

function SafetyRouter() {
  const params = useSearchParams();
  const runId = params.get("run");
  return runId ? <SafetyReportView runId={runId} /> : <SafetyConfigView />;
}

/* ------------------------------------------------------------------ */
/* Shared header                                                       */
/* ------------------------------------------------------------------ */

function SafetyHero({ subtitle }: { subtitle: string }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line p-8 sm:p-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, rgba(239,68,68,0.16) 0%, rgba(239,68,68,0.04) 45%, transparent 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-grid [background-size:44px_44px] opacity-40 [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]" />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative max-w-2xl"
      >
        <div
          className="chip mb-4"
          style={{ borderColor: `${RED}66`, background: `${RED}18`, color: RED }}
        >
          <ShieldAlert className="h-3 w-3" /> Red-Team
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Safety &amp; <span style={{ color: RED }}>Red-Team</span> robustness
        </h1>
        <p className="mt-3 max-w-xl text-zinc-400">{subtitle}</p>
        <div
          className="mt-5 flex items-start gap-2 rounded-xl border p-3 text-xs text-zinc-400"
          style={{ borderColor: `${RED}33`, background: `${RED}0d` }}
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: RED }} />
          <span>
            This is <span className="font-medium text-zinc-200">defensive</span> robustness testing.
            Probes use benign canary goals to measure how reliably a model refuses adversarial
            pressure — no operational harmful content is produced or stored.
          </span>
        </div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* (A) Config mode                                                     */
/* ------------------------------------------------------------------ */

function SafetyConfigView() {
  const router = useRouter();
  const { selected, toggleSelected } = useApp();
  const { data: categories, isLoading: catsLoading } = useSafetyCategories();
  const { data: models } = useModels();
  const createRun = useCreateSafetyRun();

  const [picked, setPicked] = useState<string[]>([]);
  const [adaptive, setAdaptive] = useState(true);
  const [attacker, setAttacker] = useState(DEFAULT_ATTACKER);
  const [maxRounds, setMaxRounds] = useState(4);

  const attackerModels = useMemo(() => {
    const all = (models ?? []).filter((m) => m.role);
    const red = all.filter((m) => /attack|red/i.test(m.role ?? ""));
    return (red.length ? red : all).map((m) => ({ ref: m.ref, name: m.display_name }));
  }, [models]);

  const cats: any[] = categories ?? [];
  const catKey = (c: any) => c.category ?? c.id ?? c.slug ?? c.key;
  const toggleCat = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const canRun = selected.length > 0 && picked.length > 0 && !createRun.isPending;

  async function launch() {
    if (!canRun) return;
    try {
      const run = await createRun.mutateAsync({
        models: selected,
        categories: picked,
        adaptive,
        attacker_model: attacker,
        max_rounds: maxRounds,
      });
      toast.success("Safety suite launched");
      router.replace(`/safety?run=${run.id}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start safety run");
    }
  }

  return (
    <div className="space-y-8">
      <SafetyHero subtitle="Configure a probe suite to stress-test how reliably models refuse jailbreaks across harm categories, then review a robustness leaderboard." />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* configurator */}
        <Section
          className="lg:col-span-3"
          title="Configure a probe run"
          subtitle="Pick targets, harm categories and an attack strategy"
        >
          <Card className="space-y-6">
            {/* targets */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4" style={{ color: RED }} /> Target models
                <span className="text-xs font-normal text-zinc-500">
                  {selected.length} selected
                </span>
              </div>
              <ModelPicker selected={selected} onToggle={toggleSelected} />
            </div>

            {/* categories */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Layers className="h-4 w-4" style={{ color: RED }} /> Harm categories
                <span className="text-xs font-normal text-zinc-500">{picked.length} selected</span>
              </div>
              {catsLoading && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              )}
              {!catsLoading && cats.length === 0 && (
                <p className="text-sm text-zinc-500">No categories available.</p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {cats.map((c, i) => {
                  const k = catKey(c) as string;
                  const active = picked.includes(k);
                  const count = c.probes ?? c.count ?? c.n ?? c.items ?? 0;
                  return (
                    <motion.button
                      key={k}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleCat(k)}
                      className={cn(
                        "flex flex-col gap-1 rounded-xl border p-3 text-left transition-all",
                        active
                          ? "shadow-glow"
                          : "border-line bg-white/[0.02] hover:bg-white/[0.05]"
                      )}
                      style={
                        active
                          ? { borderColor: `${RED}99`, background: `${RED}14` }
                          : undefined
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium capitalize">
                          {c.label ?? k}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: `${RED}1f`, color: RED }}
                        >
                          {count} probes
                        </span>
                      </div>
                      {c.description && (
                        <span className="line-clamp-2 text-[11px] text-zinc-500">
                          {c.description}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* strategy */}
            <div className="space-y-4 rounded-xl border border-line bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Toggle
                    checked={adaptive}
                    onChange={setAdaptive}
                    label="Adaptive red-team (PAIR)"
                  />
                  <p className="mt-1.5 max-w-md text-xs text-zinc-500">
                    Iteratively escalates on benign canary probes — the attacker rewrites its prompt
                    each round based on the target&apos;s response to find the weakest refusal.
                  </p>
                </div>
                <Sparkles className="h-4 w-4 shrink-0" style={{ color: RED }} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                    <Bot className="h-3.5 w-3.5" /> Attacker model
                  </span>
                  <select
                    value={attacker}
                    onChange={(e) => setAttacker(e.target.value)}
                    className="w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-accent/50"
                  >
                    <option value={DEFAULT_ATTACKER}>Adaptive red-teamer (default)</option>
                    {attackerModels
                      .filter((m) => m.ref !== DEFAULT_ATTACKER)
                      .map((m) => (
                        <option key={m.ref} value={m.ref}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>

                <AnimatePresence initial={false}>
                  {adaptive && (
                    <motion.label
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      className="space-y-1.5"
                    >
                      <span className="flex items-center justify-between text-xs font-medium text-zinc-400">
                        <span>Max rounds</span>
                        <span className="stat-num" style={{ color: RED }}>
                          {maxRounds}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={2}
                        max={6}
                        step={1}
                        value={maxRounds}
                        onChange={(e) => setMaxRounds(Number(e.target.value))}
                        className="w-full accent-[#ef4444]"
                      />
                      <div className="flex justify-between text-[10px] text-zinc-600">
                        <span>2</span>
                        <span>6</span>
                      </div>
                    </motion.label>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* launch */}
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-zinc-500">
                {selected.length === 0
                  ? "Select at least one target model."
                  : picked.length === 0
                    ? "Select at least one category."
                    : `${selected.length} model${selected.length > 1 ? "s" : ""} × ${picked.length} categor${picked.length > 1 ? "ies" : "y"}`}
              </p>
              <button
                type="button"
                onClick={launch}
                disabled={!canRun}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-glow transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: RED }}
              >
                {createRun.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Launching…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Run safety suite
                  </>
                )}
              </button>
            </div>
          </Card>
        </Section>

        {/* robustness board */}
        <Section
          className="lg:col-span-2"
          title="Robustness board"
          subtitle="Aggregate refusal reliability"
        >
          <RobustnessBoard />
        </Section>
      </div>
    </div>
  );
}

function RobustnessBoard() {
  const { data, isLoading } = useSafetyLeaderboard();
  const rows = data?.leaderboard ?? [];

  if (isLoading)
    return (
      <Card className="!p-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="m-3 h-12" />
        ))}
      </Card>
    );

  if (rows.length === 0)
    return (
      <EmptyState icon={<Shield className="h-8 w-8" />} title="No safety results yet">
        Run a probe suite to populate the robustness leaderboard.
      </EmptyState>
    );

  return (
    <Card className="divide-y divide-line !p-0">
      {rows.map((r, i) => (
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
            <div className="text-[11px] text-zinc-500">
              jailbreak{" "}
              <span style={{ color: RED }}>{pct(r.jailbreak_rate)}</span> · n={r.n}
            </div>
          </div>
          <div className="text-right">
            <div className="stat-num text-sm font-semibold text-emerald-400">
              {pct(r.robustness)}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-600">robust</div>
          </div>
        </motion.div>
      ))}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* (B) Report mode                                                     */
/* ------------------------------------------------------------------ */

function SafetyReportView({ runId }: { runId: string }) {
  const router = useRouter();
  const [poll, setPoll] = useState(true);
  const { data: run } = useRun(runId, poll);
  const { data: report, isLoading: reportLoading } = useSafetyReport(runId);

  const running = run?.status === "running" || run?.status === "pending";

  useEffect(() => {
    if (run && !running) setPoll(false);
  }, [run, running]);

  const rows: SafetyReportRow[] = (report?.report ?? []).slice().sort(
    (a: SafetyReportRow, b: SafetyReportRow) => a.rank - b.rank
  );

  return (
    <div className="space-y-8">
      <SafetyHero subtitle="Robustness report — how reliably each model held its refusals under adversarial pressure." />

      {/* status bar */}
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {run ? <StatusPill status={run.status} /> : <Spinner />}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{run?.name ?? "Loading run…"}</div>
            {run?.created_at && (
              <div className="text-xs text-zinc-500">{timeAgo(run.created_at)}</div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.replace("/safety")}
          className="btn-ghost self-start sm:self-auto"
        >
          <RotateCcw className="h-4 w-4" /> New run
        </button>
      </Card>

      {running && (
        <Card className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-zinc-300">
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: RED }} /> Probing in
              progress…
            </span>
            <span className="stat-num text-zinc-400">
              {run?.done_items ?? 0}/{run?.total_items ?? 0}
            </span>
          </div>
          <Progress value={run?.progress ?? 0} />
        </Card>
      )}

      {/* robustness cards */}
      <Section title="Robustness by model" subtitle="Per-category jailbreak heatmap">
        {reportLoading && (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        )}
        {!reportLoading && rows.length === 0 && (
          <EmptyState
            icon={<ShieldCheck className="h-8 w-8" />}
            title={running ? "Results incoming" : "No report data"}
          >
            {running
              ? "Scores will appear here as probes complete."
              : "This run produced no safety report rows."}
          </EmptyState>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r, i) => (
            <motion.div
              key={r.model_ref}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="h-full space-y-4">
                <div className="flex items-center gap-3">
                  <RankMedal rank={r.rank} />
                  <ModelAvatar refId={r.model_ref} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {r.display_name ?? r.model_ref}
                    </div>
                    <div className="text-[11px] text-zinc-500">n={r.n} probes</div>
                  </div>
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-3xl font-bold text-emerald-400">
                      <AnimatedNumber value={(r.robustness ?? 0) * 100} decimals={0} suffix="%" />
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                      robustness
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="stat-num text-lg font-semibold" style={{ color: RED }}>
                      {pct(r.jailbreak_rate)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                      jailbreak rate
                    </div>
                  </div>
                </div>

                {/* per-category heat cells */}
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(r.categories ?? {}).map(([cat, v]) => (
                    <div
                      key={cat}
                      className="rounded-lg border px-2 py-1 text-[10px] font-medium capitalize"
                      style={heat(v.jailbreak_rate)}
                      title={`${cat}: ${pct(v.jailbreak_rate)} jailbreak · avg harm ${v.avg_harm?.toFixed?.(1) ?? "–"} · ${v.avg_turns?.toFixed?.(1) ?? "–"} turns · n=${v.n}`}
                    >
                      {cat} {pct(v.jailbreak_rate, 0)}
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* sample jailbreaks */}
      {!running && <SampleJailbreaks runId={runId} />}
    </div>
  );
}

function SampleJailbreaks({ runId }: { runId: string }) {
  const [samples, setSamples] = useState<any[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<any[]>(`/safety/samples/${runId}?only_jailbroken=true`)
      .then((s) => !cancelled && setSamples(s))
      .catch(() => !cancelled && setSamples([]));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (samples === null)
    return (
      <Section title="Sample jailbreaks" subtitle="Successful adversarial probes">
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </Section>
    );

  return (
    <Section
      title="Sample jailbreaks"
      subtitle="Successful adversarial probes — inspect to harden defenses"
    >
      {samples.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="No jailbreaks recorded">
          Every probe in this run was refused. Strong defensive performance.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {samples.map((s, i) => (
            <SampleCard key={i} s={s} index={i} />
          ))}
        </div>
      )}
    </Section>
  );
}

function SampleCard({ s, index }: { s: any; index: number }) {
  const [open, setOpen] = useState(false);
  const transcript: any[] = Array.isArray(s.transcript) ? s.transcript : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      <Card className="!p-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 p-4 text-left"
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={{ background: `${RED}18`, border: `1px solid ${RED}44`, color: RED }}
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium capitalize">{s.category ?? "probe"}</span>
              {s.technique && (
                <span
                  className="chip !px-2 !py-0"
                  style={{ borderColor: `${RED}44`, color: RED, background: `${RED}14` }}
                >
                  {s.technique}
                </span>
              )}
              {s.harm_score != null && (
                <span className="chip !px-2 !py-0 text-[10px]">
                  harm {Number(s.harm_score).toFixed(1)}
                </span>
              )}
              {s.turns != null && (
                <span className="chip !px-2 !py-0 text-[10px]">{s.turns} turns</span>
              )}
            </div>
            {s.goal && <div className="mt-0.5 truncate text-[11px] text-zinc-500">{s.goal}</div>}
          </div>
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-zinc-500">
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-line p-4">
                <Field label="Attack prompt" tone="red" text={s.attack_prompt} />
                <Field label="Model response" text={s.response} />

                {transcript.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      <MessageSquare className="h-3.5 w-3.5" /> Multi-turn transcript
                    </div>
                    <div className="space-y-2">
                      {transcript.map((t, ti) => (
                        <div
                          key={ti}
                          className="rounded-xl border border-line bg-white/[0.02] p-3"
                        >
                          <div className="mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
                            <span>Turn {t.turn ?? ti + 1}</span>
                            {t.jailbroken ? (
                              <span style={{ color: RED }}>jailbroken</span>
                            ) : t.refused ? (
                              <span className="text-emerald-400">refused</span>
                            ) : null}
                          </div>
                          {t.attack && (
                            <p className="text-xs" style={{ color: "#fca5a5" }}>
                              <span className="font-medium">Attack:</span> {t.attack}
                            </p>
                          )}
                          {t.response && (
                            <p className="mt-1 text-xs text-zinc-300">
                              <span className="font-medium">Response:</span> {t.response}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

function Field({ label, text, tone }: { label: string; text?: string; tone?: "red" }) {
  if (!text) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        {tone === "red" ? (
          <ArrowLeft className="h-3.5 w-3.5" style={{ color: RED }} />
        ) : (
          <Shield className="h-3.5 w-3.5" />
        )}
        {label}
      </div>
      <p
        className="whitespace-pre-wrap rounded-xl border border-line bg-white/[0.02] p-3 text-xs text-zinc-300"
        style={tone === "red" ? { borderColor: `${RED}33` } : undefined}
      >
        {text}
      </p>
    </div>
  );
}

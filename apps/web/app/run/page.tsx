"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Boxes,
  CheckCheck,
  Coins,
  Cpu,
  Gauge,
  Hash,
  Layers,
  ListChecks,
  Rocket,
  Scale,
  SlidersHorizontal,
  Sparkles,
  Thermometer,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useBenchmarks, useCreateRun, useModels } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import type { Benchmark } from "@/lib/types";
import { num } from "@/lib/format";
import { cn, domainColor } from "@/lib/utils";
import { AnimatedNumber, DomainBadge } from "@/components/ui/bits";
import { Card, Section, Skeleton, Spinner } from "@/components/ui/primitives";
import { ModelPicker } from "@/components/ModelPicker";

// rough per-item token assumptions used only for the live cost estimate
const EST_IN_TOKENS = 700;
const EST_OUT_TOKENS = 350;
const DEFAULT_JUDGE = "mock/judge-pro";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-lg bg-plasma text-sm font-bold text-white shadow-glow">
      {n}
    </span>
  );
}

export default function NewRunPage() {
  const router = useRouter();
  const { selected, toggleSelected } = useApp();
  const { data: models } = useModels();
  const { data: benchmarks, isLoading: benchLoading } = useBenchmarks();
  const createRun = useCreateRun();

  const [slugs, setSlugs] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(8);
  const [temperature, setTemperature] = useState(0.2);
  const [judge, setJudge] = useState(DEFAULT_JUDGE);
  const [name, setName] = useState("");

  // keep judge valid once models resolve
  useEffect(() => {
    if (!models || models.length === 0) return;
    if (models.some((m) => m.ref === judge)) return;
    const fallback = models.find((m) => m.role === "judge") ?? models[0];
    if (fallback) setJudge(fallback.ref);
  }, [models, judge]);

  const groups = useMemo(() => {
    const g: Record<string, Benchmark[]> = {};
    for (const b of benchmarks ?? []) (g[b.domain] ??= []).push(b);
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [benchmarks]);

  const toggleSlug = (slug: string) =>
    setSlugs((prev) => {
      const next = new Set(prev);
      next.has(slug) ? next.delete(slug) : next.add(slug);
      return next;
    });

  const selectDomain = (list: Benchmark[]) =>
    setSlugs((prev) => {
      const next = new Set(prev);
      const allOn = list.every((b) => next.has(b.slug));
      for (const b of list) (allOn ? next.delete(b.slug) : next.add(b.slug));
      return next;
    });

  const selModels = useMemo(
    () => (models ?? []).filter((m) => selected.includes(m.ref)),
    [models, selected]
  );

  const totalItems = selected.length * slugs.size * limit;

  const estCost = useMemo(() => {
    const perModelItems = slugs.size * limit;
    return selModels.reduce(
      (sum, m) =>
        sum +
        perModelItems *
          ((EST_IN_TOKENS / 1e6) * (m.input_price ?? 0) +
            (EST_OUT_TOKENS / 1e6) * (m.output_price ?? 0)),
      0
    );
  }, [selModels, slugs, limit]);

  const ready = selected.length > 0 && slugs.size > 0;

  async function launch() {
    if (!ready || createRun.isPending) return;
    try {
      const run = await createRun.mutateAsync({
        name: name.trim() || `Run · ${selected.length}m × ${slugs.size}b`,
        models: selected,
        benchmarks: [...slugs],
        limit,
        temperature,
        judge_model: judge,
      });
      toast.success("Run launched — igniting the crucible");
      router.push("/runs/" + run.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to launch run");
    }
  }

  return (
    <div className="pb-28">
      {/* header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mb-8 overflow-hidden rounded-3xl border border-line bg-plasma-radial p-8"
      >
        <div className="pointer-events-none absolute inset-0 bg-grid [background-size:44px_44px] opacity-40 [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]" />
        <div className="relative">
          <div className="chip mb-3 !border-accent/40 !bg-accent/10 !text-accent">
            <Sparkles className="h-3 w-3" /> New evaluation run
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Build a <span className="gradient-text">benchmark run</span>.
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">
            Pick your contenders, choose the suites, tune the parameters — then launch and watch
            the scores stream in live.
          </p>
        </div>
      </motion.div>

      <div className="space-y-6">
        {/* STEP 1 — models */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}>
          <Card>
            <Section
              title="Pick models"
              subtitle="Every selected model runs against every chosen benchmark"
              action={
                <span className="chip">
                  <Cpu className="h-3 w-3" /> {selected.length} selected
                </span>
              }
            >
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <StepBadge n={1} /> Contenders
              </div>
              <ModelPicker selected={selected} onToggle={toggleSelected} />
            </Section>
          </Card>
        </motion.div>

        {/* STEP 2 — benchmarks */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card>
            <Section
              title="Pick benchmarks"
              subtitle="Toggle suites, or select a whole domain at once"
              action={
                <button
                  onClick={() => setSlugs(new Set())}
                  disabled={slugs.size === 0}
                  className="chip transition-colors hover:!text-white disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" /> Clear all
                </button>
              }
            >
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <StepBadge n={2} /> {slugs.size} suite{slugs.size === 1 ? "" : "s"} chosen
              </div>

              {benchLoading && (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              )}

              <div className="space-y-6">
                {groups.map(([domain, list], gi) => {
                  const c = domainColor(domain);
                  const allOn = list.every((b) => slugs.has(b.slug));
                  return (
                    <motion.div
                      key={domain}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: gi * 0.04 }}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <DomainBadge domain={domain} />
                        <button
                          onClick={() => selectDomain(list)}
                          className={cn("chip transition-colors", allOn && "!border-accent/60 !bg-accent/10 !text-accent")}
                        >
                          <CheckCheck className="h-3 w-3" /> {allOn ? "Deselect" : "Select all"}
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {list.map((b) => {
                          const active = slugs.has(b.slug);
                          return (
                            <motion.button
                              key={b.slug}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => toggleSlug(b.slug)}
                              className={cn(
                                "relative flex flex-col gap-1 rounded-xl border p-3 text-left transition-all",
                                active
                                  ? "border-accent/60 bg-accent/10 shadow-glow"
                                  : "border-line bg-white/[0.02] hover:bg-white/[0.05]"
                              )}
                              style={active ? { borderColor: `${c}88`, boxShadow: `0 0 24px -8px ${c}` } : undefined}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium">{b.name}</span>
                                <span
                                  className={cn(
                                    "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                                    active ? "border-transparent" : "border-line"
                                  )}
                                  style={active ? { background: c } : undefined}
                                >
                                  {active && <CheckCheck className="h-2.5 w-2.5 text-black" />}
                                </span>
                              </div>
                              <span className="text-[11px] text-zinc-500">
                                {b.num_items} items · {b.task_type}
                              </span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </Section>
          </Card>
        </motion.div>

        {/* STEP 3 — parameters */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card>
            <Section title="Parameters" subtitle="Dial in scale, sampling and the judge">
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-300">
                <StepBadge n={3} /> Tuning
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                  {/* run name */}
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                      <Wand2 className="h-3.5 w-3.5" /> Run name
                    </span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Frontier logic showdown…"
                      className="w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:border-accent/50"
                    />
                  </label>

                  {/* items slider */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                        <Hash className="h-3.5 w-3.5" /> Items per benchmark
                      </span>
                      <span className="stat-num text-sm font-semibold text-accent">{limit}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      className="w-full accent-[#8b5cf6]"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
                      <span>1</span>
                      <span>50</span>
                    </div>
                  </div>

                  {/* temperature slider */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                        <Thermometer className="h-3.5 w-3.5" /> Temperature
                      </span>
                      <span className="stat-num text-sm font-semibold text-cyan">{temperature.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={temperature}
                      onChange={(e) => setTemperature(Number(e.target.value))}
                      className="w-full accent-[#06b6d4]"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
                      <span>precise</span>
                      <span>creative</span>
                    </div>
                  </div>

                  {/* judge model */}
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                      <Scale className="h-3.5 w-3.5" /> Judge model
                    </span>
                    <select
                      value={judge}
                      onChange={(e) => setJudge(e.target.value)}
                      className="w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-accent/50"
                    >
                      {!models && <option value={judge}>{judge}</option>}
                      {(models ?? []).map((m) => (
                        <option key={m.ref} value={m.ref} className="bg-surface">
                          {m.display_name}
                          {m.simulated ? " (sim)" : ""}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11px] text-zinc-500">
                      Grades open-ended responses where scoring isn&apos;t deterministic.
                    </span>
                  </label>
                </div>

                {/* live estimate */}
                <div className="border-plasma rounded-2xl p-[1px]">
                  <div className="flex h-full flex-col justify-between gap-5 rounded-2xl bg-surface/60 p-5">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                        <Boxes className="h-3.5 w-3.5" /> Total items to evaluate
                      </div>
                      <div className="mt-1 text-5xl font-bold gradient-text">
                        <AnimatedNumber value={totalItems} />
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {selected.length} models × {slugs.size} benchmarks × {limit} items
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-line bg-white/[0.02] p-3">
                        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-400">
                          <Coins className="h-3.5 w-3.5" /> Est. cost
                        </div>
                        <div className="stat-num mt-1 text-lg font-semibold text-emerald-400">
                          <AnimatedNumber value={estCost} decimals={estCost < 1 ? 3 : 2} prefix="$" />
                        </div>
                      </div>
                      <div className="rounded-xl border border-line bg-white/[0.02] p-3">
                        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-400">
                          <Gauge className="h-3.5 w-3.5" /> Model calls
                        </div>
                        <div className="stat-num mt-1 text-lg font-semibold text-cyan">
                          {num(totalItems)}
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] leading-relaxed text-zinc-600">
                      Cost is a rough forecast (~{EST_IN_TOKENS}in / {EST_OUT_TOKENS}out tokens per item)
                      based on selected model pricing. Actuals depend on prompt length and outputs.
                    </p>
                  </div>
                </div>
              </div>
            </Section>
          </Card>
        </motion.div>
      </div>

      {/* sticky launch footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5 text-zinc-300">
              <Cpu className="h-4 w-4 text-accent" />
              <span className="stat-num font-semibold">{selected.length}</span> models
            </span>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <ListChecks className="h-4 w-4 text-cyan" />
              <span className="stat-num font-semibold">{slugs.size}</span> benchmarks
            </span>
            <span className="text-zinc-600">·</span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <Layers className="h-4 w-4 text-emerald-400" />
              <span className="stat-num font-semibold">{num(totalItems)}</span> items
            </span>
          </div>

          <div className="flex items-center gap-3">
            <AnimatePresence>
              {!ready && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="hidden text-xs text-zinc-500 sm:block"
                >
                  <SlidersHorizontal className="mr-1 inline h-3 w-3" />
                  Pick at least one model and benchmark
                </motion.span>
              )}
            </AnimatePresence>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={launch}
              disabled={!ready || createRun.isPending}
              className="btn-primary px-6 py-2.5 text-base"
            >
              {createRun.isPending ? (
                <>
                  <Spinner /> Launching…
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4" /> Launch run
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}

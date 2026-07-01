"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronDown,
  Cpu,
  Crown,
  Flame,
  History,
  MessageSquare,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useCreateTournament, useMatches, useModels } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import type { MatchResult, Model } from "@/lib/types";
import { money, timeAgo } from "@/lib/format";
import { cn, domainColor } from "@/lib/utils";
import { DomainBadge, ModelAvatar } from "@/components/ui/bits";
import { Card, EmptyState, Section, Spinner } from "@/components/ui/primitives";
import { ModelPicker } from "@/components/ModelPicker";

type Mode = "duel" | "debate" | "tournament";

const DOMAINS = ["logic", "software", "business", "marketing", "psychology", "trading", "mixed"];

const MODES: { id: Mode; label: string; icon: any }[] = [
  { id: "duel", label: "Duel", icon: Swords },
  { id: "debate", label: "Debate", icon: MessageSquare },
  { id: "tournament", label: "Tournament", icon: Trophy },
];

/* ------------------------------------------------------------------ */
/* Compact model dropdown                                              */
/* ------------------------------------------------------------------ */
function ModelSelect({
  models,
  value,
  onChange,
  accent = "#8b5cf6",
}: {
  models: Model[];
  value: string;
  onChange: (ref: string) => void;
  accent?: string;
}) {
  const [open, setOpen] = useState(false);
  const sel = models.find((m) => m.ref === value);
  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none transition-colors hover:border-white/20 focus:border-accent/50"
      >
        {sel ? (
          <ModelAvatar refId={sel.ref} size={22} />
        ) : (
          <span
            className="grid h-[22px] w-[22px] place-items-center rounded-lg"
            style={{ color: accent }}
          >
            <Cpu className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="flex-1 truncate text-left">{sel?.display_name ?? "Select model"}</span>
        <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="card absolute z-20 mt-1 max-h-64 w-full overflow-auto !p-1"
            >
              {models.map((m) => {
                const active = m.ref === value;
                return (
                  <button
                    key={m.ref}
                    type="button"
                    onClick={() => {
                      onChange(m.ref);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/5",
                      active && "bg-accent/10 text-accent"
                    )}
                  >
                    <ModelAvatar refId={m.ref} size={20} />
                    <span className="min-w-0 flex-1 truncate">{m.display_name}</span>
                    {m.simulated && <span className="chip !px-1.5 !py-0 text-[9px] !text-cyan">SIM</span>}
                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
              {models.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-zinc-500">No models</div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Response card (duel result)                                         */
/* ------------------------------------------------------------------ */
function ResponseCard({
  side,
  refId,
  text,
  winner,
  delay,
}: {
  side: "A" | "B";
  refId: string;
  text: string;
  winner: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: side === "A" ? -24 : 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, type: "spring", stiffness: 120, damping: 18 }}
      className={cn(
        "card relative flex flex-col gap-3 !p-4 transition-all",
        winner ? "border-accent/60 shadow-glow" : "border-line"
      )}
    >
      {winner && (
        <span className="chip absolute -top-3 left-4 !border-accent/60 !bg-plasma !text-white">
          <Trophy className="h-3 w-3" /> Winner
        </span>
      )}
      <div className="flex items-center gap-2">
        <ModelAvatar refId={refId} size={26} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{refId.split("/").pop()}</div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Fighter {side}</div>
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{text}</p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* VS animation                                                        */
/* ------------------------------------------------------------------ */
function VersusArena({ a, b, active }: { a: string; b: string; active: boolean }) {
  return (
    <div className="relative grid grid-cols-3 items-center gap-4 rounded-2xl border border-line bg-plasma-radial p-6">
      <div className="pointer-events-none absolute inset-0 bg-grid [background-size:32px_32px] opacity-30" />
      <motion.div
        className="relative flex flex-col items-center gap-2"
        animate={active ? { x: [0, 6, 0] } : { x: 0 }}
        transition={{ repeat: active ? Infinity : 0, duration: 0.8 }}
      >
        {a ? <ModelAvatar refId={a} size={56} /> : <div className="h-14 w-14 rounded-lg bg-white/5" />}
        <span className="max-w-[9rem] truncate text-xs text-zinc-400">{a.split("/").pop() ?? "—"}</span>
      </motion.div>

      <div className="relative flex justify-center">
        <motion.div
          animate={active ? { scale: [1, 1.25, 1], rotate: [0, -6, 6, 0] } : { scale: 1 }}
          transition={{ repeat: active ? Infinity : 0, duration: 0.7 }}
          className="grid h-14 w-14 place-items-center rounded-full bg-plasma text-lg font-black text-white shadow-glow"
        >
          VS
        </motion.div>
        {active && (
          <span className="absolute inset-0 -z-0 animate-ping rounded-full bg-accent/40" />
        )}
      </div>

      <motion.div
        className="relative flex flex-col items-center gap-2"
        animate={active ? { x: [0, -6, 0] } : { x: 0 }}
        transition={{ repeat: active ? Infinity : 0, duration: 0.8 }}
      >
        {b ? <ModelAvatar refId={b} size={56} /> : <div className="h-14 w-14 rounded-lg bg-white/5" />}
        <span className="max-w-[9rem] truncate text-xs text-zinc-400">{b.split("/").pop() ?? "—"}</span>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Winner banner                                                       */
/* ------------------------------------------------------------------ */
function WinnerBanner({ result, delay = 0 }: { result: MatchResult; delay?: number }) {
  const tie = result.winner === "tie";
  const winRef = result.winner === "a" ? result.model_a : result.model_b;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="card flex flex-col gap-3 !p-5"
    >
      <div className="flex items-center gap-3">
        {tie ? (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-zinc-300">
            <Zap className="h-4 w-4" />
          </span>
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-plasma text-white shadow-glow">
            <Crown className="h-4 w-4" />
          </span>
        )}
        <div>
          <div className="text-sm font-semibold">
            {tie ? "It's a draw" : <span className="gradient-text">{winRef.split("/").pop()} wins</span>}
          </div>
          <div className="text-xs text-zinc-500">
            Judged by {result.judge_model?.split("/").pop() ?? "referee"} · {money(result.cost)}
          </div>
        </div>
      </div>
      {result.rationale && (
        <p className="rounded-xl border border-line bg-white/[0.02] p-3 text-sm leading-relaxed text-zinc-300">
          {result.rationale}
        </p>
      )}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function ArenaPage() {
  const router = useRouter();
  const { data: models } = useModels();
  const { data: matches } = useMatches();
  const { selected, toggleSelected } = useApp();
  const createTournament = useCreateTournament();

  const [mode, setMode] = useState<Mode>("duel");
  const [domain, setDomain] = useState("logic");
  const [modelA, setModelA] = useState("");
  const [modelB, setModelB] = useState("");

  // duel
  const [prompt, setPrompt] = useState("");
  const [fighting, setFighting] = useState(false);
  const [match, setMatch] = useState<MatchResult | null>(null);

  // debate
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(3);
  const [debating, setDebating] = useState(false);
  const [debate, setDebate] = useState<MatchResult | null>(null);

  // tournament
  const [tName, setTName] = useState("");
  const [bestOf, setBestOf] = useState(3);

  // placeholders
  const [promptPh, setPromptPh] = useState("");
  const [topicPh, setTopicPh] = useState("");

  const pickable = useMemo(() => (models ?? []).filter((m) => !m.role), [models]);

  // seed default fighters
  useEffect(() => {
    if (pickable.length && !modelA) setModelA(pickable[0].ref);
    if (pickable.length > 1 && !modelB) setModelB(pickable[1].ref);
  }, [pickable, modelA, modelB]);

  // fetch prompt / topic placeholders per domain
  useEffect(() => {
    let active = true;
    api
      .get<any>(`/arena/prompts?domain=${domain}`)
      .then((r) => {
        if (!active) return;
        setPromptPh(r?.prompts?.[0] ?? "");
        setTopicPh(r?.topics?.[0] ?? "");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [domain]);

  const bothPicked = !!modelA && !!modelB && modelA !== modelB;

  async function fight() {
    if (!bothPicked) {
      toast.error("Pick two different models");
      return;
    }
    setFighting(true);
    setMatch(null);
    try {
      const r = await api.post<MatchResult>("/arena/match", {
        model_a: modelA,
        model_b: modelB,
        domain,
        prompt: prompt.trim() || undefined,
      });
      setMatch(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Match failed");
    } finally {
      setFighting(false);
    }
  }

  async function startDebate() {
    if (!bothPicked) {
      toast.error("Pick two different models");
      return;
    }
    setDebating(true);
    setDebate(null);
    try {
      const r = await api.post<MatchResult>("/arena/debate", {
        model_a: modelA,
        model_b: modelB,
        domain,
        topic: topic.trim() || undefined,
        rounds,
      });
      setDebate(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Debate failed");
    } finally {
      setDebating(false);
    }
  }

  async function createT() {
    if (selected.length < 2) {
      toast.error("Select at least 2 models");
      return;
    }
    try {
      const t = await createTournament.mutateAsync({
        name: tName.trim() || `${domain} tournament`,
        models: selected,
        domain,
        best_of: bestOf,
      });
      toast.success("Tournament created");
      router.push("/arena/tournament/" + t.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create tournament");
    }
  }

  return (
    <div className="space-y-10">
      {/* header */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-plasma-radial p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid [background-size:44px_44px] opacity-40 [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]" />
        <div className="relative flex flex-col gap-4">
          <div className="chip w-fit !border-accent/40 !bg-accent/10 !text-accent">
            <Flame className="h-3 w-3" /> Head-to-head arena
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Send models <span className="gradient-text">into battle</span>.
          </h1>
          <p className="max-w-xl text-sm text-zinc-400">
            Pit any two models in a duel or debate, or run a full best-of bracket. A judge model
            calls every round.
          </p>

          {/* mode segmented control */}
          <div className="mt-2 inline-flex w-fit gap-1 rounded-2xl border border-line bg-white/[0.03] p-1">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "relative flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                    active ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="arena-mode"
                      className="absolute inset-0 rounded-xl bg-plasma shadow-glow"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className="relative h-4 w-4" />
                  <span className="relative">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* fighter selection (duel + debate) */}
      {mode !== "tournament" && (
        <Card className="!p-5">
          <div className="grid items-end gap-4 md:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-zinc-500">Fighter A</label>
              <ModelSelect models={pickable} value={modelA} onChange={setModelA} accent="#8b5cf6" />
            </div>
            <div className="grid h-9 w-9 place-items-center justify-self-center rounded-full bg-plasma text-xs font-black text-white shadow-glow">
              VS
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-zinc-500">Fighter B</label>
              <ModelSelect models={pickable} value={modelB} onChange={setModelB} accent="#06b6d4" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500">Domain</span>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm capitalize outline-none focus:border-accent/50"
            >
              {DOMAINS.map((d) => (
                <option key={d} value={d} className="bg-surface capitalize">
                  {d}
                </option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {/* ---------------- DUEL ---------------- */}
      {mode === "duel" && (
        <Section title="Duel" subtitle="Same prompt, both models answer, a judge picks the winner">
          <Card className="space-y-4 !p-5">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder={promptPh || "Optional custom prompt — leave blank for a random challenge…"}
              className="w-full resize-none rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-accent/50"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                {prompt.trim() ? "Custom prompt" : "Random prompt from the pool"}
              </span>
              <button onClick={fight} disabled={fighting || !bothPicked} className="btn-primary disabled:opacity-40">
                {fighting ? <Spinner /> : <Swords className="h-4 w-4" />}
                {fighting ? "Fighting…" : "Fight"}
              </button>
            </div>
          </Card>

          <AnimatePresence mode="wait">
            {fighting && (
              <motion.div key="vs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <VersusArena a={modelA} b={modelB} active />
              </motion.div>
            )}
            {!fighting && match && (
              <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                {match.prompt && (
                  <div className="rounded-xl border border-line bg-white/[0.02] p-3 text-sm text-zinc-400">
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500">Prompt</span>
                    <p className="mt-1 text-zinc-300">{match.prompt}</p>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <ResponseCard
                    side="A"
                    refId={match.model_a}
                    text={match.response_a}
                    winner={match.winner === "a"}
                    delay={0.05}
                  />
                  <ResponseCard
                    side="B"
                    refId={match.model_b}
                    text={match.response_b}
                    winner={match.winner === "b"}
                    delay={0.12}
                  />
                </div>
                <WinnerBanner result={match} delay={0.2} />
              </motion.div>
            )}
            {!fighting && !match && (
              <VersusArena a={modelA} b={modelB} active={false} />
            )}
          </AnimatePresence>
        </Section>
      )}

      {/* ---------------- DEBATE ---------------- */}
      {mode === "debate" && (
        <Section title="Debate" subtitle="Multi-round argument — models trade rebuttals, judge scores the exchange">
          <Card className="space-y-4 !p-5">
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={2}
              placeholder={topicPh || "Optional debate topic — leave blank for a random motion…"}
              className="w-full resize-none rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-accent/50"
            />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-1 items-center gap-3">
                <span className="text-[11px] uppercase tracking-wider text-zinc-500">Rounds</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                  className="flex-1 accent-[#8b5cf6]"
                />
                <span className="stat-num w-6 text-center text-sm">{rounds}</span>
              </div>
              <button onClick={startDebate} disabled={debating || !bothPicked} className="btn-primary disabled:opacity-40">
                {debating ? <Spinner /> : <MessageSquare className="h-4 w-4" />}
                {debating ? "Debating…" : "Start debate"}
              </button>
            </div>
          </Card>

          <AnimatePresence mode="wait">
            {debating && (
              <motion.div key="vs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <VersusArena a={modelA} b={modelB} active />
              </motion.div>
            )}
            {!debating && debate && (
              <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                {debate.topic && (
                  <div className="rounded-xl border border-line bg-white/[0.02] p-3 text-center text-sm">
                    <span className="text-[11px] uppercase tracking-wider text-zinc-500">Motion</span>
                    <p className="mt-1 text-zinc-200">{debate.topic}</p>
                  </div>
                )}
                <div className="space-y-3">
                  {(debate.rounds ?? []).map((r: any, i: number) => {
                    const isA = r.speaker === "a";
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: isA ? -20 : 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className={cn("flex", isA ? "justify-start" : "justify-end")}
                      >
                        <div className={cn("flex max-w-[80%] gap-2", isA ? "flex-row" : "flex-row-reverse")}>
                          <ModelAvatar refId={r.model ?? (isA ? debate.model_a : debate.model_b)} size={28} />
                          <div
                            className={cn(
                              "card !p-3",
                              isA ? "border-accent/40" : "border-cyan/40"
                            )}
                          >
                            <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
                              <span>Round {r.round}</span>
                              <span>·</span>
                              <span>{isA ? "A" : "B"}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{r.text}</p>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <WinnerBanner result={debate} delay={0.15} />
              </motion.div>
            )}
            {!debating && !debate && (
              <VersusArena a={modelA} b={modelB} active={false} />
            )}
          </AnimatePresence>
        </Section>
      )}

      {/* ---------------- TOURNAMENT ---------------- */}
      {mode === "tournament" && (
        <Section title="Tournament" subtitle="Best-of bracket — up to 8 contenders fight for the crown">
          <Card className="space-y-4 !p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-zinc-500">Name</label>
                <input
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  placeholder={`${domain} tournament`}
                  className="w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-accent/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-wider text-zinc-500">Domain</label>
                <select
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm capitalize outline-none focus:border-accent/50"
                >
                  {DOMAINS.map((d) => (
                    <option key={d} value={d} className="bg-surface capitalize">
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] uppercase tracking-wider text-zinc-500">Best of</span>
              <input
                type="range"
                min={1}
                max={5}
                value={bestOf}
                onChange={(e) => setBestOf(Number(e.target.value))}
                className="flex-1 accent-[#8b5cf6]"
              />
              <span className="stat-num w-6 text-center text-sm">{bestOf}</span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
                  <Users className="h-3.5 w-3.5" /> Contenders
                </span>
                <span className="text-xs text-zinc-500">{selected.length} / 8 selected</span>
              </div>
              <ModelPicker selected={selected} onToggle={toggleSelected} max={8} />
            </div>

            <button
              onClick={createT}
              disabled={createTournament.isPending || selected.length < 2}
              className="btn-primary w-full justify-center disabled:opacity-40"
            >
              {createTournament.isPending ? <Spinner /> : <Trophy className="h-4 w-4" />}
              {createTournament.isPending ? "Seeding bracket…" : "Create tournament"}
            </button>
          </Card>
        </Section>
      )}

      {/* ---------------- RECENT BATTLES ---------------- */}
      <Section title="Recent battles" subtitle="Latest arena results" >
        {!matches ? (
          <div className="grid gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <EmptyState icon={<History className="h-6 w-6" />} title="No battles yet">
            Run a duel or debate to fill the arena history.
          </EmptyState>
        ) : (
          <div className="grid gap-2">
            {matches.slice(0, 12).map((m: any, i: number) => {
              const winA = m.winner === "a";
              const winB = m.winner === "b";
              return (
                <motion.div
                  key={m.id ?? i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="card flex items-center gap-3 !p-3"
                >
                  <div className="flex flex-1 items-center gap-2">
                    <div className={cn("flex items-center gap-1.5", winA && "text-accent")}>
                      <ModelAvatar refId={m.model_a} size={24} />
                      <span className="hidden truncate text-sm font-medium sm:inline">
                        {m.model_a?.split("/").pop()}
                      </span>
                      {winA && <Trophy className="h-3.5 w-3.5" />}
                    </div>
                    <span className="text-xs font-bold text-zinc-600">vs</span>
                    <div className={cn("flex items-center gap-1.5", winB && "text-cyan")}>
                      {winB && <Trophy className="h-3.5 w-3.5" />}
                      <span className="hidden truncate text-sm font-medium sm:inline">
                        {m.model_b?.split("/").pop()}
                      </span>
                      <ModelAvatar refId={m.model_b} size={24} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.kind === "debate" ? (
                      <span className="chip !py-0.5 text-[10px]">
                        <MessageSquare className="h-3 w-3" /> debate
                      </span>
                    ) : (
                      <span className="chip !py-0.5 text-[10px]">
                        <Swords className="h-3 w-3" /> duel
                      </span>
                    )}
                    {m.domain && <DomainBadge domain={m.domain} />}
                    {m.winner === "tie" && (
                      <span className="chip !py-0.5 text-[10px] !text-zinc-400">
                        <Sparkles className="h-3 w-3" /> draw
                      </span>
                    )}
                    <span className="hidden text-xs text-zinc-500 md:inline">{timeAgo(m.created_at)}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}
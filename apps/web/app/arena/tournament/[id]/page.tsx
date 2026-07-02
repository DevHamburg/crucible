"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Crown, Swords, Trophy, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useModels, useTournament } from "@/lib/hooks";
import { subscribe } from "@/lib/api";
import { DomainBadge, LiveDot, ModelAvatar, StatusPill } from "@/components/ui/bits";
import { Card, EmptyState, Section, Skeleton } from "@/components/ui/primitives";
import { cn, domainColor } from "@/lib/utils";

type BracketMatch = {
  a?: string | null;
  b?: string | null;
  winner?: string | null;
  wins_a?: number;
  wins_b?: number;
  bye?: boolean;
};
type BracketRound = { round: number; matches: BracketMatch[] };

function roundLabel(round: number, total: number) {
  const fromEnd = total - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinal";
  if (fromEnd === 2) return "Quarterfinal";
  return `Round ${round}`;
}

export default function TournamentBracketPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const { data: tournament, isLoading, isError, refetch } = useTournament(id, true);
  const { data: models } = useModels();

  const [live, setLive] = useState<{
    round?: number;
    a?: string;
    b?: string;
    winner?: string;
    wins_a?: number;
    wins_b?: number;
  } | null>(null);

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  // Coalesce refetches: match_progress fires once per best-of game, but the bracket only
  // needs to be re-pulled occasionally while games stream in.
  const lastRefetch = useRef(0);
  const debouncedRefetch = () => {
    const now = Date.now();
    if (now - lastRefetch.current > 1500) {
      lastRefetch.current = now;
      refetchRef.current?.();
    }
  };

  useEffect(() => {
    if (!id) return;
    const unsub = subscribe(`/arena/tournaments/${id}/stream`, (ev: any) => {
      if (ev?.type === "match_progress" || ev?.type === "match_completed") {
        setLive({
          round: ev.round,
          a: ev.a,
          b: ev.b,
          winner: ev.winner,
          wins_a: ev.wins_a,
          wins_b: ev.wins_b,
        });
        debouncedRefetch();
      }
      if (ev?.type === "tournament_completed") {
        setLive(null);
        refetchRef.current?.(); // final pull, not debounced
      }
    });
    return unsub;
  }, [id]);

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    (models ?? []).forEach((m) => map.set(m.ref, m.display_name));
    return (ref?: string | null) => (ref ? map.get(ref) ?? ref : "");
  }, [models]);

  const rounds = (tournament?.bracket?.rounds ?? []) as BracketRound[];
  const totalRounds = rounds.length;
  const status = tournament?.status ?? "pending";
  const running = status === "running" || status === "pending";
  const completed = status === "completed";
  const champion = tournament?.champion;
  const accent = domainColor(tournament?.domain);

  const isActiveMatch = (m: BracketMatch) =>
    !!live &&
    !m.winner &&
    !!m.a &&
    !!m.b &&
    ((live.a === m.a && live.b === m.b) || (live.a === m.b && live.b === m.a));

  if (isError) {
    return (
      <EmptyState icon={<Trophy className="h-8 w-8" />} title="Tournament not found">
        <div className="space-y-3">
          <p>This tournament could not be loaded — it may have been removed or is private.</p>
          <Link href="/arena" className="btn-ghost inline-flex text-sm">
            Back to Arena
          </Link>
        </div>
      </EmptyState>
    );
  }

  if (isLoading || !tournament) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="flex gap-6">
          {[0, 1, 2].map((c) => (
            <div key={c} className="flex flex-col gap-4">
              {Array.from({ length: 4 - c }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-56" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `${accent}18`, border: `1px solid ${accent}44`, color: accent }}
            >
              <Trophy className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight gradient-text">{tournament.name}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {tournament.domain && <DomainBadge domain={tournament.domain} />}
            <span className="chip capitalize">
              <Swords className="mr-1 h-3 w-3" />
              {tournament.format || "single-elim"}
            </span>
            <span className="chip">
              <Users className="mr-1 h-3 w-3" />
              {tournament.models?.length ?? 0} models
            </span>
            <StatusPill status={status} />
            {running && <LiveDot label="live" />}
          </div>
        </div>
        <Link href="/arena" className="btn-ghost text-sm">
          Back to Arena
        </Link>
      </motion.div>

      {/* Live ticker */}
      <AnimatePresence>
        {live && live.a && live.b && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm"
          >
            <Zap className="h-4 w-4 text-accent" />
            <span className="text-zinc-400">Now playing</span>
            <span className="flex items-center gap-2">
              <ModelAvatar refId={live.a} size={22} />
              <span className="font-medium">{nameOf(live.a)}</span>
            </span>
            <span className="font-mono text-xs text-zinc-500">
              {live.wins_a ?? 0} – {live.wins_b ?? 0}
            </span>
            <span className="flex items-center gap-2">
              <ModelAvatar refId={live.b} size={22} />
              <span className="font-medium">{nameOf(live.b)}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Champion hero */}
      <AnimatePresence>
        {completed && champion && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 16 }}
            className="card relative overflow-hidden p-8 text-center"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-30 blur-3xl"
              style={{
                background: `radial-gradient(circle at 50% 0%, ${accent}, transparent 60%)`,
              }}
            />
            {/* confetti-like */}
            {Array.from({ length: 14 }).map((_, i) => {
              const c = ["#8b5cf6", "#06b6d4", "#ec4899", "#f59e0b", "#10b981"][i % 5];
              return (
                <motion.span
                  key={i}
                  className="pointer-events-none absolute top-4 h-2 w-2 rounded-sm"
                  style={{ left: `${(i * 7 + 6) % 100}%`, background: c }}
                  initial={{ y: -20, opacity: 0, rotate: 0 }}
                  animate={{ y: 120, opacity: [0, 1, 0], rotate: 220 }}
                  transition={{
                    duration: 1.6,
                    delay: i * 0.08,
                    repeat: Infinity,
                    repeatDelay: 1.2,
                  }}
                />
              );
            })}
            <div className="relative flex flex-col items-center gap-3">
              <motion.div
                initial={{ rotate: -12, scale: 0.7 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
              >
                <Crown className="h-8 w-8 text-amber-300" style={{ filter: "drop-shadow(0 0 12px #fbbf2499)" }} />
              </motion.div>
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 160, damping: 14, delay: 0.15 }}
              >
                <ModelAvatar refId={champion} size={72} />
              </motion.div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">Champion</div>
              <div className="text-2xl font-semibold">{nameOf(champion)}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bracket */}
      <Section title="Bracket" subtitle="Single-elimination">
        {rounds.length === 0 ? (
          <EmptyState icon={<Swords className="h-8 w-8" />} title="Bracket not seeded yet">
            The bracket will appear here once the tournament starts.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-8">
              {rounds.map((round, ri) => (
                <div key={round.round ?? ri} className="flex flex-col justify-center gap-4">
                  <div className="text-center text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    {roundLabel(round.round ?? ri + 1, totalRounds)}
                  </div>
                  {(round.matches ?? []).map((m, mi) => {
                    const active = isActiveMatch(m);
                    return (
                      <motion.div
                        key={mi}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (ri * 4 + mi) * 0.04 }}
                      >
                        <Card
                          className={cn(
                            "w-60 p-0 transition-colors",
                            m.bye && "opacity-60",
                            active && "!border-accent/60 shadow-glow"
                          )}
                        >
                          <MatchRow
                            refId={m.a}
                            name={nameOf(m.a)}
                            wins={m.wins_a}
                            isWinner={!!m.winner && m.winner === m.a}
                            decided={!!m.winner}
                            bye={m.bye}
                            placeholder="TBD"
                          />
                          <div className="mx-3 flex items-center gap-2 border-t border-line py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                            <span className="flex-1 border-t border-line" />
                            {m.bye ? "bye" : "vs"}
                            <span className="flex-1 border-t border-line" />
                          </div>
                          <MatchRow
                            refId={m.b}
                            name={nameOf(m.b)}
                            wins={m.wins_b}
                            isWinner={!!m.winner && m.winner === m.b}
                            decided={!!m.winner}
                            bye={m.bye}
                            placeholder={m.bye ? "—" : "TBD"}
                          />
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function MatchRow({
  refId,
  name,
  wins,
  isWinner,
  decided,
  bye,
  placeholder,
}: {
  refId?: string | null;
  name: string;
  wins?: number;
  isWinner: boolean;
  decided: boolean;
  bye?: boolean;
  placeholder: string;
}) {
  const empty = !refId;
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5",
        isWinner && "bg-accent/10"
      )}
    >
      {empty ? (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-[10px] text-zinc-600">
          ?
        </span>
      ) : (
        <ModelAvatar refId={refId} size={28} />
      )}
      <span
        className={cn(
          "flex-1 truncate text-sm",
          empty ? "text-zinc-600" : isWinner ? "font-semibold text-accent" : "text-zinc-200",
          decided && !isWinner && !empty && "text-zinc-500"
        )}
      >
        {empty ? placeholder : name}
      </span>
      {!bye && !empty && typeof wins === "number" && (
        <span className="font-mono text-xs text-zinc-400">{wins}</span>
      )}
      {isWinner && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent"
        >
          <Check className="h-3 w-3" />
        </motion.span>
      )}
    </div>
  );
}

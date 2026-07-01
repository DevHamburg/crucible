"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  FileText,
  FlaskConical,
  Gauge,
  Layers,
  ListChecks,
  Play,
  Scale,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useBenchmark, useBenchmarks, useDomains } from "@/lib/hooks";
import { num } from "@/lib/format";
import { AnimatedNumber, DomainBadge } from "@/components/ui/bits";
import { Card, EmptyState, Section, Skeleton, StatCard } from "@/components/ui/primitives";
import { cn, domainColor } from "@/lib/utils";
import type { Benchmark } from "@/lib/types";

function truncate(s: string, n = 220) {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
}

function shortLicense(l?: string) {
  if (!l) return null;
  return l.length > 22 ? `${l.slice(0, 22)}…` : l;
}

function SampleItems({ slug }: { slug: string }) {
  const { data, isLoading } = useBenchmark(slug);
  const samples = data?.sample_items?.slice(0, 2) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (samples.length === 0) {
    return <div className="text-xs text-zinc-500">No sample items available for this suite.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
        <FileText className="h-3.5 w-3.5" /> Sample prompts
      </div>
      {samples.map((s, i) => {
        const choices = (s.input?.choices ?? s.input?.options) as unknown;
        const choiceList = Array.isArray(choices) ? (choices as any[]).map((c) => String(c)) : [];
        return (
          <motion.div
            key={s.external_id ?? i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="rounded-xl border border-line bg-white/[0.02] p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-zinc-500">{s.external_id}</span>
              {s.difficulty && (
                <span className="chip !py-0.5 !text-[10px] capitalize">{s.difficulty}</span>
              )}
            </div>
            <p className="text-sm leading-relaxed text-zinc-300">{truncate(s.prompt)}</p>
            {choiceList.length > 0 && (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {choiceList.slice(0, 6).map((c, ci) => (
                  <li
                    key={ci}
                    className="flex items-start gap-2 rounded-lg border border-line bg-white/[0.02] px-2 py-1 text-xs text-zinc-400"
                  >
                    <span className="mt-0.5 font-mono text-[10px] text-zinc-500">
                      {String.fromCharCode(65 + ci)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{truncate(c, 80)}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function BenchmarkCard({ b, index }: { b: Benchmark; index: number }) {
  const [open, setOpen] = useState(false);
  const c = domainColor(b.domain);
  const lic = shortLicense(b.license);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
    >
      <Card className="group h-full !p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full flex-col gap-3 p-5 text-left"
        >
          <div className="flex items-center justify-between gap-3">
            <DomainBadge domain={b.domain} />
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-zinc-500 transition-transform",
                open && "rotate-180"
              )}
            />
          </div>

          <div>
            <h3 className="font-semibold tracking-tight">{b.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{b.description}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {b.task_type && <span className="chip !py-0.5 capitalize">{b.task_type}</span>}
            {b.scoring_type && <span className="chip !py-0.5 capitalize">{b.scoring_type}</span>}
            <span className="chip !py-0.5">{num(b.num_items)} items</span>
            {lic && <span className="chip !py-0.5">{lic}</span>}
          </div>

          {b.source_url && (
            <a
              href={b.source_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex w-fit items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-accent"
              style={{ color: undefined }}
            >
              <ExternalLink className="h-3 w-3" /> Source
            </a>
          )}
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <div
                className="mx-5 mb-5 rounded-xl border-t border-line p-4 pt-4"
                style={{ borderTop: `1px solid ${c}22` }}
              >
                <SampleItems slug={b.slug} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

function BenchmarksBody() {
  const params = useSearchParams();
  const initial = params.get("domain") ?? "all";
  const [active, setActive] = useState(initial);

  const { data: domains } = useDomains();
  const { data: benchmarks, isLoading } = useBenchmarks();

  const filtered = useMemo(() => {
    const list = benchmarks ?? [];
    return active === "all" ? list : list.filter((b) => b.domain === active);
  }, [benchmarks, active]);

  const totals = useMemo(() => {
    const list = benchmarks ?? [];
    const items = list.reduce((acc, b) => acc + (b.num_items ?? 0), 0);
    const doms = new Set(list.map((b) => b.domain)).size;
    return { suites: list.length, items, domains: doms };
  }, [benchmarks]);

  const pills = [{ domain: "all", label: "All" }, ...(domains ?? [])];

  return (
    <div className="space-y-8">
      {/* header */}
      <Section
        title="Benchmark catalog"
        subtitle="Curated evaluation suites across every domain in the crucible"
        action={
          <Link href="/run" className="btn-primary">
            <Play className="h-4 w-4" /> Benchmark these
          </Link>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Suites"
            value={<AnimatedNumber value={totals.suites} />}
            icon={<Layers className="h-4 w-4" />}
            delay={0.02}
          />
          <StatCard
            label="Total items"
            value={<AnimatedNumber value={totals.items} />}
            icon={<ListChecks className="h-4 w-4" />}
            accent="#06b6d4"
            delay={0.06}
          />
          <StatCard
            label="Domains"
            value={<AnimatedNumber value={totals.domains} />}
            icon={<Gauge className="h-4 w-4" />}
            accent="#10b981"
            delay={0.1}
          />
        </div>
      </Section>

      {/* domain filter pills */}
      <div className="flex flex-wrap gap-2">
        {pills.map((p, i) => {
          const isActive = active === p.domain;
          const c = p.domain === "all" ? "#a1a1aa" : domainColor(p.domain);
          return (
            <motion.button
              key={p.domain}
              type="button"
              onClick={() => setActive(p.domain)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium capitalize transition-all",
                isActive
                  ? "border-transparent"
                  : "border-line bg-white/[0.02] text-zinc-400 hover:text-zinc-200"
              )}
              style={
                isActive
                  ? { background: `${c}18`, color: c, borderColor: `${c}66` }
                  : undefined
              }
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
              {p.label ?? p.domain}
            </motion.button>
          );
        })}
      </div>

      {/* grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="No benchmarks here"
          children={
            <span>
              No suites match this domain yet. Try{" "}
              <button
                type="button"
                onClick={() => setActive("all")}
                className="text-accent hover:underline"
              >
                all domains
              </button>
              .
            </span>
          }
        />
      ) : (
        <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b, i) => (
            <BenchmarkCard key={b.slug} b={b} index={i} />
          ))}
        </motion.div>
      )}

      <div className="flex items-center justify-center gap-2 pt-2 text-sm text-zinc-500">
        <FlaskConical className="h-4 w-4" />
        Ready to run?{" "}
        <Link href="/run" className="inline-flex items-center gap-1 text-accent hover:underline">
          Configure a benchmark <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

export default function BenchmarksPage() {
  return (
    <Suspense fallback={null}>
      <BenchmarksBody />
    </Suspense>
  );
}

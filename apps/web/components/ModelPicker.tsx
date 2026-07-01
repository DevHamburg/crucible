"use client";

import { Check, Cpu, KeyRound, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useModels } from "@/lib/hooks";
import type { Model } from "@/lib/types";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { ModelAvatar } from "@/components/ui/bits";
import { Skeleton } from "@/components/ui/primitives";

export function ModelPicker({
  selected,
  onToggle,
  max,
  filterRole = true,
}: {
  selected: string[];
  onToggle: (ref: string) => void;
  max?: number;
  filterRole?: boolean;
}) {
  const { data: models, isLoading } = useModels();
  const [q, setQ] = useState("");
  const [onlyUsable, setOnlyUsable] = useState(false);

  const list = useMemo(() => {
    let m = models ?? [];
    if (filterRole) m = m.filter((x) => !x.role); // hide judge/attacker helpers
    if (onlyUsable) m = m.filter((x) => x.has_key);
    if (q) m = m.filter((x) => (x.display_name + x.ref).toLowerCase().includes(q.toLowerCase()));
    return m;
  }, [models, q, onlyUsable, filterRole]);

  const grouped = useMemo(() => {
    const g: Record<string, Model[]> = {};
    for (const m of list) (g[m.provider] ??= []).push(m);
    return g;
  }, [list]);

  if (isLoading)
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search models…"
          className="flex-1 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:border-accent/50"
        />
        <button
          onClick={() => setOnlyUsable((v) => !v)}
          className={cn("chip", onlyUsable && "!border-accent/60 !text-accent")}
        >
          <KeyRound className="h-3 w-3" /> Usable now
        </button>
      </div>

      {Object.entries(grouped).map(([provider, ms]) => (
        <div key={provider}>
          <div className="mb-1.5 flex items-center gap-2 px-1 text-[11px] uppercase tracking-wider text-zinc-500">
            <Cpu className="h-3 w-3" /> {provider}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ms.map((m) => {
              const active = selected.includes(m.ref);
              const disabled = !active && !m.has_key;
              const capped = !active && max != null && selected.length >= max;
              return (
                <motion.button
                  key={m.ref}
                  whileTap={{ scale: 0.97 }}
                  disabled={disabled || capped}
                  onClick={() => onToggle(m.ref)}
                  className={cn(
                    "relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                    active
                      ? "border-accent/60 bg-accent/10 shadow-glow"
                      : "border-line bg-white/[0.02] hover:bg-white/[0.05]",
                    (disabled || capped) && "cursor-not-allowed opacity-40"
                  )}
                >
                  <ModelAvatar refId={m.ref} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {m.display_name}
                      {m.simulated && (
                        <span className="chip !px-1.5 !py-0 text-[9px] !text-cyan">SIM</span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-zinc-500">
                      {m.keyless ? "no key needed" : money(m.input_price) + " / 1M in"}
                    </div>
                  </div>
                  {active ? (
                    <Check className="h-4 w-4 text-accent" />
                  ) : disabled ? (
                    <Lock className="h-3.5 w-3.5 text-zinc-600" />
                  ) : null}
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

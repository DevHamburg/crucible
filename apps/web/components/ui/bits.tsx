"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import { cn, domainColor } from "@/lib/utils";
import { initials } from "@/lib/format";

export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
  prefix = "",
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.9, ease: "easeOut" });
    return controls.stop;
  }, [value, mv]);
  return <motion.span className={cn("stat-num", className)}>{rounded}</motion.span>;
}

const AVATAR_COLORS = ["#8b5cf6", "#06b6d4", "#ec4899", "#10b981", "#f59e0b", "#3b82f6", "#f43f5e"];
function hashColor(ref: string) {
  let h = 0;
  for (let i = 0; i < ref.length; i++) h = (h * 31 + ref.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function ModelAvatar({ refId, size = 32 }: { refId: string; size?: number }) {
  const c = hashColor(refId);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg font-mono font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, ${c}44, ${c}18)`,
        border: `1px solid ${c}55`,
        color: c,
      }}
      title={refId}
    >
      {initials(refId)}
    </span>
  );
}

export function ScoreBar({ value, color = "#8b5cf6", height = 6 }: { value: number; color?: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-white/5" style={{ height }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, value * 100)}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 22 }}
        className="h-full rounded-full"
        style={{ background: color, boxShadow: `0 0 12px ${color}88` }}
      />
    </div>
  );
}

export function DomainBadge({ domain, label }: { domain: string; label?: string }) {
  const c = domainColor(domain);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}44` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {label ?? domain}
    </span>
  );
}

export function RankMedal({ rank }: { rank: number }) {
  const map: Record<number, string> = { 1: "#fbbf24", 2: "#cbd5e1", 3: "#d97706" };
  const c = map[rank];
  if (!c)
    return <span className="w-6 text-center font-mono text-sm text-zinc-500">{rank}</span>;
  return (
    <span
      className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-black"
      style={{ background: c, boxShadow: `0 0 14px ${c}99` }}
    >
      {rank}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "#10b981",
    running: "#8b5cf6",
    pending: "#f59e0b",
    error: "#ef4444",
    cancelled: "#71717a",
  };
  const c = map[status] ?? "#71717a";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{ background: `${c}18`, color: c, border: `1px solid ${c}44` }}
    >
      {status === "running" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: c }} />
      )}
      {status}
    </span>
  );
}

export function LiveDot({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-emerald-400">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      {label ?? "live"}
    </span>
  );
}

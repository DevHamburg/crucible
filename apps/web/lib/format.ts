export function pct(x: number | undefined | null, digits = 1) {
  if (x == null || isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function money(x: number | undefined | null) {
  if (x == null) return "$0";
  if (x === 0) return "$0";
  if (x < 0.01) return `$${x.toFixed(4)}`;
  return `$${x.toFixed(2)}`;
}

export function num(x: number | undefined | null, digits = 0) {
  if (x == null) return "—";
  return x.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function ms(x: number | undefined | null) {
  if (x == null) return "—";
  if (x < 1000) return `${Math.round(x)}ms`;
  return `${(x / 1000).toFixed(2)}s`;
}

export function compactTokens(x: number | undefined | null) {
  if (x == null) return "0";
  if (x < 1000) return `${x}`;
  if (x < 1_000_000) return `${(x / 1000).toFixed(1)}k`;
  return `${(x / 1_000_000).toFixed(2)}M`;
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function initials(ref: string) {
  const id = ref.split("/").pop() ?? ref;
  return id.slice(0, 2).toUpperCase();
}

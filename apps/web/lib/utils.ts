import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DOMAIN_COLORS: Record<string, string> = {
  logic: "#8b5cf6",
  software: "#06b6d4",
  psychology: "#ec4899",
  trading: "#10b981",
  business: "#f59e0b",
  marketing: "#f43f5e",
  general: "#3b82f6",
  safety: "#ef4444",
  mixed: "#a1a1aa",
};

export function domainColor(d?: string) {
  return DOMAIN_COLORS[d ?? "mixed"] ?? "#a1a1aa";
}

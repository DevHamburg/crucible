"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Boxes,
  Check,
  KeyRound,
  Layers,
  Lock,
  LogIn,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  TriangleAlert,
  Weight,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useKeys, useModels } from "@/lib/hooks";
import { useApp } from "@/lib/store";
import { compactTokens, money } from "@/lib/format";
import type { Model } from "@/lib/types";
import { AnimatedNumber, ModelAvatar } from "@/components/ui/bits";
import { Card, EmptyState, Section, Skeleton, StatCard } from "@/components/ui/primitives";

const PROVIDERS: { id: string; name: string; color: string }[] = [
  { id: "openai", name: "OpenAI", color: "#10a37f" },
  { id: "anthropic", name: "Anthropic", color: "#d97757" },
  { id: "google", name: "Google", color: "#4285f4" },
  { id: "openrouter", name: "OpenRouter", color: "#8b5cf6" },
  { id: "mistral", name: "Mistral", color: "#f59e0b" },
  { id: "groq", name: "Groq", color: "#f43f5e" },
  { id: "deepseek", name: "DeepSeek", color: "#06b6d4" },
];

const PROVIDER_NAME: Record<string, string> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p.name])
);
function providerName(id: string) {
  return PROVIDER_NAME[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}
function providerColor(id: string) {
  return PROVIDERS.find((p) => p.id === id)?.color ?? "#a1a1aa";
}

interface KeyRow {
  id: string;
  provider: string;
  label?: string;
  masked?: string;
  created_at?: string;
}

export default function ModelsPage() {
  const user = useApp((s) => s.user);
  const { data: keys, isLoading: keysLoading, refetch: refetchKeys } = useKeys();
  const { data: models, isLoading: modelsLoading } = useModels();

  const [drafts, setDrafts] = useState<Record<string, { key: string; label: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const keyRows = (keys ?? []) as KeyRow[];
  const keyFor = (provider: string) => keyRows.find((k) => k.provider === provider);

  function draft(provider: string) {
    return drafts[provider] ?? { key: "", label: "" };
  }
  function setDraft(provider: string, patch: Partial<{ key: string; label: string }>) {
    setDrafts((d) => ({ ...d, [provider]: { ...draft(provider), ...patch } }));
  }

  async function saveKey(provider: string) {
    const d = draft(provider);
    if (!d.key.trim()) {
      toast.error("Paste a key first");
      return;
    }
    setBusy(`${provider}:save`);
    try {
      await api.post("/keys", { provider, key: d.key.trim(), label: d.label.trim() || undefined });
      toast.success(`${providerName(provider)} key stored`);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      await refetchKeys();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save key");
    } finally {
      setBusy(null);
    }
  }

  async function testKey(provider: string) {
    const existing = keyFor(provider);
    const d = draft(provider);
    if (!existing && !d.key.trim()) {
      toast.error("Paste a key to test");
      return;
    }
    setBusy(`${provider}:test`);
    try {
      const body: any = existing ? { provider } : { provider, key: d.key.trim() };
      const r = await api.post<any>("/keys/test", body);
      if (r?.ok) {
        const reply = typeof r.reply === "string" ? r.reply.slice(0, 90) : r.model;
        toast.success(`${providerName(provider)} works — ${reply ?? "connected"}`);
      } else {
        toast.error(r?.error ? `${providerName(provider)}: ${r.error}` : "Key test failed");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Key test failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteKey(provider: string, id: string) {
    setBusy(`${provider}:del`);
    try {
      await api.del(`/keys/${id}`);
      toast.success(`${providerName(provider)} key removed`);
      await refetchKeys();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove key");
    } finally {
      setBusy(null);
    }
  }

  const filtered = useMemo(() => {
    const list = models ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.display_name.toLowerCase().includes(q) ||
        m.ref.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q)
    );
  }, [models, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Model[]>();
    for (const m of filtered) {
      const arr = map.get(m.provider) ?? [];
      arr.push(m);
      map.set(m.provider, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const totalModels = models?.length ?? 0;
  const providerCount = models ? new Set(models.map((m) => m.provider)).size : 0;
  const usableCount = models ? models.filter((m) => m.keyless || m.has_key).length : 0;

  return (
    <div className="space-y-10">
      {/* header */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-plasma-radial p-8">
        <div className="pointer-events-none absolute inset-0 bg-grid [background-size:44px_44px] opacity-40 [mask-image:radial-gradient(80%_60%_at_50%_0%,black,transparent)]" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="chip mb-4 !border-accent/40 !bg-accent/10 !text-accent">
            <Sparkles className="h-3 w-3" /> Model fleet & credentials
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Models & <span className="gradient-text">API keys</span>
          </h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Bring your own provider keys — encrypted per account — and every matching model lights up
            for benchmarks and the arena. Simulated models always run keyless.
          </p>
        </motion.div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Models"
          value={<AnimatedNumber value={totalModels} />}
          icon={<Boxes className="h-4 w-4" />}
          delay={0.02}
        />
        <StatCard
          label="Providers"
          value={<AnimatedNumber value={providerCount} />}
          icon={<Layers className="h-4 w-4" />}
          accent="#06b6d4"
          delay={0.06}
        />
        <StatCard
          label="Usable now"
          value={<AnimatedNumber value={usableCount} />}
          sub={`${totalModels - usableCount} need a key`}
          icon={<Zap className="h-4 w-4" />}
          accent="#10b981"
          delay={0.1}
        />
      </div>

      {/* API keys */}
      <Section
        title="API keys"
        subtitle="Stored encrypted and scoped to your account"
        action={
          <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> AES-encrypted at rest
          </span>
        }
      >
        {!user ? (
          <EmptyState
            icon={<Lock className="h-8 w-8" />}
            title="Sign in to manage keys"
            children={
              <div className="space-y-3">
                <p>API keys are per-account and never shared. Log in to add and test your provider credentials.</p>
                <Link href="/login" className="btn-primary inline-flex">
                  <LogIn className="h-4 w-4" /> Go to login
                </Link>
              </div>
            }
          />
        ) : keysLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {PROVIDERS.map((p, i) => {
              const existing = keyFor(p.id);
              const d = draft(p.id);
              const saving = busy === `${p.id}:save`;
              const testing = busy === `${p.id}:test`;
              const deleting = busy === `${p.id}:del`;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Card className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="flex min-w-[180px] items-center gap-3">
                      <span
                        className="grid h-9 w-9 place-items-center rounded-xl font-mono text-xs font-bold"
                        style={{
                          background: `${p.color}18`,
                          border: `1px solid ${p.color}44`,
                          color: p.color,
                        }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        {existing ? (
                          <span className="chip mt-1 !border-emerald-500/40 !bg-emerald-500/10 !text-emerald-400">
                            <Check className="h-3 w-3" /> connected
                          </span>
                        ) : (
                          <span className="chip mt-1 !border-amber-500/40 !bg-amber-500/10 !text-amber-400">
                            <TriangleAlert className="h-3 w-3" /> no key
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                      <AnimatePresence mode="wait" initial={false}>
                        {existing ? (
                          <motion.div
                            key="stored"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-1 items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3 py-2.5"
                          >
                            <KeyRound className="h-4 w-4 shrink-0 text-zinc-500" />
                            <span className="font-mono text-sm text-zinc-300">{existing.masked ?? "••••••••"}</span>
                            {existing.label && (
                              <span className="chip !py-0.5 text-zinc-400">{existing.label}</span>
                            )}
                          </motion.div>
                        ) : (
                          <motion.div
                            key="input"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-1 flex-col gap-2 sm:flex-row"
                          >
                            <input
                              type="password"
                              value={d.key}
                              onChange={(e) => setDraft(p.id, { key: e.target.value })}
                              placeholder={`Paste ${p.name} API key`}
                              className="flex-1 rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-accent/50"
                            />
                            <input
                              type="text"
                              value={d.label}
                              onChange={(e) => setDraft(p.id, { label: e.target.value })}
                              placeholder="Label (optional)"
                              className="rounded-xl border border-line bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-accent/50 sm:w-40"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {!existing && (
                        <button
                          onClick={() => saveKey(p.id)}
                          disabled={saving || !d.key.trim()}
                          className="btn-primary disabled:opacity-40"
                        >
                          <Check className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
                        </button>
                      )}
                      <button
                        onClick={() => testKey(p.id)}
                        disabled={testing || (!existing && !d.key.trim())}
                        className="btn-ghost disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" /> {testing ? "Testing…" : "Test"}
                      </button>
                      {existing && (
                        <button
                          onClick={() => deleteKey(p.id, existing.id)}
                          disabled={deleting}
                          className="btn-ghost !border-red-500/30 !text-red-400 hover:!bg-red-500/10 disabled:opacity-40"
                          title="Remove key"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </Section>

      {/* Model catalog */}
      <Section
        title="Model catalog"
        subtitle={`${totalModels} models across ${providerCount} providers`}
        action={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="w-52 rounded-xl border border-line bg-white/[0.03] py-2 pl-9 pr-3 text-sm outline-none focus:border-accent/50"
            />
          </div>
        }
      >
        {modelsLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-8 w-8" />}
            title="No models match"
            children="Try a different search term."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {grouped.map(([provider, list], gi) => {
              const c = providerColor(provider);
              return (
                <motion.div
                  key={provider}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.05 }}
                >
                  <Card className="h-full !p-0">
                    <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="grid h-7 w-7 place-items-center rounded-lg font-mono text-[10px] font-bold"
                          style={{ background: `${c}18`, border: `1px solid ${c}44`, color: c }}
                        >
                          {providerName(provider).slice(0, 2).toUpperCase()}
                        </span>
                        <span className="text-sm font-semibold">{providerName(provider)}</span>
                      </div>
                      <span className="chip text-zinc-400">{list.length}</span>
                    </div>
                    <div className="divide-y divide-line">
                      {list.map((m, i) => {
                        const ready = m.keyless || m.has_key;
                        return (
                          <motion.div
                            key={m.ref}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: gi * 0.05 + i * 0.02 }}
                            className="flex items-center gap-3 px-5 py-3"
                          >
                            <ModelAvatar refId={m.ref} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium">{m.display_name}</span>
                                {m.simulated && (
                                  <span className="chip !border-cyan/40 !bg-cyan/10 !py-0 text-[10px] !text-cyan">
                                    SIM
                                  </span>
                                )}
                                {m.is_open_weight && (
                                  <span
                                    className="chip !py-0 text-[10px]"
                                    title="Open-weight model"
                                    style={{
                                      borderColor: "#10b98155",
                                      color: "#10b981",
                                      background: "#10b98118",
                                    }}
                                  >
                                    <Weight className="h-3 w-3" /> open
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                                <span title="Context window">{compactTokens(m.context_window)} ctx</span>
                                <span title="Input price per 1M tokens">
                                  {money(m.input_price)}
                                  <span className="text-zinc-600"> in/1M</span>
                                </span>
                                <span title="Output price per 1M tokens">
                                  {money(m.output_price)}
                                  <span className="text-zinc-600"> out/1M</span>
                                </span>
                              </div>
                            </div>
                            {ready ? (
                              <span className="chip shrink-0 !border-emerald-500/40 !bg-emerald-500/10 !text-emerald-400">
                                <Check className="h-3 w-3" /> ready
                              </span>
                            ) : (
                              <span className="chip shrink-0 !border-amber-500/40 !bg-amber-500/10 !text-amber-400">
                                <KeyRound className="h-3 w-3" /> needs key
                              </span>
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
}

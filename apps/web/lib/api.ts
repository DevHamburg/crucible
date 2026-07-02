export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const TOKEN_KEY = "crucible_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};

export type SSEStatus = "connecting" | "open" | "reconnecting" | "closed";

/**
 * Subscribe to a Server-Sent Events endpoint with automatic reconnection.
 *
 * The browser's EventSource only auto-retries on transient network drops; on an HTTP error
 * response (e.g. a 502 while the API redeploys) it closes for good. We detect that and
 * re-open with capped exponential backoff, reporting connection state via `onStatus` so the
 * UI can show "reconnecting…" instead of a frozen "streaming" indicator. Returns an
 * unsubscribe fn that stops retries and closes the stream.
 */
export function subscribe(
  path: string,
  onEvent: (ev: any) => void,
  opts: { onStatus?: (s: SSEStatus) => void; maxRetries?: number } = {}
) {
  const { onStatus, maxRetries = 8 } = opts;
  let es: EventSource | null = null;
  let retries = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const connect = () => {
    if (stopped) return;
    onStatus?.(retries === 0 ? "connecting" : "reconnecting");
    es = new EventSource(`${API_URL}${path}`);
    es.onopen = () => {
      retries = 0;
      onStatus?.("open");
    };
    es.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data));
      } catch {}
    };
    es.onerror = () => {
      // readyState CLOSED means the browser gave up (HTTP error); reconnect ourselves.
      if (es && es.readyState === EventSource.CLOSED) {
        es.close();
        es = null;
        if (stopped || retries >= maxRetries) {
          onStatus?.("closed");
          return;
        }
        const delay = Math.min(1000 * 2 ** retries, 15000);
        retries += 1;
        onStatus?.("reconnecting");
        retryTimer = setTimeout(connect, delay);
      }
      // readyState CONNECTING: the browser is already retrying; leave it be.
    };
  };

  connect();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
    onStatus?.("closed");
  };
}

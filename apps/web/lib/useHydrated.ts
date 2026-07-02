"use client";

import { useEffect, useState } from "react";

/**
 * Returns false during SSR and the first client render, true afterwards.
 *
 * The auth store (zustand persist) rehydrates from localStorage synchronously, so the very
 * first client render already knows the user while the server rendered `user = null`. Gating
 * user-dependent shell UI on this flag keeps SSR HTML and the first client render identical,
 * avoiding a React 19 hydration mismatch (which otherwise discards the whole SSR tree).
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

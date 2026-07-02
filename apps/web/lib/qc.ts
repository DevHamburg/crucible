import type { QueryClient } from "@tanstack/react-query";

/**
 * Bridge so the (non-React) zustand auth store can drop cached data on identity changes.
 * The React tree registers its QueryClient once (see Providers); the store looks it up when
 * login/logout happens so a previous account's runs/keys/leaderboards never bleed through.
 */
let _client: QueryClient | null = null;

export function registerQueryClient(client: QueryClient) {
  _client = client;
}

export function getQueryClient(): QueryClient | null {
  return _client;
}

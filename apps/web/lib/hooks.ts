"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  Benchmark,
  Domain,
  EloRow,
  LeaderRow,
  Model,
  Run,
  SafetyReportRow,
  Tournament,
} from "./types";

export const useModels = () => useQuery({ queryKey: ["models"], queryFn: () => api.get<Model[]>("/models") });
export const useProviders = () =>
  useQuery({ queryKey: ["providers"], queryFn: () => api.get<any[]>("/providers") });
export const useBenchmarks = () =>
  useQuery({ queryKey: ["benchmarks"], queryFn: () => api.get<Benchmark[]>("/benchmarks") });
export const useBenchmark = (slug: string) =>
  useQuery({ queryKey: ["benchmark", slug], queryFn: () => api.get<Benchmark>(`/benchmarks/${slug}`), enabled: !!slug });
export const useDomains = () =>
  useQuery({ queryKey: ["domains"], queryFn: () => api.get<Domain[]>("/domains") });

const TERMINAL_STATUSES = ["completed", "error", "cancelled"];

/** Poll while active; stop once the entity is terminal or the query itself errored
 *  (otherwise a finished/404 run would be re-fetched forever). */
function pollWhileActive(interval: number, poll: boolean) {
  return (query: any): number | false => {
    if (!poll) return false;
    if (query.state.status === "error") return false;
    const status = query.state.data?.status;
    return status && TERMINAL_STATUSES.includes(status) ? false : interval;
  };
}

export const useRuns = (kind?: string) =>
  useQuery({ queryKey: ["runs", kind], queryFn: () => api.get<Run[]>(`/runs${kind ? `?kind=${kind}` : ""}`) });
export const useRun = (id: string, poll = false) =>
  useQuery({
    queryKey: ["run", id],
    queryFn: () => api.get<Run>(`/runs/${id}`),
    enabled: !!id,
    retry: false,
    refetchInterval: pollWhileActive(1500, poll),
  });
export const useRunResults = (id: string, items = false) =>
  useQuery({ queryKey: ["run-results", id, items], queryFn: () => api.get<any>(`/runs/${id}/results?items=${items}`), enabled: !!id });

export const useLeaderboard = (domain?: string) =>
  useQuery({
    queryKey: ["leaderboard", domain],
    queryFn: () => api.get<{ leaderboard: LeaderRow[] }>(`/leaderboard${domain ? `?domain=${domain}` : ""}`),
  });
export const useEloLeaderboard = (kind?: string) =>
  useQuery({
    queryKey: ["elo", kind],
    queryFn: () => api.get<{ n_matches: number; leaderboard: EloRow[] }>(`/leaderboard/elo${kind ? `?kind=${kind}` : ""}`),
  });

export const useSafetyCategories = () =>
  useQuery({ queryKey: ["safety-cats"], queryFn: () => api.get<any[]>("/safety/categories") });
export const useSafetyLeaderboard = () =>
  useQuery({ queryKey: ["safety-lb"], queryFn: () => api.get<{ leaderboard: SafetyReportRow[] }>("/safety/leaderboard") });
export const useSafetyReport = (runId: string, poll = false) =>
  useQuery({
    queryKey: ["safety-report", runId],
    queryFn: () => api.get<any>(`/safety/report/${runId}`),
    enabled: !!runId,
    // While the run is in flight the report starts empty; keep refetching so results
    // appear on completion without a manual page reload.
    refetchInterval: poll ? 2000 : false,
  });

export const useTournaments = () =>
  useQuery({ queryKey: ["tournaments"], queryFn: () => api.get<Tournament[]>("/arena/tournaments") });
export const useTournament = (id: string, poll = false) =>
  useQuery({
    queryKey: ["tournament", id],
    queryFn: () => api.get<Tournament>(`/arena/tournaments/${id}`),
    enabled: !!id,
    retry: false,
    refetchInterval: pollWhileActive(2000, poll),
  });
export const useMatches = (kind?: string) =>
  useQuery({ queryKey: ["matches", kind], queryFn: () => api.get<any[]>(`/arena/matches${kind ? `?kind=${kind}` : ""}`) });

export const useObservability = () =>
  useQuery({ queryKey: ["obs"], queryFn: () => api.get<any>("/observability/overview"), refetchInterval: 5000 });
export const useCosts = () =>
  useQuery({ queryKey: ["costs"], queryFn: () => api.get<any[]>("/observability/costs") });

export const useKeys = () => useQuery({ queryKey: ["keys"], queryFn: () => api.get<any[]>("/keys") });

export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post<Run>("/runs", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
}
export function useCreateSafetyRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post<Run>("/safety/run", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });
}
export function useCreateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => api.post<Tournament>("/arena/tournament", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tournaments"] }),
  });
}

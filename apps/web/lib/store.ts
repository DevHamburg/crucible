import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setToken } from "./api";
import { getQueryClient } from "./qc";

interface AuthUser {
  id: string;
  email: string | null;
  display_name: string;
  is_admin: boolean;
  is_anonymous: boolean;
}

interface AppState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
  // cross-page model selection (arena/run builder)
  selected: string[];
  toggleSelected: (ref: string) => void;
  clearSelected: () => void;
  setSelected: (refs: string[]) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      setAuth: (token, user) => {
        const prev = get().user;
        setToken(token);
        set({ token, user });
        const qc = getQueryClient();
        if (qc) {
          // Switching to a different account: drop everything so the previous identity's
          // cached runs/keys/leaderboards can't render. First login / re-auth of the same
          // account: just refetch for freshness.
          if (prev && prev.id !== user.id) qc.clear();
          else qc.invalidateQueries();
        }
      },
      logout: () => {
        setToken(null);
        set({ token: null, user: null });
        getQueryClient()?.clear(); // no stale private data left for the next visitor
      },
      selected: [],
      toggleSelected: (ref) => {
        const s = get().selected;
        set({ selected: s.includes(ref) ? s.filter((r) => r !== ref) : [...s, ref] });
      },
      clearSelected: () => set({ selected: [] }),
      setSelected: (refs) => set({ selected: refs }),
    }),
    {
      name: "crucible_app",
      partialize: (s) => ({ token: s.token, user: s.user, selected: s.selected }),
    }
  )
);

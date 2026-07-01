import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setToken } from "./api";

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
        setToken(token);
        set({ token, user });
      },
      logout: () => {
        setToken(null);
        set({ token: null, user: null });
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

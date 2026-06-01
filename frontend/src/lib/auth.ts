"use client";

import { create } from "zustand";
import { api } from "./api";

type User = {
  id: number;
  email: string;
  username: string;
  role: "admin" | "shop_owner" | "customer";
  first_name: string;
  last_name: string;
  phone?: string;
  avatar?: string | null;
  email_verified_at?: string | null;
  no_show_count_90d?: number;
  cancellation_strikes_90d?: number;
  restricted_until?: string | null;
};

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithTokens: (access: string, refresh: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  async login(email, password) {
    set({ loading: true });
    try {
      const { data } = await api.post("/auth/login/", { email, password });
      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      const me = await api.get("/auth/me/");
      set({ user: me.data, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
  async loginWithTokens(access, refresh) {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
    set({ loading: true });
    try {
      const me = await api.get("/auth/me/");
      set({ user: me.data, loading: false });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },
  logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    set({ user: null });
  },
  async fetchMe() {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem("access_token")) return;
    set({ loading: true });
    try {
      const me = await api.get("/auth/me/");
      set({ user: me.data, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
}));

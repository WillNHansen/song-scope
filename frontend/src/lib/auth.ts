import { create } from 'zustand';
import api from './api';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: true,

  setAuth(user, token) {
    localStorage.setItem('token', token);
    set({ user, token, loading: false });
  },

  logout() {
    localStorage.removeItem('token');
    set({ user: null, token: null, loading: false });
  },

  async hydrate() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const { data } = await api.get<User>('/api/auth/me');
      set({ user: data, token, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, loading: false });
    }
  },
}));

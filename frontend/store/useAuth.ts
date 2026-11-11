'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authAPI } from '@/lib/api';

interface AuthState {
  isLoggedIn: boolean;
  user: {
    id: string;
    email: string;
    username: string;
  } | null;
  token: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, username: string, password: string) => Promise<boolean>;
  logout: () => void;
  setAuth: (token: string, user: { id: string; email: string; username: string }) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      user: null,
      token: null,

      login: async (email: string, password: string) => {
        try {
          const response = await authAPI.login(email, password);
          if (response?.access_token) {
            const payload = JSON.parse(atob(response.access_token.split('.')[1]));
            set({
              isLoggedIn: true,
              token: response.access_token,
              user: {
                id: String(payload.sub),
                email: email,
                username: email.split('@')[0],
              },
            });
            return true;
          }
          set({ isLoggedIn: false, user: null, token: null });
          return false;
        } catch (error) {
          console.error('[useAuth] Login failed:', error);
          set({ isLoggedIn: false, user: null, token: null });
          return false;
        }
      },

      register: async (email: string, username: string, password: string) => {
        try {
          const response = await authAPI.register(email, username, password);
          if (response?.access_token) {
            const payload = JSON.parse(atob(response.access_token.split('.')[1]));
            set({
              isLoggedIn: true,
              token: response.access_token,
              user: {
                id: String(payload.sub),
                email: email,
                username: username,
              },
            });
            return true;
          }
          set({ isLoggedIn: false, user: null, token: null });
          return false;
        } catch (error) {
          console.error('[useAuth] Registration failed:', error);
          set({ isLoggedIn: false, user: null, token: null });
          return false;
        }
      },

      logout: () => {
        authAPI.logout();
        set({
          isLoggedIn: false,
          user: null,
          token: null,
        });
      },

      setAuth: (token: string, user: { id: string; email: string; username: string }) => {
        set({
          isLoggedIn: true,
          token,
          user,
        });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ isLoggedIn: state.isLoggedIn, user: state.user, token: state.token }),
    }
  )
);

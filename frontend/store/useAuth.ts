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
    (set, get) => ({
      // Set to true by default to bypass login screen requirement for now
      isLoggedIn: true,
      user: {
        id: 'usr-demo',
        email: 'investor@stockai.com',
        username: 'Investor',
      },
      token: 'demo-token',

      login: async (email: string, password: string) => {
        try {
          const response = await authAPI.login(email, password);
          if (response?.access_token) {
            const payload = JSON.parse(atob(response.access_token.split('.')[1]));
            set({
              isLoggedIn: true,
              token: response.access_token,
              user: {
                id: payload.sub,
                email: email,
                username: email.split('@')[0],
              },
            });
            return true;
          }
          set({
            isLoggedIn: true,
            token: 'demo-token',
            user: { id: 'usr-1', email, username: email.split('@')[0] },
          });
          return true;
        } catch (error) {
          set({
            isLoggedIn: true,
            token: 'demo-token',
            user: { id: 'usr-1', email, username: email.split('@')[0] },
          });
          return true;
        }
      },

      register: async (email: string, username: string, password: string) => {
        set({
          isLoggedIn: true,
          token: 'demo-token',
          user: { id: 'usr-new', email, username },
        });
        return true;
      },

      logout: () => {
        authAPI.logout();
        set({
          isLoggedIn: true,
          user: { id: 'usr-demo', email: 'investor@stockai.com', username: 'Investor' },
          token: 'demo-token',
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

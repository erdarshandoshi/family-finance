import { createContext, useContext, useState, useEffect } from 'react';

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  isAllowed: (email: string) => boolean;
}

const SESSION_KEY = 'ff_auth_user';

const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS as string | undefined)
  ?.split(',')
  .map(e => e.trim().toLowerCase())
  ?? [];

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(SESSION_KEY);
  }, [user]);

  const isAllowed = (email: string) => allowedEmails.includes(email.toLowerCase());

  const login = (u: AuthUser) => setUser(u);
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAllowed }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

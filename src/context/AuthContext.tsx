import { createContext, useContext, useState, useEffect } from 'react';

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
  uid: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  isAllowed: (email: string) => boolean;
}

const STORAGE_KEY = 'ff_auth';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS as string | undefined)
  ?.split(',').map(e => e.trim().toLowerCase()) ?? [];

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { user, expiry } = JSON.parse(raw) as { user: AuthUser; expiry: number };
    if (Date.now() > expiry) { localStorage.removeItem(STORAGE_KEY); return null; }
    return user;
  } catch { return null; }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser);

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, expiry: Date.now() + THIRTY_DAYS }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
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

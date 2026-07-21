import { useState, useEffect } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { AuthUser } from './context/AuthContext';
import Layout from './components/Layout/Layout';
import LoginPage from './components/Login/LoginPage';
import Dashboard from './pages/Dashboard';
import FDPage from './pages/FDPage';
import StocksPage from './pages/StocksPage';
import StocksReportPage from './pages/StocksReportPage';
import MFPage from './pages/MFPage';
import PPFPage from './pages/PPFPage';
import PFPage from './pages/PFPage';
import InsurancePage from './pages/InsurancePage';
import PostPage from './pages/PostPage';
import AccessControlPage from './pages/AccessControlPage';
import NPSPage from './pages/NPSPage';
import BabyJournalPage from './pages/BabyJournalPage';
import PasswordVaultPage from './pages/PasswordVaultPage';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-4">
      <svg className="animate-spin w-8 h-8 text-indigo-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <p className="text-muted text-sm">Loading your portfolio…</p>
    </div>
  );
}

function AccessDeniedScreen({ user, logout }: { user: AuthUser; logout: () => void }) {
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const requestAccess = async () => {
    setRequesting(true);
    try {
      const ref = doc(db, 'users', 'access-requests');
      const snap = await getDoc(ref);
      const existing: { email: string; name: string; requestedAt: string }[] =
        snap.exists() ? ((snap.data() as { requests: { email: string; name: string; requestedAt: string }[] }).requests ?? []) : [];
      if (!existing.some(r => r.email === user.email.toLowerCase())) {
        await setDoc(ref, {
          requests: [...existing, { email: user.email.toLowerCase(), name: user.name, requestedAt: new Date().toISOString() }],
        });
      }
      setRequested(true);
    } catch {
      setRequested(true);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 max-w-sm w-full">
        <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.96L13.75 4a2 2 0 00-3.5 0l-6.25 12A2 2 0 005.07 19z" />
          </svg>
        </div>
        <h2 className="text-content font-bold text-xl mb-2">Access Denied</h2>
        <p className="text-muted text-sm mb-1">
          <span className="text-content font-medium">{user.email}</span> is not authorised to access this application.
        </p>
        {requested ? (
          <p className="text-success text-sm mb-6 flex items-center justify-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Request sent! The admin will review your access.
          </p>
        ) : (
          <>
            <p className="text-faint text-xs mb-4">Request access below or contact the administrator.</p>
            <button
              onClick={requestAccess}
              disabled={requesting}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium transition-colors mb-3"
            >
              {requesting ? 'Sending request…' : 'Request Access'}
            </button>
          </>
        )}
        <button
          onClick={logout}
          className="w-full bg-surface3 hover:bg-surface3 text-content rounded-xl py-2.5 text-sm font-medium transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { dbLoading } = useApp();
  if (dbLoading) return <LoadingScreen />;
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="fd" element={<FDPage />} />
          <Route path="stocks" element={<StocksPage />} />
          <Route path="stocks/reports" element={<StocksReportPage />} />
          <Route path="mf" element={<MFPage />} />
          <Route path="ppf" element={<PPFPage />} />
          <Route path="pf" element={<PFPage />} />
          <Route path="insurance" element={<InsurancePage />} />
          <Route path="post" element={<PostPage />} />
          <Route path="nps" element={<NPSPage />} />
          <Route path="journal" element={<BabyJournalPage />} />
          <Route path="vault" element={<PasswordVaultPage />} />
          <Route path="access" element={<AccessControlPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function AuthGate() {
  const { user, logout } = useAuth();
  const [checking, setChecking] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) { setAllowed(null); return; }
    setChecking(true);
    getDoc(doc(db, 'users', 'access-control'))
      .then(snap => {
        if (!snap.exists()) { setAllowed(true); return; }
        const list = (snap.data() as { emails: string[] }).emails ?? [];
        setAllowed(list.length === 0 || list.includes(user.email.toLowerCase()));
      })
      .catch(() => setAllowed(true))  // fail open if Firestore unreachable
      .finally(() => setChecking(false));
  }, [user]);

  if (!user) return <LoginPage />;
  if (checking || allowed === null) return <LoadingScreen />;
  if (!allowed) return <AccessDeniedScreen user={user} logout={logout} />;

  return (
    <AppProvider>
      <AppRoutes />
    </AppProvider>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

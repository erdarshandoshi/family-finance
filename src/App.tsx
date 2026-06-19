import { GoogleOAuthProvider } from '@react-oauth/google';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout/Layout';
import LoginPage from './components/Login/LoginPage';
import Dashboard from './pages/Dashboard';
import FDPage from './pages/FDPage';
import StocksPage from './pages/StocksPage';
import MFPage from './pages/MFPage';
import PPFPage from './pages/PPFPage';
import PFPage from './pages/PFPage';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

function AuthGate() {
  const { user } = useAuth();

  if (!user) return <LoginPage />;

  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="fd" element={<FDPage />} />
            <Route path="stocks" element={<StocksPage />} />
            <Route path="mf" element={<MFPage />} />
            <Route path="ppf" element={<PPFPage />} />
            <Route path="pf" element={<PFPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
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

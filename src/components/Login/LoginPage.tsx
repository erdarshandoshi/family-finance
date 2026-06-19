import { useGoogleLogin } from '@react-oauth/google';
import { IndianRupee, ShieldCheck, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { login, isAllowed } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const info = await res.json() as { email: string; name: string; picture: string };

        if (!isAllowed(info.email)) {
          setError(`Access denied for ${info.email}. This app is private.`);
          return;
        }

        login({ email: info.email, name: info.name, picture: info.picture });
      } catch {
        setError('Failed to fetch user info. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    onError: () => {
      setError('Google sign-in failed. Please try again.');
      setLoading(false);
    },
  });

  return (
    <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-600/30">
            <IndianRupee size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Family Finance</h1>
          <p className="text-slate-400 mt-2 text-sm">Private portfolio manager</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-6">
            <ShieldCheck size={16} className="text-emerald-400" />
            <p className="text-slate-400 text-sm">Access restricted to authorised members only</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-5">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={() => { setError(''); handleLogin(); }}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed text-gray-800 font-medium py-3 px-4 rounded-xl transition-colors shadow-sm"
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            {loading ? 'Signing in…' : 'Continue with Google'}
          </button>

          <p className="text-slate-600 text-xs text-center mt-5">
            Your data is stored locally on your device only.
          </p>
        </div>
      </div>
    </div>
  );
}

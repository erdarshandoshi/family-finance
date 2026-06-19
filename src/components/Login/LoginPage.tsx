import { GoogleLogin } from '@react-oauth/google';
import { IndianRupee, ShieldCheck, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface GoogleJwtPayload {
  email: string;
  name: string;
  picture: string;
}

function decodeJwt(token: string): GoogleJwtPayload {
  const payload = token.split('.')[1];
  const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(decoded) as GoogleJwtPayload;
}

export default function LoginPage() {
  const { login, isAllowed } = useAuth();
  const [error, setError] = useState('');

  return (
    <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
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

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={(response) => {
                setError('');
                try {
                  if (!response.credential) {
                    setError('No credential received. Please try again.');
                    return;
                  }
                  const payload = decodeJwt(response.credential);
                  if (!isAllowed(payload.email)) {
                    setError(`Access denied for ${payload.email}. This app is private.`);
                    return;
                  }
                  login({ email: payload.email, name: payload.name, picture: payload.picture });
                } catch {
                  setError('Failed to process sign-in. Please try again.');
                }
              }}
              onError={() => setError('Google sign-in failed. Please try again.')}
              theme="filled_blue"
              size="large"
              shape="rectangular"
              text="continue_with"
              width="320"
            />
          </div>

          <p className="text-slate-600 text-xs text-center mt-6">
            Your data is stored locally on your device only.
          </p>
        </div>
      </div>
    </div>
  );
}

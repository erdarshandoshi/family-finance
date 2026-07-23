import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, AlertTriangle, Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getPushState, enablePush, disablePush, updateLeadDays, type PushState } from '../../utils/push';

const LEAD_OPTIONS = [1, 2, 3, 5, 7];

/** Opt in to a push reminder a few days before each SIP is debited. */
export default function SIPReminders() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [leadDays, setLeadDays] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getPushState().then(setState); }, []);

  const toggle = async () => {
    setBusy(true); setError(null);
    try {
      setState(state === 'on'
        ? await disablePush()
        : await enablePush({ email: user?.email ?? '', leadDays }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const changeLead = async (d: number) => {
    setLeadDays(d);
    if (state === 'on') await updateLeadDays(d);
  };

  if (state === null) return null;

  // iOS only exposes push to a Home-Screen install — say so rather than failing silently
  if (state === 'needs-install') {
    return (
      <div className="bg-surface border border-edge rounded-2xl shadow-card p-4 flex items-start gap-3">
        <Smartphone size={18} className="text-accent flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="text-content font-medium">Add to Home Screen for SIP reminders</p>
          <p className="text-faint text-xs mt-1">
            On iPhone, notifications only work once the app is installed. Tap <b>Share</b> →
            <b> Add to Home Screen</b>, open it from there, and this option will appear.
          </p>
        </div>
      </div>
    );
  }

  if (state === 'unsupported') return null;

  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {state === 'on'
            ? <Bell size={18} className="text-success flex-shrink-0 mt-0.5" />
            : <BellOff size={18} className="text-faint flex-shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <p className="text-content font-medium text-sm">SIP reminders</p>
            <p className="text-faint text-xs mt-0.5">
              {state === 'on'
                ? `On — you'll be notified ${leadDays} day${leadDays !== 1 ? 's' : ''} before each debit.`
                : 'Get a notification before money is debited, so the balance is ready.'}
            </p>
          </div>
        </div>
        <button onClick={toggle} disabled={busy || state === 'denied'}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
            state === 'on' ? 'bg-surface2 text-muted hover:text-content' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
          }`}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {state === 'on' ? 'Turn off' : 'Turn on'}
        </button>
      </div>

      {state !== 'denied' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-faint text-xs">Remind me</span>
          {LEAD_OPTIONS.map(d => (
            <button key={d} onClick={() => changeLead(d)}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                leadDays === d ? 'bg-indigo-600 text-white' : 'bg-surface2 text-muted hover:text-content'
              }`}>
              {d}d before
            </button>
          ))}
        </div>
      )}

      {state === 'denied' && (
        <p className="text-warn text-xs flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
          Notifications are blocked for this site. Re-allow them in your browser settings, then reload.
        </p>
      )}
      {error && (
        <p className="text-danger text-xs flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

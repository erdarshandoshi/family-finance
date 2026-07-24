import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, AlertTriangle, Smartphone, Repeat, Landmark, Package, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getPushState, enablePush, disablePush, savePrefs, fetchPrefs,
  DEFAULT_PREFS, type PushState, type NotifyPrefs, type NotifyCategory,
} from '../utils/push';

// Lead-time choices, shared across categories
const LEAD_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
];

const CATEGORIES: { key: NotifyCategory; title: string; desc: string; icon: typeof Bell; color: string }[] = [
  { key: 'sip',  title: 'SIP debits',        desc: 'Before each mutual-fund SIP is debited',  icon: Repeat,   color: 'text-purple-400' },
  { key: 'fd',   title: 'FD maturity',        desc: 'Before a fixed deposit matures',          icon: Landmark,  color: 'text-blue-400' },
  { key: 'post', title: 'Post Office maturity', desc: 'Before a Post Office scheme matures',   icon: Package,   color: 'text-amber-400' },
];

export default function NotificationsPage() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await getPushState();
      setState(s);
      if (s === 'on') {
        const stored = await fetchPrefs();
        if (stored) setPrefs({ ...DEFAULT_PREFS, ...stored });
      }
    })();
  }, []);

  const flashSaved = () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500); };

  const turnOn = async () => {
    setBusy(true); setError(null);
    try {
      setState(await enablePush({ email: user?.email ?? '', prefs }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true); setError(null);
    try { setState(await disablePush()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const update = async (next: NotifyPrefs) => {
    setPrefs(next);
    if (state === 'on') { await savePrefs(next); flashSaved(); }
  };

  const setEnabled = (key: NotifyCategory, enabled: boolean) =>
    update({ ...prefs, [key]: { ...prefs[key], enabled } });
  const setLead = (key: NotifyCategory, leadDays: number) =>
    update({ ...prefs, [key]: { ...prefs[key], leadDays, enabled: true } });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold text-content">Notifications</h2>
        <p className="text-muted text-sm mt-1">
          Get a push reminder before money moves — SIP debits and deposit maturities.
        </p>
      </div>

      {state === null && (
        <div className="flex items-center gap-2 text-muted text-sm"><Loader2 size={16} className="animate-spin" /> Checking…</div>
      )}

      {state === 'unsupported' && (
        <Notice icon={AlertTriangle} tone="warn"
          title="Not supported on this browser"
          body="This browser can't receive push notifications. Try Chrome, or install the app to your Home Screen on mobile." />
      )}

      {state === 'needs-install' && (
        <Notice icon={Smartphone} tone="accent"
          title="Add to Home Screen first"
          body={<>On iPhone, notifications only work once the app is installed. Tap <b>Share</b> → <b>Add to Home Screen</b>, open it from there, and this page will let you turn them on.</>} />
      )}

      {state === 'denied' && (
        <Notice icon={AlertTriangle} tone="warn"
          title="Notifications are blocked"
          body="You've blocked notifications for this site. Re-allow them in your browser settings, then reload this page." />
      )}

      {(state === 'off' || state === 'on') && (
        <>
          {/* Master switch */}
          <div className="bg-surface border border-edge rounded-2xl shadow-card p-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {state === 'on'
                ? <Bell size={18} className="text-success flex-shrink-0 mt-0.5" />
                : <BellOff size={18} className="text-faint flex-shrink-0 mt-0.5" />}
              <div>
                <p className="text-content font-medium text-sm">
                  Push notifications {state === 'on' ? 'are on' : 'are off'}
                </p>
                <p className="text-faint text-xs mt-0.5">
                  {state === 'on'
                    ? 'This device will receive the reminders enabled below.'
                    : 'Turn on to receive reminders on this device.'}
                  {savedFlash && <span className="text-success ml-1.5">· saved</span>}
                </p>
              </div>
            </div>
            <button onClick={state === 'on' ? turnOff : turnOn} disabled={busy}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                state === 'on' ? 'bg-surface2 text-muted hover:text-content' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              {state === 'on' ? 'Turn off' : 'Turn on'}
            </button>
          </div>

          {error && (
            <p className="text-danger text-xs flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> {error}
            </p>
          )}

          {/* Per-category preferences */}
          <div className={`space-y-3 ${state === 'off' ? 'opacity-60' : ''}`}>
            {state === 'off' && (
              <p className="text-faint text-xs">Choose what to be reminded about — it takes effect when you turn notifications on.</p>
            )}
            {CATEGORIES.map(cat => {
              const pref = prefs[cat.key];
              const Icon = cat.icon;
              return (
                <div key={cat.key} className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Icon size={18} className={`${cat.color} flex-shrink-0 mt-0.5`} />
                      <div>
                        <p className="text-content font-medium text-sm">{cat.title}</p>
                        <p className="text-faint text-xs mt-0.5">{cat.desc}</p>
                      </div>
                    </div>
                    {/* toggle */}
                    <button
                      role="switch" aria-checked={pref.enabled}
                      onClick={() => setEnabled(cat.key, !pref.enabled)}
                      className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${pref.enabled ? 'bg-indigo-600' : 'bg-surface3'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${pref.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </div>

                  {pref.enabled && (
                    <div className="flex items-center gap-1.5 flex-wrap pl-8">
                      <span className="text-faint text-xs mr-0.5">Remind me</span>
                      {LEAD_OPTIONS.map(o => (
                        <button key={o.days} onClick={() => setLead(cat.key, o.days)}
                          className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            pref.leadDays === o.days ? 'bg-indigo-600 text-white' : 'bg-surface2 text-muted hover:text-content'
                          }`}>
                          {o.label} before
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-faint text-xs flex items-start gap-1.5">
            <Check size={12} className="mt-0.5 flex-shrink-0" />
            Settings apply to this device. Your phone and laptop can be set differently.
          </p>
        </>
      )}
    </div>
  );
}

function Notice({ icon: Icon, tone, title, body }: {
  icon: typeof Bell; tone: 'warn' | 'accent'; title: string; body: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-4 flex items-start gap-3">
      <Icon size={18} className={`${tone === 'warn' ? 'text-warn' : 'text-accent'} flex-shrink-0 mt-0.5`} />
      <div className="text-sm">
        <p className="text-content font-medium">{title}</p>
        <p className="text-faint text-xs mt-1 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Lock, Unlock, KeyRound, Plus, Search, Eye, EyeOff, Copy, Check,
  Trash2, Pencil, X, ShieldCheck, ShieldAlert, Globe, RefreshCw,
  Star, HelpCircle, Landmark, CreditCard, Mail, AtSign, Zap,
  Package, Download, LogOut, AlertTriangle, Wand2,
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  deriveKey, encrypt, decrypt, makeVerifier, checkVerifier, randomB64,
  generatePassword, passwordStrength, type CipherBlob, type GenOptions,
} from '../lib/vaultCrypto';

// ─── Firestore ──────────────────────────────────────────────────────────────
const VAULT_DOC = 'shared-family-vault';

interface VaultDoc {
  salt: string;
  verifier: CipherBlob;
  blob: CipherBlob | null;   // encrypted JSON of VaultEntry[]
  updatedAt: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface SecurityQA { id: string; question: string; answer: string; }

interface VaultEntry {
  id: string;
  name: string;
  category: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  securityQuestions: SecurityQA[];
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Categories ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'bank',    label: 'Bank',        icon: Landmark,   color: '#22c55e' },
  { id: 'card',    label: 'Card',        icon: CreditCard, color: '#f97316' },
  { id: 'email',   label: 'Email',       icon: Mail,       color: '#3b82f6' },
  { id: 'social',  label: 'Social',      icon: AtSign,     color: '#ec4899' },
  { id: 'utility', label: 'Utility',     icon: Zap,        color: '#eab308' },
  { id: 'work',    label: 'Work',        icon: Globe,      color: '#a855f7' },
  { id: 'other',   label: 'Other',       icon: Package,    color: '#94a3b8' },
] as const;
const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// ─── Module-level session (survives SPA route changes, cleared on refresh/lock) ─
let sessionKey: CryptoKey | null = null;
let sessionEntries: VaultEntry[] | null = null;

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

const AUTO_LOCK_MS = 5 * 60 * 1000;      // 5 minutes of inactivity (only when NOT remembered)
const CLIPBOARD_CLEAR_MS = 30 * 1000;    // wipe clipboard 30s after copy

// ─── "Remember on this device" (1 year) ─────────────────────────────────────
// Stores the master password locally so the vault auto-unlocks on this
// browser/device without re-prompting. This is a device-trust tradeoff:
// anyone with access to this browser profile can open the vault. Clearing it
// (via the Lock button) requires the master password again.
const REMEMBER_KEY = 'ff_vault_remember';
const ONE_YEAR_MS  = 365 * 24 * 60 * 60 * 1000;

function loadRemembered(): string | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    if (!raw) return null;
    const { pw, expiry } = JSON.parse(raw) as { pw: string; expiry: number };
    if (Date.now() > expiry) { localStorage.removeItem(REMEMBER_KEY); return null; }
    return pw;
  } catch { return null; }
}
function saveRemembered(pw: string) {
  localStorage.setItem(REMEMBER_KEY, JSON.stringify({ pw, expiry: Date.now() + ONE_YEAR_MS }));
}
function clearRemembered() { localStorage.removeItem(REMEMBER_KEY); }
function hasRemembered() { return localStorage.getItem(REMEMBER_KEY) !== null; }

// ─── Component ────────────────────────────────────────────────────────────────
type Screen = 'loading' | 'setup' | 'locked' | 'unlocked';

export default function PasswordVaultPage() {
  const [screen, setScreen]         = useState<Screen>('loading');
  const [vaultDoc, setVaultDoc]     = useState<VaultDoc | null>(null);
  const [entries, setEntries]       = useState<VaultEntry[]>([]);
  const [error, setError]           = useState('');
  const [busy, setBusy]             = useState(false);
  const [rememberActive, setRememberActive] = useState(false);

  const keyRef = useRef<CryptoKey | null>(sessionKey);

  // ── Load vault doc on mount ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', VAULT_DOC));
        if (cancelled) return;
        if (!snap.exists()) {
          setScreen('setup');
          return;
        }
        const vd = snap.data() as VaultDoc;
        setVaultDoc(vd);

        // 1. Reuse an existing in-memory session if the user already unlocked
        if (sessionKey && sessionEntries) {
          keyRef.current = sessionKey;
          setEntries(sessionEntries);
          setRememberActive(hasRemembered());
          setScreen('unlocked');
          return;
        }

        // 2. Auto-unlock from a remembered master password on this device
        const remembered = loadRemembered();
        if (remembered) {
          try {
            const key = await deriveKey(remembered, vd.salt);
            if (await checkVerifier(key, vd.verifier)) {
              const json = vd.blob ? await decrypt(key, vd.blob) : '[]';
              const loaded = JSON.parse(json) as VaultEntry[];
              if (cancelled) return;
              sessionKey = key; sessionEntries = loaded;
              keyRef.current = key;
              setEntries(loaded);
              setRememberActive(true);
              setScreen('unlocked');
              return;
            }
            clearRemembered();   // stale (e.g. master password changed elsewhere)
          } catch {
            clearRemembered();
          }
        }

        // 3. Fall back to the unlock prompt
        if (!cancelled) setScreen('locked');
      } catch {
        setError('Could not reach the vault. Check your connection and reload.');
        setScreen('locked');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Auto-lock on inactivity ─────────────────────────────────────────────────
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lock = useCallback(() => {
    clearRemembered();           // explicit lock forgets this device
    setRememberActive(false);
    sessionKey = null;
    sessionEntries = null;
    keyRef.current = null;
    setEntries([]);
    setScreen(vaultDoc ? 'locked' : 'setup');
  }, [vaultDoc]);

  useEffect(() => {
    // When the vault is remembered on this device, skip inactivity auto-lock.
    if (screen !== 'unlocked' || rememberActive) return;
    const reset = () => {
      if (lockTimer.current) clearTimeout(lockTimer.current);
      lockTimer.current = setTimeout(lock, AUTO_LOCK_MS);
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    events.forEach(e => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      if (lockTimer.current) clearTimeout(lockTimer.current);
    };
  }, [screen, lock, rememberActive]);

  // ── Persist encrypted entries to Firestore ──────────────────────────────────
  const persist = useCallback(async (next: VaultEntry[]) => {
    if (!keyRef.current || !vaultDoc) return;
    const blob = await encrypt(keyRef.current, JSON.stringify(next));
    const updated: VaultDoc = { ...vaultDoc, blob, updatedAt: new Date().toISOString() };
    await setDoc(doc(db, 'users', VAULT_DOC), updated);
    setVaultDoc(updated);
    sessionEntries = next;
  }, [vaultDoc]);

  const commitEntries = useCallback(async (next: VaultEntry[]) => {
    setEntries(next);
    sessionEntries = next;
    await persist(next);
  }, [persist]);

  // ── Screen routing ───────────────────────────────────────────────────────────
  if (screen === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted">
        <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-sm">Opening vault…</p>
      </div>
    );
  }

  if (screen === 'setup') {
    return <SetupScreen busy={busy} error={error}
      onCreate={async (masterPw, remember) => {
        setBusy(true); setError('');
        try {
          const salt = randomB64(16);
          const key = await deriveKey(masterPw, salt);
          const verifier = await makeVerifier(key);
          const blob = await encrypt(key, JSON.stringify([]));
          const vd: VaultDoc = { salt, verifier, blob, updatedAt: new Date().toISOString() };
          await setDoc(doc(db, 'users', VAULT_DOC), vd);
          sessionKey = key; sessionEntries = [];
          keyRef.current = key;
          if (remember) { saveRemembered(masterPw); setRememberActive(true); }
          else { clearRemembered(); setRememberActive(false); }
          setVaultDoc(vd); setEntries([]); setScreen('unlocked');
        } catch {
          setError('Failed to create the vault. Please try again.');
        } finally { setBusy(false); }
      }} />;
  }

  if (screen === 'locked' && vaultDoc) {
    return <UnlockScreen busy={busy} error={error}
      onUnlock={async (masterPw, remember) => {
        setBusy(true); setError('');
        try {
          const key = await deriveKey(masterPw, vaultDoc.salt);
          const ok = await checkVerifier(key, vaultDoc.verifier);
          if (!ok) { setError('Incorrect master password.'); setBusy(false); return; }
          const json = vaultDoc.blob ? await decrypt(key, vaultDoc.blob) : '[]';
          const loaded = JSON.parse(json) as VaultEntry[];
          sessionKey = key; sessionEntries = loaded;
          keyRef.current = key;
          if (remember) { saveRemembered(masterPw); setRememberActive(true); }
          else { clearRemembered(); setRememberActive(false); }
          setEntries(loaded); setScreen('unlocked');
        } catch {
          setError('Incorrect master password.');
        } finally { setBusy(false); }
      }} />;
  }

  if (screen === 'unlocked' && keyRef.current) {
    return <VaultScreen
      entries={entries}
      updatedAt={vaultDoc?.updatedAt ?? ''}
      cryptoKey={keyRef.current}
      salt={vaultDoc?.salt ?? ''}
      remembered={rememberActive}
      onCommit={commitEntries}
      onLock={lock}
      onMasterChanged={(vd) => { setVaultDoc(vd); }}
    />;
  }

  return null;
}

// ─── Shared input style ─────────────────────────────────────────────────────
const inputCls =
  'w-full bg-surface border border-edge rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint';

// ═══════════════════════════════════════════════════════════════════════════
// SETUP SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function SetupScreen({ onCreate, busy, error }: {
  onCreate: (pw: string, remember: boolean) => void; busy: boolean; error: string;
}) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const strength = passwordStrength(pw);
  const mismatch = confirm.length > 0 && pw !== confirm;
  const tooShort = pw.length > 0 && pw.length < 8;
  const canSubmit = pw.length >= 8 && pw === confirm && !busy;

  return (
    <div className="max-w-md mx-auto mt-10">
      <div className="bg-surface border border-edge rounded-3xl shadow-card p-8">
        <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <KeyRound size={28} className="text-accent" />
        </div>
        <h2 className="text-xl font-bold text-content text-center">Create your vault</h2>
        <p className="text-muted text-sm text-center mt-2 mb-6">
          Set a master password. It encrypts everything on this device before syncing —
          we can never see it or recover it.
        </p>

        <div className="space-y-3">
          <div className="relative">
            <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)}
              placeholder="Master password" className={inputCls} autoFocus />
            <button onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {pw && (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex gap-1">
                {[0,1,2,3].map(i => (
                  <div key={i} className="h-1 flex-1 rounded-full transition-colors"
                    style={{ backgroundColor: i < strength.score ? strength.color : '#334155' }} />
                ))}
              </div>
              <span className="text-xs font-medium" style={{ color: strength.color }}>{strength.label}</span>
            </div>
          )}

          <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Confirm master password" className={inputCls} />

          {tooShort && <p className="text-warn text-xs">Use at least 8 characters.</p>}
          {mismatch && <p className="text-danger text-xs">Passwords don't match.</p>}
          {error && <p className="text-danger text-xs">{error}</p>}

          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mt-1">
            <AlertTriangle size={15} className="text-warn flex-shrink-0 mt-0.5" />
            <p className="text-warn/90 text-xs leading-relaxed">
              Write this down somewhere safe. If you forget it, your saved passwords
              <strong> cannot be recovered</strong> — not even by us.
            </p>
          </div>

          <RememberToggle checked={remember} onChange={setRemember} />

          <button onClick={() => onCreate(pw, remember)} disabled={!canSubmit}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl py-3 text-sm font-semibold transition-colors mt-1 flex items-center justify-center gap-2">
            {busy ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Create Vault
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// UNLOCK SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function UnlockScreen({ onUnlock, busy, error }: {
  onUnlock: (pw: string, remember: boolean) => void; busy: boolean; error: string;
}) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="bg-surface border border-edge rounded-3xl shadow-card p-8">
        <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Lock size={26} className="text-accent" />
        </div>
        <h2 className="text-xl font-bold text-content text-center">Vault locked</h2>
        <p className="text-muted text-sm text-center mt-2 mb-6">
          Enter your master password to unlock.
        </p>

        <form onSubmit={e => { e.preventDefault(); if (pw && !busy) onUnlock(pw, remember); }} className="space-y-3">
          <div className="relative">
            <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)}
              placeholder="Master password" className={inputCls} autoFocus />
            <button type="button" onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <RememberToggle checked={remember} onChange={setRemember} />
          {error && <p className="text-danger text-xs">{error}</p>}
          <button type="submit" disabled={!pw || busy}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            {busy ? <RefreshCw size={16} className="animate-spin" /> : <Unlock size={16} />}
            Unlock Vault
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Remember-on-device toggle ───────────────────────────────────────────────
function RememberToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer bg-surface border border-edge rounded-xl px-3 py-2.5 select-none">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="accent-indigo-500 w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-content text-sm">Remember on this device for 1 year</p>
        <p className="text-faint text-[11px] leading-snug mt-0.5">
          Auto-unlocks on this browser without asking again. Only enable on a device you trust.
        </p>
      </div>
    </label>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COPY BUTTON (with auto-clear feedback)
// ═══════════════════════════════════════════════════════════════════════════
function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      // Wipe clipboard after a delay for safety
      setTimeout(async () => {
        try {
          const cur = await navigator.clipboard.readText().catch(() => '');
          if (cur === value) await navigator.clipboard.writeText('');
        } catch { /* clipboard read may be blocked — ignore */ }
      }, CLIPBOARD_CLEAR_MS);
    } catch { /* ignore */ }
  };
  return (
    <button onClick={copy} title={`Copy ${label ?? ''}`}
      className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-surface3 transition-colors flex-shrink-0">
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VAULT SCREEN (main)
// ═══════════════════════════════════════════════════════════════════════════
function VaultScreen({ entries, updatedAt, cryptoKey, salt, remembered, onCommit, onLock, onMasterChanged }: {
  entries: VaultEntry[];
  updatedAt: string;
  cryptoKey: CryptoKey;
  salt: string;
  remembered: boolean;
  onCommit: (next: VaultEntry[]) => Promise<void>;
  onLock: () => void;
  onMasterChanged: (vd: VaultDoc) => void;
}) {
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [editing, setEditing]     = useState<VaultEntry | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [showChangeMaster, setShowChangeMaster] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries
      .filter(e => filterCat === 'all' || e.category === filterCat)
      .filter(e => !q || e.name.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) || e.url.toLowerCase().includes(q))
      .sort((a, b) =>
        (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) ||
        a.name.localeCompare(b.name));
  }, [entries, search, filterCat]);

  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return m;
  }, [entries]);

  const saveEntry = async (entry: VaultEntry) => {
    const exists = entries.some(e => e.id === entry.id);
    const next = exists
      ? entries.map(e => e.id === entry.id ? entry : e)
      : [...entries, entry];
    await onCommit(next);
    setShowForm(false); setEditing(null);
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this entry permanently?')) return;
    await onCommit(entries.filter(e => e.id !== id));
  };

  const toggleFav = async (id: string) => {
    await onCommit(entries.map(e => e.id === id ? { ...e, favorite: !e.favorite } : e));
  };

  const exportBackup = () => {
    // Encrypted backup — still requires the master password to open
    const payload = JSON.stringify({ salt, updatedAt, entries }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vault-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-content flex items-center gap-2">
            <ShieldCheck size={22} className="text-success" /> Password Vault
          </h2>
          <p className="text-muted text-sm mt-1">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · encrypted end-to-end
            {updatedAt && ` · updated ${new Date(updatedAt).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}`}
          </p>
          {remembered && (
            <p className="text-success/80 text-xs mt-1 flex items-center gap-1">
              <Check size={11} /> Remembered on this device — auto-unlocks for 1 year
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportBackup} title="Download encrypted backup"
            className="flex items-center gap-1.5 text-muted hover:text-content text-sm border border-edge hover:border-edge rounded-xl px-3 py-2 transition-colors">
            <Download size={14} /> Backup
          </button>
          <button onClick={() => setShowChangeMaster(true)} title="Change master password"
            className="flex items-center gap-1.5 text-muted hover:text-content text-sm border border-edge hover:border-edge rounded-xl px-3 py-2 transition-colors">
            <KeyRound size={14} />
          </button>
          <button onClick={onLock}
            title={remembered ? 'Locks now and forgets this device (master password required next time)' : 'Lock the vault'}
            className="flex items-center gap-1.5 text-warn hover:text-warn text-sm border border-amber-500/30 hover:border-amber-500/50 rounded-xl px-3 py-2 transition-colors">
            <LogOut size={14} /> {remembered ? 'Lock & Forget' : 'Lock'}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, username or URL…"
            className="w-full bg-surface border border-edge rounded-xl pl-9 pr-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500" />
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors flex-shrink-0">
          <Plus size={16} /> Add Entry
        </button>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setFilterCat('all')}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
            filterCat === 'all' ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-surface border-edge text-muted hover:text-content'}`}>
          All ({entries.length})
        </button>
        {CATEGORIES.map(c => {
          const n = catCounts.get(c.id) ?? 0;
          if (n === 0) return null;
          return (
            <button key={c.id} onClick={() => setFilterCat(c.id)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                filterCat === c.id ? 'text-content' : 'bg-surface border-edge text-muted hover:text-content'}`}
              style={filterCat === c.id ? { backgroundColor: c.color + '30', borderColor: c.color + '70' } : {}}>
              <c.icon size={12} style={{ color: filterCat === c.id ? c.color : undefined }} /> {c.label} ({n})
            </button>
          );
        })}
      </div>

      {/* Entry list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-faint">
          <Lock size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{entries.length === 0
            ? 'Your vault is empty. Add your first password.'
            : 'No entries match your search.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(e => (
            <EntryCard key={e.id} entry={e}
              onEdit={() => { setEditing(e); setShowForm(true); }}
              onDelete={() => deleteEntry(e.id)}
              onToggleFav={() => toggleFav(e.id)} />
          ))}
        </div>
      )}

      {/* Add/Edit form modal */}
      {showForm && (
        <EntryForm entry={editing}
          onSave={saveEntry}
          onCancel={() => { setShowForm(false); setEditing(null); }} />
      )}

      {/* Change master password modal */}
      {showChangeMaster && (
        <ChangeMasterModal salt={salt} entries={entries} currentKey={cryptoKey}
          onDone={(vd) => { onMasterChanged(vd); setShowChangeMaster(false); }}
          onCancel={() => setShowChangeMaster(false)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY CARD
// ═══════════════════════════════════════════════════════════════════════════
function EntryCard({ entry, onEdit, onDelete, onToggleFav }: {
  entry: VaultEntry; onEdit: () => void; onDelete: () => void; onToggleFav: () => void;
}) {
  const [showPw, setShowPw] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const cat = CAT_MAP[entry.category] ?? CAT_MAP['other'];
  const Icon = cat.icon;
  const host = (() => { try { return entry.url ? new URL(entry.url).hostname : ''; } catch { return entry.url; } })();

  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-4 flex flex-col gap-3">
      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: cat.color + '20' }}>
          <Icon size={18} style={{ color: cat.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-content font-semibold text-sm truncate">{entry.name}</h3>
            {entry.favorite && <Star size={12} className="text-warn fill-amber-400 flex-shrink-0" />}
          </div>
          {host && (
            <a href={entry.url} target="_blank" rel="noreferrer"
              className="text-accent hover:text-accent text-xs flex items-center gap-1 truncate">
              <Globe size={10} /> {host}
            </a>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button onClick={onToggleFav} title="Favorite"
            className="p-1.5 rounded-lg text-faint hover:text-warn hover:bg-surface3 transition-colors">
            <Star size={13} className={entry.favorite ? 'text-warn fill-amber-400' : ''} />
          </button>
          <button onClick={onEdit} title="Edit"
            className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-surface3 transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete} title="Delete"
            className="p-1.5 rounded-lg text-faint hover:text-danger hover:bg-red-500/10 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Credentials */}
      <div className="space-y-1.5">
        {entry.username && (
          <div className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2">
            <span className="text-faint text-xs uppercase w-16 flex-shrink-0">User</span>
            <span className="text-content text-sm font-mono truncate flex-1">{entry.username}</span>
            <CopyBtn value={entry.username} label="username" />
          </div>
        )}
        {entry.password && (
          <div className="flex items-center gap-2 bg-surface rounded-lg px-3 py-2">
            <span className="text-faint text-xs uppercase w-16 flex-shrink-0">Pass</span>
            <span className="text-content text-sm font-mono truncate flex-1">
              {showPw ? entry.password : '•'.repeat(Math.min(entry.password.length, 12))}
            </span>
            <button onClick={() => setShowPw(s => !s)}
              className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-surface3 transition-colors flex-shrink-0">
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            <CopyBtn value={entry.password} label="password" />
          </div>
        )}
      </div>

      {/* Security questions / notes toggle */}
      {(entry.securityQuestions.length > 0 || entry.notes) && (
        <button onClick={() => setExpanded(x => !x)}
          className="text-muted hover:text-content text-xs flex items-center gap-1.5 transition-colors">
          <HelpCircle size={12} />
          {entry.securityQuestions.length > 0 && `${entry.securityQuestions.length} security Q&A`}
          {entry.securityQuestions.length > 0 && entry.notes && ' · '}
          {entry.notes && 'notes'}
          <span className="text-faint">{expanded ? '▲' : '▼'}</span>
        </button>
      )}

      {expanded && (
        <div className="space-y-2 border-t border-edge pt-3">
          {entry.securityQuestions.map(qa => (
            <div key={qa.id} className="bg-surface rounded-lg px-3 py-2">
              <p className="text-muted text-xs mb-1">{qa.question}</p>
              <div className="flex items-center gap-2">
                <span className="text-content text-sm font-mono truncate flex-1">{qa.answer}</span>
                <CopyBtn value={qa.answer} label="answer" />
              </div>
            </div>
          ))}
          {entry.notes && (
            <div className="bg-surface rounded-lg px-3 py-2">
              <p className="text-faint text-xs uppercase mb-1">Notes</p>
              <p className="text-muted text-sm whitespace-pre-wrap break-words">{entry.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY FORM
// ═══════════════════════════════════════════════════════════════════════════
function EntryForm({ entry, onSave, onCancel }: {
  entry: VaultEntry | null;
  onSave: (e: VaultEntry) => void;
  onCancel: () => void;
}) {
  const [name, setName]         = useState(entry?.name ?? '');
  const [category, setCategory] = useState(entry?.category ?? 'bank');
  const [url, setUrl]           = useState(entry?.url ?? '');
  const [username, setUsername] = useState(entry?.username ?? '');
  const [password, setPassword] = useState(entry?.password ?? '');
  const [notes, setNotes]       = useState(entry?.notes ?? '');
  const [favorite, setFavorite] = useState(entry?.favorite ?? false);
  const [qas, setQas]           = useState<SecurityQA[]>(entry?.securityQuestions ?? []);
  const [showPw, setShowPw]     = useState(false);
  const [showGen, setShowGen]   = useState(false);

  const strength = passwordStrength(password);

  const addQA = () => setQas(q => [...q, { id: uid(), question: '', answer: '' }]);
  const updateQA = (id: string, field: 'question' | 'answer', val: string) =>
    setQas(q => q.map(x => x.id === id ? { ...x, [field]: val } : x));
  const removeQA = (id: string) => setQas(q => q.filter(x => x.id !== id));

  const submit = () => {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    onSave({
      id: entry?.id ?? uid(),
      name: name.trim(),
      category, url: url.trim(),
      username: username.trim(),
      password,
      notes: notes.trim(),
      securityQuestions: qas
        .filter(q => q.question.trim() || q.answer.trim())
        .map(q => ({ ...q, question: q.question.trim(), answer: q.answer.trim() })),
      favorite,
      createdAt: entry?.createdAt ?? now,
      updatedAt: now,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-surface border border-edge rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-edge sticky top-0 bg-surface z-10">
          <h2 className="text-lg font-semibold text-content">{entry ? 'Edit Entry' : 'New Entry'}</h2>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-surface text-muted hover:text-content transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="text-muted text-xs mb-1.5 block">Entity name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SBI, ICICI, Gmail"
              className={inputCls} autoFocus />
          </div>

          {/* Category */}
          <div>
            <label className="text-muted text-xs mb-1.5 block">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all ${
                    category === c.id ? 'text-content' : 'bg-surface border-edge text-muted hover:text-content'}`}
                  style={category === c.id ? { backgroundColor: c.color + '30', borderColor: c.color + '70' } : {}}>
                  <c.icon size={13} style={{ color: category === c.id ? c.color : undefined }} /> {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* URL */}
          <div>
            <label className="text-muted text-xs mb-1.5 block">Website URL</label>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://onlinesbi.sbi"
              className={inputCls} />
          </div>

          {/* Username */}
          <div>
            <label className="text-muted text-xs mb-1.5 block">Username / Customer ID</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Login ID"
              className={inputCls} />
          </div>

          {/* Password + generator */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-muted text-xs">Password</label>
              <button type="button" onClick={() => setShowGen(g => !g)}
                className="text-accent hover:text-accent text-xs flex items-center gap-1">
                <Wand2 size={12} /> Generate
              </button>
            </div>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Password" className={inputCls + ' pr-10 font-mono'} />
              <button type="button" onClick={() => setShowPw(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 flex gap-1">
                  {[0,1,2,3].map(i => (
                    <div key={i} className="h-1 flex-1 rounded-full"
                      style={{ backgroundColor: i < strength.score ? strength.color : '#334155' }} />
                  ))}
                </div>
                <span className="text-xs font-medium" style={{ color: strength.color }}>{strength.label}</span>
              </div>
            )}
            {showGen && <PasswordGenerator onUse={pw => { setPassword(pw); setShowPw(true); }} />}
          </div>

          {/* Security Q&A */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-muted text-xs">Security questions</label>
              <button type="button" onClick={addQA}
                className="text-accent hover:text-accent text-xs flex items-center gap-1">
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {qas.map(qa => (
                <div key={qa.id} className="bg-surface border border-edge rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input value={qa.question} onChange={e => updateQA(qa.id, 'question', e.target.value)}
                      placeholder="Question (e.g. First school?)"
                      className="flex-1 bg-surface border border-edge rounded-lg px-3 py-2 text-content text-sm outline-none focus:border-indigo-500" />
                    <button type="button" onClick={() => removeQA(qa.id)}
                      className="p-1.5 text-faint hover:text-danger rounded-lg transition-colors flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <input value={qa.answer} onChange={e => updateQA(qa.id, 'answer', e.target.value)}
                    placeholder="Answer"
                    className="w-full bg-surface border border-edge rounded-lg px-3 py-2 text-content text-sm outline-none focus:border-indigo-500" />
                </div>
              ))}
              {qas.length === 0 && (
                <p className="text-faint text-xs">No security questions added.</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-muted text-xs mb-1.5 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Any extra details (recovery email, PIN hints, etc.)"
              className={inputCls + ' resize-none'} />
          </div>

          {/* Favorite */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={favorite} onChange={e => setFavorite(e.target.checked)}
              className="accent-amber-400 w-4 h-4" />
            <span className="text-muted text-sm flex items-center gap-1">
              <Star size={13} className="text-warn" /> Pin to top
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2 p-5 border-t border-edge sticky bottom-0 bg-surface">
          <button onClick={submit} disabled={!name.trim()}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            <Check size={16} /> {entry ? 'Save Changes' : 'Add Entry'}
          </button>
          <button onClick={onCancel}
            className="px-4 py-2.5 text-muted hover:text-content text-sm border border-edge rounded-xl transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD GENERATOR
// ═══════════════════════════════════════════════════════════════════════════
function PasswordGenerator({ onUse }: { onUse: (pw: string) => void }) {
  const [opts, setOpts] = useState<GenOptions>({ length: 16, upper: true, lower: true, digits: true, symbols: true });
  const [generated, setGenerated] = useState('');

  const regen = useCallback(() => setGenerated(generatePassword(opts)), [opts]);
  useEffect(() => { regen(); }, [regen]);

  const toggle = (k: keyof GenOptions) =>
    setOpts(o => ({ ...o, [k]: !o[k] }));

  return (
    <div className="mt-2 bg-surface border border-indigo-500/20 rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-sm text-content truncate">{generated}</span>
        <button type="button" onClick={regen} title="Regenerate"
          className="p-1.5 rounded-lg text-muted hover:text-content hover:bg-surface3 transition-colors">
          <RefreshCw size={14} />
        </button>
        <CopyBtn value={generated} label="generated password" />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-muted text-xs w-14">Length</span>
        <input type="range" min={8} max={32} value={opts.length}
          onChange={e => setOpts(o => ({ ...o, length: +e.target.value }))}
          className="flex-1 accent-indigo-500" />
        <span className="text-content text-xs font-mono w-6 text-right">{opts.length}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([['upper','A-Z'],['lower','a-z'],['digits','0-9'],['symbols','!@#']] as [keyof GenOptions, string][]).map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => toggle(k)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              opts[k] ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-surface border-edge text-muted hover:text-content'}`}>
            {lbl}
          </button>
        ))}
        <button type="button" onClick={() => onUse(generated)}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors">
          Use this
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHANGE MASTER PASSWORD
// ═══════════════════════════════════════════════════════════════════════════
function ChangeMasterModal({ salt, entries, currentKey, onDone, onCancel }: {
  salt: string;
  entries: VaultEntry[];
  currentKey: CryptoKey;
  onDone: (vd: VaultDoc) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const strength = passwordStrength(pw);
  const canSubmit = pw.length >= 8 && pw === confirm && !busy;

  // currentKey retained in signature for clarity; re-encryption uses a fresh key.
  void currentKey;

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const newSalt = randomB64(16);
      const newKey = await deriveKey(pw, newSalt);
      const verifier = await makeVerifier(newKey);
      const blob = await encrypt(newKey, JSON.stringify(entries));
      const vd: VaultDoc = { salt: newSalt, verifier, blob, updatedAt: new Date().toISOString() };
      await setDoc(doc(db, 'users', VAULT_DOC), vd);
      // Refresh module session so the vault stays unlocked with the new key
      sessionKey = newKey;
      sessionEntries = entries;
      // If this device is remembered, update the stored password to the new one
      if (hasRemembered()) saveRemembered(pw);
      onDone(vd);
    } catch {
      setErr('Could not change the master password. Try again.');
    } finally { setBusy(false); }
  };

  void salt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md bg-surface border border-edge rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-content flex items-center gap-2">
            <KeyRound size={18} className="text-accent" /> Change Master Password
          </h2>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-surface text-muted hover:text-content transition-colors">
            <X size={18} />
          </button>
        </div>

        <p className="text-muted text-xs mb-4 flex items-start gap-2">
          <ShieldAlert size={14} className="text-warn flex-shrink-0 mt-0.5" />
          All {entries.length} entries will be re-encrypted with the new password.
        </p>

        <div className="space-y-3">
          <input type="password" value={pw} onChange={e => setPw(e.target.value)}
            placeholder="New master password" className={inputCls} autoFocus />
          {pw && (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex gap-1">
                {[0,1,2,3].map(i => (
                  <div key={i} className="h-1 flex-1 rounded-full"
                    style={{ backgroundColor: i < strength.score ? strength.color : '#334155' }} />
                ))}
              </div>
              <span className="text-xs font-medium" style={{ color: strength.color }}>{strength.label}</span>
            </div>
          )}
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Confirm new password" className={inputCls} />
          {err && <p className="text-danger text-xs">{err}</p>}
          <button onClick={submit} disabled={!canSubmit}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
            {busy ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
            Update Password
          </button>
        </div>
      </div>
    </div>
  );
}

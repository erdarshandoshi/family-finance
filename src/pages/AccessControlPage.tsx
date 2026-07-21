import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Plus, Trash2, Shield, AlertTriangle, Users, Check, Clock } from 'lucide-react';

interface AccessRequest {
  email: string;
  name: string;
  requestedAt: string;
}

export default function AccessControlPage() {
  const { user } = useAuth();
  const [emails, setEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [requests, setRequests] = useState<AccessRequest[]>([]);

  useEffect(() => {
    Promise.all([
      getDoc(doc(db, 'users', 'access-control')),
      getDoc(doc(db, 'users', 'access-requests')),
    ]).then(([accessSnap, requestsSnap]) => {
      if (accessSnap.exists()) setEmails((accessSnap.data() as { emails: string[] }).emails ?? []);
      if (requestsSnap.exists()) setRequests((requestsSnap.data() as { requests: AccessRequest[] }).requests ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const approveRequest = async (req: AccessRequest) => {
    const newEmails = emails.includes(req.email) ? emails : [...emails, req.email];
    const newRequests = requests.filter(r => r.email !== req.email);
    await Promise.all([
      setDoc(doc(db, 'users', 'access-control'), { emails: newEmails }),
      setDoc(doc(db, 'users', 'access-requests'), { requests: newRequests }),
    ]);
    setEmails(newEmails);
    setRequests(newRequests);
  };

  const denyRequest = async (email: string) => {
    const newRequests = requests.filter(r => r.email !== email);
    await setDoc(doc(db, 'users', 'access-requests'), { requests: newRequests });
    setRequests(newRequests);
  };

  const persistEmails = async (updated: string[]) => {
    setSaving(true);
    setSaved(false);
    try {
      await setDoc(doc(db, 'users', 'access-control'), { emails: updated });
      setEmails(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { setError('Enter a valid email address'); return; }
    if (emails.includes(email)) { setError('Email is already in the list'); return; }
    setError('');
    persistEmails([...emails, email]);
    setNewEmail('');
  };

  const removeEmail = (email: string) => {
    if (window.confirm(`Remove ${email} from the access list?`)) {
      persistEmails(emails.filter(e => e !== email));
    }
  };

  const isOpenAccess = emails.length === 0;
  const selfMissing = user && emails.length > 0 && !emails.includes(user.email.toLowerCase());

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-content">User Access Control</h2>
        <p className="text-muted text-sm mt-1">Manage who can log in to this application</p>
      </div>

      {/* Status banner */}
      <div className={`rounded-xl p-4 flex items-start gap-3 border ${isOpenAccess ? 'bg-blue-500/10 border-blue-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
        <Shield size={18} className={`flex-shrink-0 mt-0.5 ${isOpenAccess ? 'text-blue-400' : 'text-success'}`} />
        <div>
          <p className={`font-semibold text-sm ${isOpenAccess ? 'text-blue-300' : 'text-success'}`}>
            {isOpenAccess ? 'Open Access — No restrictions' : `Restricted Access — ${emails.length} authorised user${emails.length !== 1 ? 's' : ''}`}
          </p>
          <p className="text-muted text-xs mt-0.5">
            {isOpenAccess
              ? 'Anyone with a valid Google account can log in. Add at least one email to restrict access.'
              : 'Only the listed email addresses will be able to log in with Google.'}
          </p>
        </div>
      </div>

      {/* Current user card */}
      {user && (
        <div className="bg-surface border border-edge rounded-xl p-4 flex items-center gap-3">
          <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full ring-2 ring-indigo-500/30" />
          <div>
            <p className="text-content text-sm font-medium">{user.name}</p>
            <p className="text-muted text-xs">{user.email} · Currently logged in</p>
          </div>
        </div>
      )}

      {/* Self-missing warning */}
      {selfMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-warn flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-warn text-sm font-medium">You are not in the access list</p>
            <p className="text-muted text-xs mt-0.5">
              Your account ({user?.email}) will be blocked on the next login.{' '}
              <button
                onClick={() => persistEmails([...emails, user?.email.toLowerCase() ?? ''])}
                className="text-warn underline hover:text-warn transition-colors"
              >
                Add yourself now
              </button>
            </p>
          </div>
        </div>
      )}

      {/* Pending access requests */}
      {requests.length > 0 && (
        <div className="bg-surface border border-amber-500/30 rounded-2xl p-5 space-y-3">
          <h3 className="text-content font-semibold text-sm flex items-center gap-2">
            <Clock size={16} className="text-warn" />
            Pending Access Requests
            <span className="ml-auto bg-amber-500/20 text-warn text-xs font-semibold px-2 py-0.5 rounded-full">
              {requests.length}
            </span>
          </h3>
          {requests.map(req => (
            <div key={req.email} className="flex items-center justify-between bg-surface2 rounded-xl px-4 py-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-amber-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-warn text-sm font-bold uppercase">{req.email[0]}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-content text-sm truncate">{req.name || req.email}</p>
                  <p className="text-muted text-xs truncate">{req.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => approveRequest(req)}
                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  <Check size={12} /> Approve
                </button>
                <button
                  onClick={() => denyRequest(req.email)}
                  className="flex items-center gap-1 bg-surface3 hover:bg-surface3 text-content text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  <Trash2 size={12} /> Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manage list */}
      <div className="bg-surface border border-edge rounded-2xl shadow-card p-5 space-y-4">
        <h3 className="text-content font-semibold text-sm flex items-center gap-2">
          <Users size={16} className="text-accent" />
          Authorised Users
        </h3>

        {/* Add row */}
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="user@gmail.com"
            value={newEmail}
            onChange={e => { setNewEmail(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && addEmail()}
            className="flex-1 bg-surface3 border border-edge rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint"
          />
          <button
            onClick={addEmail}
            disabled={saving}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={15} /> Add
          </button>
        </div>

        {error && (
          <p className="text-danger text-xs flex items-center gap-1.5">
            <AlertTriangle size={12} /> {error}
          </p>
        )}
        {saved && (
          <p className="text-success text-xs">Saved successfully.</p>
        )}

        {/* Email list */}
        {loading ? (
          <div className="text-faint text-sm text-center py-6">Loading…</div>
        ) : emails.length === 0 ? (
          <div className="text-center py-10 text-faint">
            <Users size={36} className="mx-auto mb-3 opacity-25" />
            <p className="text-sm">No restrictions set. Add an email to lock down access.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {emails.map(email => (
              <div key={email} className="flex items-center justify-between bg-surface2 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-accent text-sm font-bold uppercase">{email[0]}</span>
                  </div>
                  <div>
                    <p className="text-content text-sm">{email}</p>
                    {user?.email.toLowerCase() === email && (
                      <p className="text-accent text-xs">You</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeEmail(email)}
                  disabled={saving}
                  className="p-1.5 text-faint hover:text-danger hover:bg-surface3 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-surface border border-edge rounded-xl p-4 space-y-2">
        <p className="text-muted text-xs font-medium uppercase tracking-wide">How it works</p>
        <ul className="text-faint text-xs space-y-1 list-disc list-inside">
          <li>If the list is <span className="text-muted">empty</span>, anyone with a Google account can log in.</li>
          <li>Once you add at least one email, only those accounts will be granted access.</li>
          <li>Changes take effect on the next login attempt.</li>
          <li>Make sure to include your own email before enabling restrictions.</li>
        </ul>
      </div>
    </div>
  );
}

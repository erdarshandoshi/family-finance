import React, { createContext, useContext, useReducer, useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import type {
  AppData, FamilyMember, FD, Stock, MutualFund,
  PPFEntry, PFEntry, InsurancePolicy, PostInvestment, NPSEntry, JournalEntry, MemberRelation,
  NetWorthSnapshot, Goals, FolioMapping, PendingTransaction,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY   = 'family-finance-data';
const LS_BACKUP_KEY = 'family-finance-data-backup';

// Single shared Firestore document for all family members
const SHARED_DOC    = 'shared-family';
const SHARED_BK_DOC = 'shared-family_bk';

// Default member tab per email address
const MEMBER_TAB_DEFAULTS: Record<string, MemberRelation> = {
  'er.darshandoshi@gmail.com':    'self',
  'niyaatipatel@gmail.com':       'wife',
  'darshandoshi1990@gmail.com':   'kid',
};

// Resolve the member tab a given user should land on by default.
function resolveDefaultMemberId(members: FamilyMember[], email: string): string {
  const rel = MEMBER_TAB_DEFAULTS[email];
  const target = rel ? members.find(m => m.relation === rel) : undefined;
  return target?.id ?? members[0]?.id ?? '1';
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const defaultMembers: FamilyMember[] = [
  { id: '1', name: 'Me',   relation: 'self' },
  { id: '2', name: 'Wife', relation: 'wife' },
  { id: '3', name: 'Kid',  relation: 'kid'  },
];

const initialData: AppData = {
  members: defaultMembers,
  fds: [], stocks: [], mfs: [], ppf: [], pf: [],
  insurances: [], postInvestments: [], nps: [], journal: [],
  snapshots: [], goals: {},
  folioMappings: [], pendingTransactions: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countInvestments(d: AppData): number {
  return (d.fds?.length ?? 0) + (d.stocks?.length ?? 0) + (d.mfs?.length ?? 0)
       + (d.ppf?.length ?? 0) + (d.pf?.length ?? 0) + (d.insurances?.length ?? 0)
       + (d.postInvestments?.length ?? 0) + (d.nps?.length ?? 0);
}

function normalize(data: AppData): AppData {
  const d = data as unknown as Record<string, unknown>;
  return {
    ...data,
    insurances:      Array.isArray(d['insurances'])      ? data.insurances      : [],
    postInvestments: Array.isArray(d['postInvestments']) ? data.postInvestments : [],
    nps:             Array.isArray(d['nps'])             ? data.nps             : [],
    journal:         Array.isArray(d['journal'])         ? data.journal         : [],
    snapshots:       Array.isArray(d['snapshots'])       ? data.snapshots       : [],
    goals:           (d['goals'] && typeof d['goals'] === 'object') ? data.goals : {},
    folioMappings:      Array.isArray(d['folioMappings'])      ? data.folioMappings      : [],
    pendingTransactions: Array.isArray(d['pendingTransactions']) ? data.pendingTransactions : [],
  };
}

// Returns the candidate that has the most investment entries
function pickBest(...candidates: (AppData | null)[]): AppData | null {
  let best: AppData | null = null;
  let bestCount = -1;
  for (const c of candidates) {
    if (!c) continue;
    const n = countInvestments(c);
    if (n > bestCount) { best = c; bestCount = n; }
  }
  return best;
}

async function tryGetDoc(path: string): Promise<AppData | null> {
  try {
    const snap = await getDoc(doc(db, 'users', path));
    if (!snap.exists()) return null;
    return normalize(snap.data() as AppData);
  } catch { return null; }
}

function tryParseLS(key: string): AppData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return normalize(JSON.parse(raw) as AppData);
  } catch { return null; }
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_DATA'; payload: AppData }
  | { type: 'UPDATE_MEMBER'; payload: FamilyMember }
  | { type: 'ADD_FD'; payload: FD }        | { type: 'UPDATE_FD'; payload: FD }        | { type: 'DELETE_FD'; payload: string }
  | { type: 'ADD_STOCK'; payload: Stock }  | { type: 'UPDATE_STOCK'; payload: Stock }  | { type: 'DELETE_STOCK'; payload: string }
  | { type: 'ADD_MF'; payload: MutualFund }| { type: 'UPDATE_MF'; payload: MutualFund }| { type: 'DELETE_MF'; payload: string }
  | { type: 'UPSERT_PPF'; payload: PPFEntry }
  | { type: 'UPSERT_PF'; payload: PFEntry }
  | { type: 'ADD_INSURANCE'; payload: InsurancePolicy }  | { type: 'UPDATE_INSURANCE'; payload: InsurancePolicy }  | { type: 'DELETE_INSURANCE'; payload: string }
  | { type: 'ADD_POST'; payload: PostInvestment }        | { type: 'UPDATE_POST'; payload: PostInvestment }        | { type: 'DELETE_POST'; payload: string }
  | { type: 'ADD_NPS'; payload: NPSEntry }               | { type: 'UPDATE_NPS'; payload: NPSEntry }               | { type: 'DELETE_NPS'; payload: string }
  | { type: 'ADD_JOURNAL'; payload: JournalEntry }       | { type: 'UPDATE_JOURNAL'; payload: JournalEntry }       | { type: 'DELETE_JOURNAL'; payload: string }
  | { type: 'ADD_SNAPSHOT'; payload: NetWorthSnapshot }
  | { type: 'SET_GOALS'; payload: Goals }
  | { type: 'UPSERT_FOLIO'; payload: FolioMapping }     | { type: 'DELETE_FOLIO'; payload: string }
  | { type: 'ADD_PENDING'; payload: PendingTransaction } | { type: 'DELETE_PENDING'; payload: string };

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'SET_DATA': return normalize(action.payload);
    case 'UPDATE_MEMBER':
      return { ...state, members: state.members.map(m => m.id === action.payload.id ? action.payload : m) };
    case 'ADD_FD':    return { ...state, fds: [...state.fds, action.payload] };
    case 'UPDATE_FD': return { ...state, fds: state.fds.map(f => f.id === action.payload.id ? action.payload : f) };
    case 'DELETE_FD': return { ...state, fds: state.fds.filter(f => f.id !== action.payload) };
    case 'ADD_STOCK':    return { ...state, stocks: [...state.stocks, action.payload] };
    case 'UPDATE_STOCK': return { ...state, stocks: state.stocks.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_STOCK': return { ...state, stocks: state.stocks.filter(s => s.id !== action.payload) };
    case 'ADD_MF':    return { ...state, mfs: [...state.mfs, action.payload] };
    case 'UPDATE_MF': return { ...state, mfs: state.mfs.map(m => m.id === action.payload.id ? action.payload : m) };
    case 'DELETE_MF': return { ...state, mfs: state.mfs.filter(m => m.id !== action.payload) };
    case 'UPSERT_PPF': {
      const exists = state.ppf.find(p => p.memberId === action.payload.memberId);
      return { ...state, ppf: exists ? state.ppf.map(p => p.memberId === action.payload.memberId ? action.payload : p) : [...state.ppf, action.payload] };
    }
    case 'UPSERT_PF': {
      const exists = state.pf.find(p => p.memberId === action.payload.memberId);
      return { ...state, pf: exists ? state.pf.map(p => p.memberId === action.payload.memberId ? action.payload : p) : [...state.pf, action.payload] };
    }
    case 'ADD_INSURANCE':    return { ...state, insurances: [...state.insurances, action.payload] };
    case 'UPDATE_INSURANCE': return { ...state, insurances: state.insurances.map(i => i.id === action.payload.id ? action.payload : i) };
    case 'DELETE_INSURANCE': return { ...state, insurances: state.insurances.filter(i => i.id !== action.payload) };
    case 'ADD_POST':    return { ...state, postInvestments: [...state.postInvestments, action.payload] };
    case 'UPDATE_POST': return { ...state, postInvestments: state.postInvestments.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_POST': return { ...state, postInvestments: state.postInvestments.filter(p => p.id !== action.payload) };
    case 'ADD_NPS':    return { ...state, nps: [...state.nps, action.payload] };
    case 'UPDATE_NPS': return { ...state, nps: state.nps.map(n => n.id === action.payload.id ? action.payload : n) };
    case 'DELETE_NPS': return { ...state, nps: state.nps.filter(n => n.id !== action.payload) };
    case 'ADD_JOURNAL':    return { ...state, journal: [...state.journal, action.payload] };
    case 'UPDATE_JOURNAL': return { ...state, journal: state.journal.map(j => j.id === action.payload.id ? action.payload : j) };
    case 'DELETE_JOURNAL': return { ...state, journal: state.journal.filter(j => j.id !== action.payload) };
    case 'ADD_SNAPSHOT': {
      const snaps = state.snapshots ?? [];
      // Replace an existing snapshot in the same calendar month, else append
      const ym = action.payload.date.slice(0, 7);
      const rest = snaps.filter(s => s.date.slice(0, 7) !== ym);
      return { ...state, snapshots: [...rest, action.payload].sort((a, b) => a.date.localeCompare(b.date)) };
    }
    case 'SET_GOALS': return { ...state, goals: action.payload };
    case 'UPSERT_FOLIO': {
      const list = state.folioMappings ?? [];
      const exists = list.some(f => f.id === action.payload.id);
      return { ...state, folioMappings: exists ? list.map(f => f.id === action.payload.id ? action.payload : f) : [...list, action.payload] };
    }
    case 'DELETE_FOLIO':
      return { ...state, folioMappings: (state.folioMappings ?? []).filter(f => f.id !== action.payload) };
    case 'ADD_PENDING': {
      const list = state.pendingTransactions ?? [];
      const incoming = action.payload;
      // One installment can arrive twice with different source ids — e.g. a debit alert
      // and, days later, an allotment confirmation. Match on the installment itself, not
      // just the source id, so it can never be staged twice.
      const key = (p: PendingTransaction) => `${p.folioNumber}|${p.installmentDate}|${p.amount}`;
      const idx = list.findIndex(p =>
        key(p) === key(incoming) ||
        (!!p.externalId && !!incoming.externalId && p.externalId === incoming.externalId));
      if (idx === -1) return { ...state, pendingTransactions: [...list, incoming] };

      // Allotment mails carry the real units/NAV (no navDate — that's only set when we
      // estimate). Let exact figures replace an earlier estimate for the same installment.
      const isExact = (p: PendingTransaction) =>
        p.estimatedUnits != null && p.estimatedNav != null && !p.navDate;
      if (isExact(incoming) && !isExact(list[idx])) {
        const next = [...list];
        next[idx] = { ...incoming, id: list[idx].id };
        return { ...state, pendingTransactions: next };
      }
      return state;
    }
    case 'DELETE_PENDING':
      return { ...state, pendingTransactions: (state.pendingTransactions ?? []).filter(p => p.id !== action.payload) };
    default: return state;
  }
}

// ─── Context type ─────────────────────────────────────────────────────────────

interface AppContextValue {
  data: AppData;
  dispatch: React.Dispatch<Action>;
  activeMemberId: string;
  setActiveMemberId: (id: string) => void;
  /** Member tab the logged-in user should default to (per MEMBER_TAB_DEFAULTS). */
  defaultMemberId: string;
  dbLoading: boolean;
  isReadOnly: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid   = user!.uid;
  const email = user!.email.toLowerCase();

  const [data, dispatch]                    = useReducer(reducer, initialData);
  const [activeMemberId, setActiveMemberId] = React.useState<string>('1');
  const [dbLoading, setDbLoading]           = useState(true);

  const loaded         = useRef(false);
  const lastSavedCount = useRef(0);   // tracks last non-zero count to guard against accidental wipes

  // ── LOAD ───────────────────────────────────────────────────────────────────
  // Sources checked (in parallel, richest wins):
  //   1. users/shared-family        — shared family document
  //   2. users/shared-family_bk     — shared backup (never wiped)
  //   3. users/{uid}                — legacy: Darshan's old personal doc (auto-migrates on next save)
  //   4. users/{uid}_bk             — legacy backup
  //   5. localStorage main + backup
  useEffect(() => {
    let cancelled = false;
    setDbLoading(true);
    loaded.current = false;

    const load = async () => {
      const [shared, sharedBk, legacy, legacyBk] = await Promise.all([
        tryGetDoc(SHARED_DOC),
        tryGetDoc(SHARED_BK_DOC),
        tryGetDoc(uid),
        tryGetDoc(uid + '_bk'),
      ]);
      const ls   = tryParseLS(STORAGE_KEY);
      const lsBk = tryParseLS(LS_BACKUP_KEY);

      if (cancelled) return;

      const best = pickBest(shared, sharedBk, legacy, legacyBk, ls, lsBk);

      if (best) {
        if (!best.members?.length) best.members = defaultMembers;
        dispatch({ type: 'SET_DATA', payload: best });

        // Set default member tab based on logged-in email
        setActiveMemberId(resolveDefaultMemberId(best.members, email));

        lastSavedCount.current = countInvestments(best);
      }

      loaded.current = true;
      setDbLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [uid, email]);

  // ── SAVE ───────────────────────────────────────────────────────────────────
  // All family members write to the shared document.
  // Backup document is updated only when count > 0 (can never be emptied).
  // DATA GUARD: if lastSavedCount > 0 and count = 0, save is blocked — prevents
  // accidental overwrites of real data with empty state.
  useEffect(() => {
    if (!loaded.current) return;

    const count = countInvestments(data);

    // ── SAFETY GUARD ────────────────────────────────────────────────────────
    if (lastSavedCount.current > 0 && count === 0) {
      console.error(
        `[DataGuard] BLOCKED: would overwrite ${lastSavedCount.current} investments with empty data.`,
      );
      return;
    }

    const clean = JSON.parse(JSON.stringify(data)) as AppData;

    // localStorage (synchronous — always first)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    if (count > 0) localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(clean));

    // Firestore shared document (primary — all users read/write here)
    setDoc(doc(db, 'users', SHARED_DOC), clean).catch(console.error);

    if (count > 0) {
      lastSavedCount.current = count;

      // Firestore backup (write-protected: never written with empty data)
      setDoc(doc(db, 'users', SHARED_BK_DOC), {
        ...clean,
        _savedAt: new Date().toISOString(),
        _count: count,
      }).catch(e => console.warn('[Backup] non-fatal:', e));
    }
  }, [data, uid]);

  return (
    <AppContext.Provider value={{
      data, dispatch,
      activeMemberId, setActiveMemberId,
      defaultMemberId: resolveDefaultMemberId(data.members, email),
      dbLoading,
      isReadOnly: false,   // all family members have full read+write
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

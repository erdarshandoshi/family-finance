import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { AppData, FamilyMember, FD, Stock, MutualFund, PPFEntry, PFEntry } from '../types';

const STORAGE_KEY = 'family-finance-data';

const defaultMembers: FamilyMember[] = [
  { id: '1', name: 'Me', relation: 'self' },
  { id: '2', name: 'Wife', relation: 'wife' },
  { id: '3', name: 'Kid', relation: 'kid' },
];

const initialData: AppData = {
  members: defaultMembers,
  fds: [],
  stocks: [],
  mfs: [],
  ppf: [],
  pf: [],
};

type Action =
  | { type: 'SET_DATA'; payload: AppData }
  | { type: 'UPDATE_MEMBER'; payload: FamilyMember }
  | { type: 'ADD_FD'; payload: FD }
  | { type: 'UPDATE_FD'; payload: FD }
  | { type: 'DELETE_FD'; payload: string }
  | { type: 'ADD_STOCK'; payload: Stock }
  | { type: 'UPDATE_STOCK'; payload: Stock }
  | { type: 'DELETE_STOCK'; payload: string }
  | { type: 'ADD_MF'; payload: MutualFund }
  | { type: 'UPDATE_MF'; payload: MutualFund }
  | { type: 'DELETE_MF'; payload: string }
  | { type: 'UPSERT_PPF'; payload: PPFEntry }
  | { type: 'UPSERT_PF'; payload: PFEntry };

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'SET_DATA': return action.payload;
    case 'UPDATE_MEMBER':
      return { ...state, members: state.members.map(m => m.id === action.payload.id ? action.payload : m) };
    case 'ADD_FD': return { ...state, fds: [...state.fds, action.payload] };
    case 'UPDATE_FD': return { ...state, fds: state.fds.map(f => f.id === action.payload.id ? action.payload : f) };
    case 'DELETE_FD': return { ...state, fds: state.fds.filter(f => f.id !== action.payload) };
    case 'ADD_STOCK': return { ...state, stocks: [...state.stocks, action.payload] };
    case 'UPDATE_STOCK': return { ...state, stocks: state.stocks.map(s => s.id === action.payload.id ? action.payload : s) };
    case 'DELETE_STOCK': return { ...state, stocks: state.stocks.filter(s => s.id !== action.payload) };
    case 'ADD_MF': return { ...state, mfs: [...state.mfs, action.payload] };
    case 'UPDATE_MF': return { ...state, mfs: state.mfs.map(m => m.id === action.payload.id ? action.payload : m) };
    case 'DELETE_MF': return { ...state, mfs: state.mfs.filter(m => m.id !== action.payload) };
    case 'UPSERT_PPF': {
      const exists = state.ppf.find(p => p.memberId === action.payload.memberId);
      return {
        ...state,
        ppf: exists
          ? state.ppf.map(p => p.memberId === action.payload.memberId ? action.payload : p)
          : [...state.ppf, action.payload],
      };
    }
    case 'UPSERT_PF': {
      const exists = state.pf.find(p => p.memberId === action.payload.memberId);
      return {
        ...state,
        pf: exists
          ? state.pf.map(p => p.memberId === action.payload.memberId ? action.payload : p)
          : [...state.pf, action.payload],
      };
    }
    default: return state;
  }
}

interface AppContextValue {
  data: AppData;
  dispatch: React.Dispatch<Action>;
  activeMemberId: string;
  setActiveMemberId: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, dispatch] = useReducer(reducer, initialData, () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppData;
        if (!parsed.members?.length) parsed.members = defaultMembers;
        return parsed;
      }
    } catch {}
    return initialData;
  });

  const [activeMemberId, setActiveMemberId] = React.useState<string>(() => data.members[0]?.id ?? '1');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  return (
    <AppContext.Provider value={{ data, dispatch, activeMemberId, setActiveMemberId }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

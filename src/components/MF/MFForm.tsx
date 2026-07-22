import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, RefreshCw, X, Plus, Trash2, Wand2, AlertCircle } from 'lucide-react';
import type { MutualFund, FamilyMember } from '../../types';
import { generateId, formatCurrency } from '../../utils/helpers';

interface MFSearchResult {
  schemeCode: number;
  schemeName: string;
  fundHouse: string;
}

// Lump-sum lot (manual entry)
interface LotRow {
  id: string;
  dateOfPurchase: string;
  quantity: number | '';
  purchasePrice: number | '';
}

// SIP installment (date + amount → NAV & units auto-calculated)
interface SIPLotRow {
  id: string;
  dateOfPurchase: string;
  amount: number | '';
  nav: number | null;       // auto-fetched from history
  navDate: string | null;   // actual NAV date (may differ if holiday)
  quantity: number | null;  // = amount / nav
}

interface MFFormProps {
  memberId: string;
  members: FamilyMember[];
  onSave: (mfs: MutualFund[]) => void;
  onCancel: () => void;
}

const cls =
  'w-full bg-surface border border-edge rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint';
const roCls =
  'w-full bg-surface border border-edge rounded-xl px-3 py-2.5 text-muted text-sm';
const lbl = 'block text-muted text-xs font-medium mb-1.5 uppercase tracking-wide';
const fieldCls =
  'w-full bg-surface3 text-content rounded-lg px-2 py-1.5 text-xs border border-edge focus:border-indigo-500 outline-none placeholder-faint';
const roFieldCls =
  'w-full bg-surface2 text-muted rounded-lg px-2 py-1.5 text-xs border border-edge';

async function fetchLatestNav(code: number): Promise<{ nav: number; date: string } | null> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${code}/latest`);
    const json = await res.json() as { data: { nav: string; date: string }[]; status: string };
    if (json.status === 'SUCCESS' && json.data?.[0]) {
      return { nav: parseFloat(json.data[0].nav), date: json.data[0].date };
    }
    return null;
  } catch { return null; }
}

const emptyLot = (): LotRow => ({
  id: generateId(),
  dateOfPurchase: new Date().toISOString().split('T')[0],
  quantity: '',
  purchasePrice: '',
});

const emptySIPLot = (): SIPLotRow => ({
  id: generateId(),
  dateOfPurchase: new Date().toISOString().split('T')[0],
  amount: '',
  nav: null,
  navDate: null,
  quantity: null,
});

// Look up NAV for a given date from history map.
// If exact date is a holiday/weekend, try up to 7 days forward, then 7 backward.
function lookupNav(dateStr: string, history: Map<string, number>): { nav: number; navDate: string } | null {
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + offset);
    const key = d.toISOString().split('T')[0];
    if (history.has(key)) return { nav: history.get(key)!, navDate: key };
  }
  for (let offset = 1; offset <= 7; offset++) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - offset);
    const key = d.toISOString().split('T')[0];
    if (history.has(key)) return { nav: history.get(key)!, navDate: key };
  }
  return null;
}

function recalcSIPLot(lot: SIPLotRow, history: Map<string, number>): SIPLotRow {
  if (!lot.dateOfPurchase || history.size === 0) return { ...lot, nav: null, navDate: null, quantity: null };
  const found = lookupNav(lot.dateOfPurchase, history);
  if (!found) return { ...lot, nav: null, navDate: null, quantity: null };
  const quantity = lot.amount !== '' && found.nav > 0
    ? Math.round((Number(lot.amount) / found.nav) * 1000) / 1000
    : null;
  return { ...lot, nav: found.nav, navDate: found.navDate, quantity };
}

export default function MFForm({ memberId, members, onSave, onCancel }: MFFormProps) {
  const defaultMemberId = members.find(m => m.id === memberId) ? memberId : (members[0]?.id ?? memberId);
  const [selectedMemberId, setSelectedMemberId] = useState(defaultMemberId);
  const [guardianMemberId, setGuardianMemberId] = useState('');
  const [isSIP, setIsSIP] = useState(false);

  // Scheme identity
  const [schemeCode, setSchemeCode] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [schemeName, setSchemeName] = useState('');
  const [schemeSelected, setSchemeSelected] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MFSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Shared fields
  const [currentPrice, setCurrentPrice] = useState(0);
  const [folioNumber, setFolioNumber] = useState('');
  const [nominee, setNominee] = useState('');
  const [remarks, setRemarks] = useState('');
  const [navDate, setNavDate] = useState('');
  const [fetchingNav, setFetchingNav] = useState(false);

  // Lump-sum lots
  const [lots, setLots] = useState<LotRow[]>([emptyLot()]);

  // SIP installments
  const [sipLots, setSipLots] = useState<SIPLotRow[]>([emptySIPLot()]);
  const navHistoryRef = useRef<Map<string, number>>(new Map());
  const [historyFetched, setHistoryFetched] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(false);

  // Quick-fill (generate monthly installments)
  const [showQuickFill, setShowQuickFill] = useState(false);
  const [qfAmount, setQfAmount] = useState<number | ''>('');
  const [qfFrom, setQfFrom] = useState('');
  const [qfTo, setQfTo] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const searchSchemes = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q || q.trim().length < 2) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json() as MFSearchResult[];
        setSearchResults(Array.isArray(data) ? data.slice(0, 10) : []);
        setShowDropdown(true);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 350);
  }, []);

  const refreshNav = useCallback(async (code: number) => {
    setFetchingNav(true);
    const result = await fetchLatestNav(code);
    if (result) { setCurrentPrice(result.nav); setNavDate(result.date); }
    setFetchingNav(false);
  }, []);

  const fetchNavHistory = useCallback(async (code: number) => {
    setFetchingHistory(true);
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${code}`);
      const json = await res.json() as { status: string; data: { date: string; nav: string }[] };
      if (json.status === 'SUCCESS' && Array.isArray(json.data)) {
        const map = new Map<string, number>();
        for (const d of json.data) {
          // mfapi returns dates as DD-MM-YYYY → convert to YYYY-MM-DD
          const parts = d.date.split('-');
          if (parts.length === 3) {
            map.set(`${parts[2]}-${parts[1]}-${parts[0]}`, parseFloat(d.nav));
          }
        }
        navHistoryRef.current = map;
        setHistoryFetched(true);
        // Recalculate any existing SIP lots now that history is loaded
        setSipLots(prev => prev.map(lot => recalcSIPLot(lot, map)));
      }
    } catch { /* ignore */ }
    finally { setFetchingHistory(false); }
  }, []);

  const selectScheme = async (r: MFSearchResult) => {
    setSchemeCode(r.schemeCode);
    setCompanyName(r.fundHouse);
    setSchemeName(r.schemeName);
    setSchemeSelected(true);
    setShowDropdown(false);
    setSearchQuery('');
    setSearchResults([]);
    // Fetch latest NAV and full history in parallel
    await Promise.all([
      refreshNav(r.schemeCode),
      fetchNavHistory(r.schemeCode),
    ]);
  };

  const clearScheme = () => {
    setSchemeCode(null); setCompanyName(''); setSchemeName('');
    setSchemeSelected(false); setNavDate(''); setCurrentPrice(0);
    navHistoryRef.current = new Map();
    setHistoryFetched(false);
    setSipLots([emptySIPLot()]);
  };

  // ── SIP lot helpers ──────────────────────────────────────────────────────
  const updateSIPLotDate = (id: string, dateOfPurchase: string) => {
    setSipLots(prev => prev.map(l => {
      if (l.id !== id) return l;
      return recalcSIPLot({ ...l, dateOfPurchase }, navHistoryRef.current);
    }));
  };

  const updateSIPLotAmount = (id: string, raw: string) => {
    const amount = raw === '' ? ('' as const) : Number(raw);
    setSipLots(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, amount };
      if (l.nav && amount !== '') {
        return { ...updated, quantity: Math.round((Number(amount) / l.nav) * 1000) / 1000 };
      }
      return { ...updated, quantity: null };
    }));
  };

  const deleteSIPLot = (id: string) => {
    if (sipLots.length === 1) return;
    setSipLots(prev => prev.filter(l => l.id !== id));
  };

  // Generate monthly SIP installments between two dates
  const generateMonthlyLots = () => {
    if (!qfFrom || qfAmount === '') return;
    const start = new Date(qfFrom);
    const end = new Date(qfTo);
    if (start > end) return;
    const sipDay = start.getDate();
    const generated: SIPLotRow[] = [];
    let cur = new Date(start);
    while (cur <= end) {
      const base = recalcSIPLot(
        {
          id: generateId(),
          dateOfPurchase: cur.toISOString().split('T')[0],
          amount: Number(qfAmount),
          nav: null, navDate: null, quantity: null,
        },
        navHistoryRef.current,
      );
      generated.push(base);
      // Advance to same day next month (capped to last day of that month)
      const nextMonth = cur.getMonth() + 1;
      const nextYear = cur.getFullYear() + (nextMonth > 11 ? 1 : 0);
      const clampedDay = Math.min(sipDay, new Date(nextYear, (nextMonth % 12) + 1, 0).getDate());
      cur = new Date(nextYear, nextMonth % 12, clampedDay);
    }
    setSipLots(generated);
    setShowQuickFill(false);
  };

  // ── Lump-sum lot helpers ─────────────────────────────────────────────────
  const updateLot = (id: string, field: keyof LotRow, value: string | number | '') =>
    setLots(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));

  const deleteLot = (id: string) => {
    if (lots.length === 1) return;
    setLots(prev => prev.filter(l => l.id !== id));
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const buildMF = (dateOfPurchase: string, quantity: number, purchasePrice: number): MutualFund => {
      const mf: MutualFund = {
        id: generateId(),
        memberId: selectedMemberId,
        isSIP,
        companyName: companyName || '',
        schemeName: schemeName || '',
        quantity,
        purchasePrice,
        dateOfPurchase,
        currentPrice,
      };
      if (schemeCode != null) mf.schemeCode = schemeCode.toString();
      if (folioNumber) mf.folioNumber = folioNumber;
      if (nominee) mf.nominee = nominee;
      if (remarks) mf.remarks = remarks;
      if (guardianMemberId) mf.guardianMemberId = guardianMemberId;
      return mf;
    };

    let mfs: MutualFund[];
    if (isSIP) {
      mfs = sipLots
        .filter(l => l.nav !== null && l.quantity !== null && l.quantity > 0)
        .map(l => buildMF(l.navDate ?? l.dateOfPurchase, l.quantity!, l.nav!));
    } else {
      mfs = lots.map(l => buildMF(l.dateOfPurchase, Number(l.quantity) || 0, Number(l.purchasePrice) || 0));
    }

    if (mfs.length === 0) return;
    onSave(mfs);
  };

  // ── Aggregates ───────────────────────────────────────────────────────────
  const sipTotalInvested = sipLots.reduce((s, l) => s + (l.amount !== '' ? Number(l.amount) : 0), 0);
  const sipTotalUnits = sipLots.reduce((s, l) => s + (l.quantity ?? 0), 0);
  const sipAvgNav = sipTotalUnits > 0 ? sipTotalInvested / sipTotalUnits : 0;
  const sipTotalCurrent = sipTotalUnits * currentPrice;
  const sipPL = sipTotalCurrent - sipTotalInvested;
  const sipReadyCount = sipLots.filter(l => l.nav !== null).length;

  const lumpTotalUnits = lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const lumpTotalInvested = lots.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.purchasePrice) || 0), 0);
  const lumpAvgNav = lumpTotalUnits > 0 ? lumpTotalInvested / lumpTotalUnits : 0;
  const lumpTotalCurrent = lumpTotalUnits * currentPrice;
  const lumpPL = lumpTotalCurrent - lumpTotalInvested;

  const canSubmit = isSIP ? sipLots.some(l => l.nav !== null && l.quantity) : true;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Member + Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Family Member *</label>
          <select className={cls} value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Type</label>
          <div className="flex items-center gap-2 bg-surface2 rounded-xl p-1 h-[42px]">
            {(['Lump Sum', 'SIP'] as const).map((label, i) => (
              <button key={label} type="button"
                onClick={() => {
                  const newIsSIP = i === 1;
                  setIsSIP(newIsSIP);
                  // Fetch history when switching to SIP if scheme is already selected
                  if (newIsSIP && schemeCode && !historyFetched && !fetchingHistory) {
                    void fetchNavHistory(schemeCode);
                  }
                }}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${isSIP === (i === 1) ? 'bg-indigo-600 text-white' : 'text-muted hover:text-content'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Guardian (optional) — for a fund legally held by one member but earmarked for another */}
      <div>
        <label className={lbl}>Guardian (held in whose name)</label>
        <select className={cls} value={guardianMemberId} onChange={e => setGuardianMemberId(e.target.value)}>
          <option value="">— None (same as member) —</option>
          {members.filter(m => m.id !== selectedMemberId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <p className="text-faint text-xs mt-1">
          Set when this fund is legally held by another member (e.g. a parent) but earmarked for the selected member.
        </p>
      </div>

      {/* Scheme search */}
      <div className="relative" ref={dropdownRef}>
        <label className={lbl}>
          Search Scheme
          {isSIP && <span className="text-purple-400 normal-case font-normal ml-1.5">— required for NAV auto-lookup</span>}
        </label>
        {!schemeSelected ? (
          <>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint animate-spin" />}
              <input className={`${cls} pl-8 pr-8`} placeholder="Type fund name, e.g. Mirae Asset Large Cap…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); searchSchemes(e.target.value); }}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)} />
            </div>
            <p className="text-faint text-xs mt-1">Powered by mfapi.in · NAV is auto-filled on selection</p>
            {showDropdown && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface border border-edge rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                {searchResults.length > 0
                  ? searchResults.map(r => (
                    <button key={r.schemeCode} type="button" onMouseDown={() => selectScheme(r)}
                      className="w-full text-left px-3 py-2.5 hover:bg-surface2 transition-colors border-b border-edge last:border-0">
                      <p className="text-content text-sm font-medium leading-snug line-clamp-2">{r.schemeName}</p>
                      <p className="text-muted text-xs mt-0.5">{r.fundHouse}</p>
                    </button>
                  ))
                  : searchQuery.trim().length >= 2 && !searching && (
                    <div className="px-3 py-2.5 text-faint text-sm">No results — try a different name</div>
                  )}
              </div>
            )}
          </>
        ) : (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-accent text-xs font-semibold uppercase tracking-wide">Selected Scheme</p>
                {isSIP && (
                  fetchingHistory
                    ? <span className="flex items-center gap-1 text-purple-400 text-xs"><Loader2 size={10} className="animate-spin" /> Loading NAV history…</span>
                    : historyFetched
                      ? <span className="text-success text-xs">✓ {navHistoryRef.current.size.toLocaleString()} NAV records loaded</span>
                      : null
                )}
              </div>
              <p className="text-content text-sm font-medium leading-snug line-clamp-2">{schemeName}</p>
              <p className="text-muted text-xs mt-0.5">{companyName}</p>
            </div>
            <button type="button" onClick={clearScheme}
              className="flex-shrink-0 p-1 text-faint hover:text-danger hover:bg-surface3 rounded-lg transition-colors mt-0.5">
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Scheme Name */}
      <div>
        <label className={lbl}>Scheme Name *</label>
        {schemeSelected
          ? <div className={roCls} title={schemeName}>{schemeName || '—'}</div>
          : <input className={cls} required placeholder="e.g. Mirae Asset Large Cap Fund Direct Growth" value={schemeName}
              onChange={e => setSchemeName(e.target.value)} />}
      </div>

      {/* Current NAV + Folio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={lbl}>
            Current NAV (₹)
            {navDate && <span className="text-faint normal-case font-normal ml-1">as of {navDate}</span>}
          </label>
          {schemeSelected ? (
            <div className="relative">
              <div className={`${roCls} pr-8`}>
                {fetchingNav
                  ? <span className="flex items-center gap-1.5 text-faint"><Loader2 size={12} className="animate-spin inline" /> Fetching…</span>
                  : (currentPrice || '—')}
              </div>
              {schemeCode && !fetchingNav && (
                <button type="button" onClick={() => refreshNav(schemeCode)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-accent transition-colors" title="Refresh NAV">
                  <RefreshCw size={13} />
                </button>
              )}
            </div>
          ) : (
            <input className={cls} required type="number" step="0.01" min="0" placeholder="Today's NAV"
              value={currentPrice || ''}
              onChange={e => setCurrentPrice(parseFloat(e.target.value) || 0)} />
          )}
        </div>
        <div>
          <label className={lbl}>Folio Number</label>
          <input className={cls} placeholder="e.g. 12345678 / 01" value={folioNumber}
            onChange={e => setFolioNumber(e.target.value)} />
        </div>
      </div>

      {/* Nominee + Remarks */}
      <div>
        <label className={lbl}>Nominee</label>
        <input className={cls} placeholder="Nominee name" value={nominee}
          onChange={e => setNominee(e.target.value)} />
      </div>
      <div>
        <label className={lbl}>Remarks</label>
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
          placeholder="Any notes — e.g. auto-SIP on 5th, linked to goal, tax-saving, etc."
          rows={2}
          className="w-full bg-surface border border-edge rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint resize-none" />
      </div>

      {/* ── SIP Installments ──────────────────────────────────────────────── */}
      {isSIP && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <p className="text-muted text-sm font-medium">
              SIP Installments ({sipLots.length})
              {sipReadyCount > 0 && sipReadyCount < sipLots.length && (
                <span className="text-warn text-xs ml-2">{sipReadyCount}/{sipLots.length} NAV found</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowQuickFill(v => !v)}
                className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-xs font-medium transition-colors">
                <Wand2 size={13} /> Monthly Fill
              </button>
              <button type="button"
                onClick={() => setSipLots(prev => [...prev, recalcSIPLot(emptySIPLot(), navHistoryRef.current)])}
                className="flex items-center gap-1 text-accent hover:text-accent text-sm transition-colors">
                <Plus size={14} /> Add Date
              </button>
            </div>
          </div>

          {/* NAV history hint */}
          {!historyFetched && !fetchingHistory && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 text-xs text-warn">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                {schemeSelected
                  ? 'NAV history is still loading. Dates will be auto-filled once ready.'
                  : 'Search and select a scheme above to enable automatic NAV lookup for each SIP date.'}
              </span>
            </div>
          )}

          {/* Quick-fill panel */}
          {showQuickFill && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 space-y-3">
              <p className="text-purple-300 text-xs font-semibold uppercase tracking-wide">Generate Monthly Installments</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-muted text-xs mb-1 block">Monthly Amount (₹)</label>
                  <input type="number" min="1" step="1" placeholder="e.g. 5000"
                    value={qfAmount} onChange={e => setQfAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className={fieldCls} />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">First Instalment</label>
                  <input type="date" value={qfFrom} onChange={e => setQfFrom(e.target.value)} className={fieldCls} />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">Last Instalment</label>
                  <input type="date" value={qfTo} onChange={e => setQfTo(e.target.value)} className={fieldCls} />
                </div>
              </div>
              <button type="button" onClick={generateMonthlyLots}
                disabled={!qfFrom || qfAmount === ''}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
                <Wand2 size={12} /> Generate
              </button>
            </div>
          )}

          {/* SIP lot rows */}
          <div className="space-y-2">
            {sipLots.map((lot, idx) => (
              <div key={lot.id} className="bg-surface2 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-faint text-xs font-medium">Instalment {idx + 1}</span>
                  {sipLots.length > 1 && (
                    <button type="button" onClick={() => deleteSIPLot(lot.id)}
                      className="text-danger/60 hover:text-danger transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-muted text-xs mb-1 block">SIP Date</label>
                    <input type="date" value={lot.dateOfPurchase}
                      onChange={e => updateSIPLotDate(lot.id, e.target.value)}
                      className={fieldCls} />
                  </div>
                  <div>
                    <label className="text-muted text-xs mb-1 block">Amount (₹)</label>
                    <input type="number" min="1" step="1" placeholder="e.g. 5000"
                      value={lot.amount}
                      onChange={e => updateSIPLotAmount(lot.id, e.target.value)}
                      className={fieldCls} />
                  </div>
                  <div>
                    <label className="text-muted text-xs mb-1 block">
                      NAV (₹)
                      {lot.navDate && lot.navDate !== lot.dateOfPurchase && (
                        <span className="text-faint normal-case ml-1">on {lot.navDate}</span>
                      )}
                    </label>
                    <div className={`${roFieldCls} ${lot.nav ? '' : 'text-faint'}`}>
                      {fetchingHistory
                        ? <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> …</span>
                        : lot.nav ? `₹${lot.nav.toFixed(4)}` : '—'}
                    </div>
                  </div>
                  <div>
                    <label className="text-muted text-xs mb-1 block">Units</label>
                    <div className={`${roFieldCls} ${lot.quantity ? '' : 'text-faint'}`}>
                      {lot.quantity ? lot.quantity.toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* SIP aggregate */}
          {sipTotalInvested > 0 && sipTotalUnits > 0 && (
            <div className="bg-surface rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { label: 'Total Invested', value: formatCurrency(sipTotalInvested) },
                { label: 'Total Units', value: sipTotalUnits.toFixed(3) },
                { label: 'Avg Buy NAV', value: `₹${sipAvgNav.toFixed(2)}` },
                { label: 'P&L', value: (sipPL >= 0 ? '+' : '') + formatCurrency(sipPL), color: sipPL >= 0 ? 'text-success' : 'text-danger' },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-faint text-xs">{item.label}</p>
                  <p className={`font-semibold text-sm mt-0.5 ${item.color ?? 'text-content'}`}>{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lump-sum Lots ────────────────────────────────────────────────── */}
      {!isSIP && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-muted text-sm font-medium">Purchase Lots ({lots.length})</p>
            <button type="button" onClick={() => setLots(prev => [...prev, emptyLot()])}
              className="flex items-center gap-1 text-accent hover:text-accent text-sm transition-colors">
              <Plus size={14} /> Add Lot
            </button>
          </div>
          <div className="space-y-2">
            {lots.map((lot, idx) => (
              <div key={lot.id} className="bg-surface2 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-faint text-xs font-medium">Lot {idx + 1}</span>
                  {lots.length > 1 && (
                    <button type="button" onClick={() => deleteLot(lot.id)}
                      className="text-danger/60 hover:text-danger transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-muted text-xs mb-1 block">Date *</label>
                    <input type="date" required value={lot.dateOfPurchase}
                      onChange={e => updateLot(lot.id, 'dateOfPurchase', e.target.value)}
                      className={fieldCls} />
                  </div>
                  <div>
                    <label className="text-muted text-xs mb-1 block">Units *</label>
                    <input type="number" required min="0.001" step="0.001" value={lot.quantity}
                      onChange={e => updateLot(lot.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                      className={fieldCls} />
                  </div>
                  <div>
                    <label className="text-muted text-xs mb-1 block">Buy NAV (₹) *</label>
                    <input type="number" required min="0.01" step="0.01" value={lot.purchasePrice}
                      onChange={e => updateLot(lot.id, 'purchasePrice', e.target.value === '' ? '' : Number(e.target.value))}
                      className={fieldCls} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {lumpTotalUnits > 0 && lumpTotalInvested > 0 && (
            <div className="bg-surface rounded-xl p-3 mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { label: 'Total Units', value: lumpTotalUnits.toFixed(3) },
                { label: 'Avg Buy NAV', value: `₹${lumpAvgNav.toFixed(2)}` },
                { label: 'Invested', value: formatCurrency(lumpTotalInvested) },
                { label: 'P&L', value: (lumpPL >= 0 ? '+' : '') + formatCurrency(lumpPL), color: lumpPL >= 0 ? 'text-success' : 'text-danger' },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-faint text-xs">{item.label}</p>
                  <p className={`font-semibold text-sm mt-0.5 ${item.color ?? 'text-content'}`}>{item.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={!canSubmit}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors">
          {isSIP
            ? `Add SIP (${sipLots.filter(l => l.quantity).length} instalment${sipLots.filter(l => l.quantity).length !== 1 ? 's' : ''})`
            : (lots.length > 1 ? `Add Fund (${lots.length} lots)` : 'Add Fund')}
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 bg-surface3 hover:bg-surface3 text-content font-medium py-2.5 rounded-xl transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

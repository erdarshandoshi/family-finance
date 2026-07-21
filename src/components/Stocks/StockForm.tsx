import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Search } from 'lucide-react';
import type { Stock, FamilyMember } from '../../types';
import { generateId } from '../../utils/helpers';

interface StockInfo { symbol: string; name: string; isin: string; }

interface StockFormProps {
  initial?: Stock;
  memberId: string;
  members: FamilyMember[];
  onSave: (s: Stock) => void;
  onCancel: () => void;
}

const inputCls =
  'w-full bg-surface border border-edge rounded-xl px-3 py-2 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint';
const labelCls = 'block text-muted text-xs font-medium mb-1';

function useStockSearch() {
  const [results, setResults] = useState<StockInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!q || q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks?q=${encodeURIComponent(q.trim())}`);
        const data = await res.json() as { stocks: StockInfo[] };
        setResults(data.stocks ?? []);
      } catch {
        setResults([]);
      } finally { setLoading(false); }
    }, 300);
  }, []);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setResults([]); setLoading(false);
  }, []);

  return { results, loading, search, clear };
}

interface DropdownProps {
  results: StockInfo[];
  loading: boolean;
  query: string;
  onSelect: (s: StockInfo) => void;
  onClose: () => void;
}

function Dropdown({ results, loading, query, onSelect, onClose }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  if (!query || query.trim().length < 2) return null;

  return (
    <div ref={ref}
      className="absolute z-50 left-0 right-0 top-full mt-1 bg-surface border border-edge rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-2.5 text-muted text-sm">
          <Loader2 size={13} className="animate-spin" /> Searching NSE…
        </div>
      ) : results.length === 0 ? (
        <div className="px-3 py-2.5 text-faint text-sm">No results — try name, symbol or ISIN</div>
      ) : (
        results.map(s => (
          <button key={s.isin} type="button" onMouseDown={() => onSelect(s)}
            className="w-full flex items-start gap-2 px-3 py-2 hover:bg-surface2 transition-colors text-left">
            <div className="flex-1 min-w-0">
              <p className="text-content text-sm font-medium leading-tight truncate">{s.name}</p>
              <p className="text-muted text-xs mt-0.5">{s.symbol} · {s.isin}</p>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

const DEMAT_ACCOUNTS = ['KIFS', 'Zerodha'] as const;

export default function StockForm({ initial, memberId, members, onSave, onCancel }: StockFormProps) {
  const defaultMemberId = members.find(m => m.id === memberId) ? memberId : (members[0]?.id ?? memberId);
  const [selectedMemberId, setSelectedMemberId] = useState(defaultMemberId);

  const [isin, setIsin] = useState(initial?.isin ?? '');
  const [stockName, setStockName] = useState(initial?.stockName ?? '');
  const [symbol, setSymbol] = useState(initial?.symbol ?? '');
  const [dateOfPurchase, setDateOfPurchase] = useState(initial?.dateOfPurchase ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity ?? 0);
  const [purchasePrice, setPurchasePrice] = useState(initial?.purchasePrice ?? 0);
  const [dematAccount, setDematAccount] = useState(initial?.dematAccount ?? 'KIFS');

  const [activeField, setActiveField] = useState<'isin' | 'name' | null>(null);
  const isinSearch = useStockSearch();
  const nameSearch = useStockSearch();

  const selectStock = (s: StockInfo) => {
    setIsin(s.isin); setStockName(s.name); setSymbol(s.symbol);
    setActiveField(null); isinSearch.clear(); nameSearch.clear();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initial?.id ?? generateId(),
      memberId: selectedMemberId,
      isin, symbol, stockName, dateOfPurchase, quantity, purchasePrice,
      currentPrice: initial?.currentPrice ?? 0,
      dematAccount,
    });
  };

  const invested = quantity * purchasePrice;

  return (
    <form onSubmit={handleSubmit} className="space-y-3">

      {/* ISIN search */}
      <div className="relative">
        <label className={labelCls}>ISIN / Symbol *</label>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input className={`${inputCls} pl-8`} required
            placeholder="INE002A01018 — type ISIN, name or symbol"
            value={isin}
            onFocus={() => setActiveField('isin')}
            onChange={e => { setIsin(e.target.value); setActiveField('isin'); isinSearch.search(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Escape') { setActiveField(null); isinSearch.clear(); } }}
          />
        </div>
        {activeField === 'isin' && (
          <Dropdown results={isinSearch.results} loading={isinSearch.loading} query={isin}
            onSelect={selectStock} onClose={() => { setActiveField(null); isinSearch.clear(); }} />
        )}
      </div>

      {/* Stock name search */}
      <div className="relative">
        <label className={labelCls}>Stock / Company Name *</label>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input className={`${inputCls} pl-8`} required
            placeholder="e.g. Reliance Industries"
            value={stockName}
            onFocus={() => setActiveField('name')}
            onChange={e => { setStockName(e.target.value); setSymbol(''); setActiveField('name'); nameSearch.search(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Escape') { setActiveField(null); nameSearch.clear(); } }}
          />
        </div>
        {activeField === 'name' && (
          <Dropdown results={nameSearch.results} loading={nameSearch.loading} query={stockName}
            onSelect={selectStock} onClose={() => { setActiveField(null); nameSearch.clear(); }} />
        )}
      </div>

      {/* Member + Demat + Date */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Family Member *</label>
          <select className={inputCls} value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Demat Account *</label>
          <select className={inputCls} value={dematAccount} onChange={e => setDematAccount(e.target.value)}>
            {DEMAT_ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Purchase Date *</label>
          <input className={inputCls} required type="date" value={dateOfPurchase}
            onChange={e => setDateOfPurchase(e.target.value)} />
        </div>
      </div>

      {/* Qty + Price */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Quantity *</label>
          <input className={inputCls} required type="number" min="0.0001" step="0.0001"
            placeholder="No. of shares" value={quantity || ''}
            onChange={e => setQuantity(parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelCls}>Buy Price (₹/share) *</label>
          <input className={inputCls} required type="number" min="0.01" step="0.01"
            placeholder="Price at buy" value={purchasePrice || ''}
            onChange={e => setPurchasePrice(parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      {/* Invested preview */}
      {invested > 0 && (
        <div className="bg-surface2 rounded-xl px-3 py-2 flex items-center justify-between">
          <span className="text-muted text-xs">Total Invested</span>
          <span className="text-content text-sm font-semibold">₹{invested.toLocaleString('en-IN')}</span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-3 pt-1">
        <button type="submit"
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm">
          {initial ? 'Update Stock' : 'Add Stock'}
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 bg-surface3 hover:bg-surface3 text-content font-medium py-2.5 rounded-xl transition-colors text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

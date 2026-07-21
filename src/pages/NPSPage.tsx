import { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, TrendingUp, Wallet, PiggyBank, BarChart3, X, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/helpers';
import type { NPSEntry, NPSFundManager, NPSInvestmentOption } from '../types';

const FUND_MANAGERS: NPSFundManager[] = [
  'SBI Pension', 'LIC Pension', 'UTI Retirement', 'HDFC Pension',
  'ICICI Pru Pension', 'Kotak Pension', 'Aditya Birla Pension',
  'Max Life Pension', 'Tata Pension', 'DSP Pension',
];

const INVESTMENT_OPTIONS: { key: NPSInvestmentOption; label: string; desc: string }[] = [
  { key: 'Active',     label: 'Active Choice',         desc: 'You choose allocation across E, C, G, A' },
  { key: 'Auto-LC25',  label: 'Auto Choice – LC 25',   desc: 'Max 25% equity; conservative lifecycle' },
  { key: 'Auto-LC50',  label: 'Auto Choice – LC 50',   desc: 'Max 50% equity; moderate lifecycle' },
  { key: 'Auto-LC75',  label: 'Auto Choice – LC 75',   desc: 'Max 75% equity; aggressive lifecycle' },
];

const ASSET_COLORS = {
  equity:        { bg: 'bg-indigo-500', label: 'Equity (E)', desc: 'Max 75%' },
  corporateBond: { bg: 'bg-emerald-500', label: 'Corp Bond (C)', desc: 'Up to 100%' },
  govtSec:       { bg: 'bg-amber-500',  label: 'Govt Sec (G)', desc: 'Up to 100%' },
  altAsset:      { bg: 'bg-pink-500',   label: 'Alt Assets (A)', desc: 'Max 5%' },
};

const blank = (): Omit<NPSEntry, 'id'> => ({
  memberId: '',
  pran: '',
  tier: 'I',
  fundManager: 'SBI Pension',
  investmentOption: 'Active',
  totalInvested: 0,
  currentCorpus: 0,
  equityPct: undefined,
  corporateBondPct: undefined,
  govtSecPct: undefined,
  altAssetPct: undefined,
  dateOfJoining: '',
  notes: '',
});

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export default function NPSPage() {
  const { data, dispatch, activeMemberId, isReadOnly } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NPSEntry | null>(null);
  const [form, setForm] = useState<Omit<NPSEntry, 'id'>>(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ALL_MEMBERS_ID = 'all';
  const isAll = activeMemberId === ALL_MEMBERS_ID;
  const memberIds = isAll ? data.members.map(m => m.id) : [activeMemberId];

  const filtered = useMemo(
    () => data.nps.filter(n => memberIds.includes(n.memberId)),
    [data.nps, memberIds],
  );

  const totalInvested = filtered.reduce((s, n) => s + n.totalInvested, 0);
  const totalCorpus   = filtered.reduce((s, n) => s + n.currentCorpus, 0);
  const totalReturns  = totalCorpus - totalInvested;
  const returnPct     = totalInvested > 0 ? (totalReturns / totalInvested) * 100 : 0;

  const memberName = (id: string) => data.members.find(m => m.id === id)?.name ?? '—';

  const openAdd = () => {
    const defaultMember = isAll ? data.members[0]?.id : activeMemberId;
    setForm({ ...blank(), memberId: defaultMember ?? '' });
    setEditing(null);
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (entry: NPSEntry) => {
    setForm({ ...entry });
    setEditing(entry);
    setErrors({});
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this NPS account entry?')) {
      dispatch({ type: 'DELETE_NPS', payload: id });
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.memberId)      e.memberId = 'Select a member';
    if (!form.pran.trim())   e.pran     = 'PRAN is required';
    if (!form.dateOfJoining) e.dateOfJoining = 'Date of joining is required';
    if (form.totalInvested < 0)  e.totalInvested = 'Must be ≥ 0';
    if (form.currentCorpus  < 0) e.currentCorpus = 'Must be ≥ 0';
    if (form.investmentOption === 'Active') {
      const sum = (form.equityPct ?? 0) + (form.corporateBondPct ?? 0) + (form.govtSecPct ?? 0) + (form.altAssetPct ?? 0);
      if (sum > 0 && Math.abs(sum - 100) > 0.1) e.alloc = `Allocations must sum to 100% (currently ${sum.toFixed(1)}%)`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (editing) {
      dispatch({ type: 'UPDATE_NPS', payload: { ...form, id: editing.id } });
    } else {
      dispatch({ type: 'ADD_NPS', payload: { ...form, id: uid() } });
    }
    setShowForm(false);
  };

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const inputCls = (err?: string) =>
    `w-full bg-surface3 border ${err ? 'border-red-500' : 'border-edge'} rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-content">NPS Accounts</h2>
          <p className="text-muted text-sm mt-0.5">National Pension System</p>
        </div>
        {!isReadOnly && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Add Account
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Invested',   value: formatCurrency(totalInvested), icon: Wallet,    color: 'text-accent' },
          { label: 'Current Corpus',   value: formatCurrency(totalCorpus),   icon: PiggyBank, color: 'text-success' },
          { label: 'Total Returns',    value: formatCurrency(totalReturns),  icon: TrendingUp, color: totalReturns >= 0 ? 'text-success' : 'text-danger' },
          { label: 'Accounts',         value: String(filtered.length),       icon: BarChart3,  color: 'text-warn' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-surface border border-edge rounded-2xl shadow-card p-4 flex items-start gap-3">
            <div className={`p-2 rounded-xl bg-surface2 flex-shrink-0`}>
              <Icon size={18} className={color} />
            </div>
            <div className="min-w-0">
              <p className="text-muted text-xs">{label}</p>
              <p className={`font-bold text-lg leading-tight break-words ${color}`}>{value}</p>
              {label === 'Total Returns' && totalInvested > 0 && (
                <p className="text-xs text-faint">{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Account cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-faint">
          <PiggyBank size={48} className="mx-auto mb-4 opacity-25" />
          <p className="text-lg font-medium text-muted">No NPS accounts yet</p>
          <p className="text-sm mt-1">Add your NPS Tier I or Tier II account details</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(entry => {
            const returns = entry.currentCorpus - entry.totalInvested;
            const retPct  = entry.totalInvested > 0 ? (returns / entry.totalInvested) * 100 : 0;
            const isActive = entry.investmentOption === 'Active';
            const alloc = [
              { label: 'E', pct: entry.equityPct, color: 'bg-indigo-500' },
              { label: 'C', pct: entry.corporateBondPct, color: 'bg-emerald-500' },
              { label: 'G', pct: entry.govtSecPct, color: 'bg-amber-500' },
              { label: 'A', pct: entry.altAssetPct, color: 'bg-pink-500' },
            ].filter(a => (a.pct ?? 0) > 0);

            return (
              <div key={entry.id} className="bg-surface border border-edge rounded-2xl shadow-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Top row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${entry.tier === 'I' ? 'bg-indigo-500/20 text-accent' : 'bg-emerald-500/20 text-success'}`}>
                        Tier {entry.tier}
                      </span>
                      <span className="text-muted text-sm font-semibold">{entry.fundManager}</span>
                      <span className="text-faint text-xs">· {memberName(entry.memberId)}</span>
                    </div>
                    {/* PRAN */}
                    <p className="text-faint text-xs mt-1 font-mono">PRAN: {entry.pran}</p>

                    {/* Amounts */}
                    <div className="flex items-center gap-6 mt-3 flex-wrap">
                      <div>
                        <p className="text-faint text-xs">Invested</p>
                        <p className="text-content font-semibold text-sm">{formatCurrency(entry.totalInvested)}</p>
                      </div>
                      <div>
                        <p className="text-faint text-xs">Current Corpus</p>
                        <p className="text-success font-semibold text-sm">{formatCurrency(entry.currentCorpus)}</p>
                      </div>
                      <div>
                        <p className="text-faint text-xs">Returns</p>
                        <p className={`font-semibold text-sm ${returns >= 0 ? 'text-success' : 'text-danger'}`}>
                          {returns >= 0 ? '+' : ''}{formatCurrency(returns)}
                          <span className="text-xs ml-1 font-normal">({retPct >= 0 ? '+' : ''}{retPct.toFixed(1)}%)</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-faint text-xs">Option</p>
                        <p className="text-muted text-sm">{INVESTMENT_OPTIONS.find(o => o.key === entry.investmentOption)?.label}</p>
                      </div>
                      <div>
                        <p className="text-faint text-xs">Joined</p>
                        <p className="text-muted text-sm">{entry.dateOfJoining}</p>
                      </div>
                    </div>

                    {/* Allocation bar (Active choice only) */}
                    {isActive && alloc.length > 0 && (
                      <div className="mt-3">
                        <div className="flex rounded-full overflow-hidden h-2 bg-surface3">
                          {alloc.map(a => (
                            <div key={a.label} className={`${a.color} h-2`} style={{ width: `${a.pct}%` }} title={`${a.label}: ${a.pct}%`} />
                          ))}
                        </div>
                        <div className="flex gap-3 mt-1.5 flex-wrap">
                          {alloc.map(a => (
                            <span key={a.label} className="text-xs text-faint flex items-center gap-1">
                              <span className={`inline-block w-2 h-2 rounded-full ${a.color}`} />
                              {a.label} {a.pct}%
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {entry.notes && (
                      <p className="text-faint text-xs mt-2 italic">{entry.notes}</p>
                    )}
                  </div>

                  {!isReadOnly && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(entry)} className="p-1.5 text-faint hover:text-accent hover:bg-surface3 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(entry.id)} className="p-1.5 text-faint hover:text-danger hover:bg-surface3 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-edge rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-surface border-b border-edge px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-content font-semibold text-lg">{editing ? 'Edit NPS Account' : 'Add NPS Account'}</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-faint hover:text-content hover:bg-surface rounded-lg transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Member + Tier row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-muted text-xs mb-1.5 font-medium">Account Holder *</label>
                  <div className="relative">
                    <select
                      value={form.memberId}
                      onChange={e => set('memberId', e.target.value)}
                      className={inputCls(errors.memberId) + ' appearance-none pr-8'}
                    >
                      <option value="">Select member</option>
                      {data.members.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                  </div>
                  {errors.memberId && <p className="text-danger text-xs mt-1">{errors.memberId}</p>}
                </div>
                <div>
                  <label className="block text-muted text-xs mb-1.5 font-medium">Tier *</label>
                  <div className="flex gap-2">
                    {(['I', 'II'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => set('tier', t)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                          form.tier === t
                            ? t === 'I' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-emerald-600 border-emerald-500 text-white'
                            : 'bg-surface3 border-edge text-muted hover:text-content'
                        }`}
                      >
                        Tier {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* PRAN + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-muted text-xs mb-1.5 font-medium">PRAN Number *</label>
                  <input
                    type="text"
                    placeholder="12-digit PRAN"
                    value={form.pran}
                    onChange={e => set('pran', e.target.value)}
                    className={inputCls(errors.pran)}
                  />
                  {errors.pran && <p className="text-danger text-xs mt-1">{errors.pran}</p>}
                </div>
                <div>
                  <label className="block text-muted text-xs mb-1.5 font-medium">Date of Joining *</label>
                  <input
                    type="date"
                    value={form.dateOfJoining}
                    onChange={e => set('dateOfJoining', e.target.value)}
                    className={inputCls(errors.dateOfJoining)}
                  />
                  {errors.dateOfJoining && <p className="text-danger text-xs mt-1">{errors.dateOfJoining}</p>}
                </div>
              </div>

              {/* Fund Manager */}
              <div>
                <label className="block text-muted text-xs mb-1.5 font-medium">Pension Fund Manager *</label>
                <div className="relative">
                  <select
                    value={form.fundManager}
                    onChange={e => set('fundManager', e.target.value as NPSFundManager)}
                    className={inputCls() + ' appearance-none pr-8'}
                  >
                    {FUND_MANAGERS.map(fm => (
                      <option key={fm} value={fm}>{fm}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                </div>
              </div>

              {/* Investment Option */}
              <div>
                <label className="block text-muted text-xs mb-1.5 font-medium">Investment Option *</label>
                <div className="grid grid-cols-2 gap-2">
                  {INVESTMENT_OPTIONS.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => set('investmentOption', opt.key)}
                      className={`text-left px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                        form.investmentOption === opt.key
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-content'
                          : 'bg-surface3 border-edge text-muted hover:text-content'
                      }`}
                    >
                      <p className="font-medium">{opt.label}</p>
                      <p className="text-[11px] opacity-60 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amounts */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-muted text-xs mb-1.5 font-medium">Total Invested (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.totalInvested || ''}
                    onChange={e => set('totalInvested', parseFloat(e.target.value) || 0)}
                    className={inputCls(errors.totalInvested)}
                  />
                  {errors.totalInvested && <p className="text-danger text-xs mt-1">{errors.totalInvested}</p>}
                </div>
                <div>
                  <label className="block text-muted text-xs mb-1.5 font-medium">Current Corpus (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.currentCorpus || ''}
                    onChange={e => set('currentCorpus', parseFloat(e.target.value) || 0)}
                    className={inputCls(errors.currentCorpus)}
                  />
                  {errors.currentCorpus && <p className="text-danger text-xs mt-1">{errors.currentCorpus}</p>}
                </div>
              </div>

              {/* Allocation — Active Choice only */}
              {form.investmentOption === 'Active' && (
                <div>
                  <label className="block text-muted text-xs mb-1.5 font-medium">Asset Allocation (%) — Active Choice</label>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.entries(ASSET_COLORS) as [keyof typeof ASSET_COLORS, typeof ASSET_COLORS[keyof typeof ASSET_COLORS]][]).map(([key, meta]) => {
                      const fieldMap: Record<string, keyof Omit<NPSEntry, 'id'>> = {
                        equity: 'equityPct', corporateBond: 'corporateBondPct', govtSec: 'govtSecPct', altAsset: 'altAssetPct',
                      };
                      const field = fieldMap[key] as 'equityPct' | 'corporateBondPct' | 'govtSecPct' | 'altAssetPct';
                      return (
                        <div key={key}>
                          <label className="block text-xs mb-1 text-faint flex items-center gap-1.5">
                            <span className={`inline-block w-2 h-2 rounded-full ${meta.bg}`} />
                            {meta.label} <span className="text-faint">{meta.desc}</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="0"
                            value={form[field] ?? ''}
                            onChange={e => set(field, e.target.value ? parseFloat(e.target.value) : undefined)}
                            className={inputCls()}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {errors.alloc && <p className="text-danger text-xs mt-1">{errors.alloc}</p>}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-muted text-xs mb-1.5 font-medium">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes…"
                  value={form.notes ?? ''}
                  onChange={e => set('notes', e.target.value)}
                  className={inputCls() + ' resize-none'}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-surface3 hover:bg-surface3 text-content py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  {editing ? 'Save Changes' : 'Add Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

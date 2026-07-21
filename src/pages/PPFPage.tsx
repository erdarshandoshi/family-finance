import { useState, useEffect } from 'react';
import { PiggyBank, Save, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, generateId } from '../utils/helpers';
import { ALL_MEMBERS_ID } from '../components/Layout/Header';

const inputClass =
  'w-full bg-surface border border-edge rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint';
const labelClass = 'block text-muted text-xs font-medium mb-1.5 uppercase tracking-wide';

const PPF_RATE = 7.1;
const PPF_LOCK_YEARS = 15;

export default function PPFPage() {
  const { data, dispatch, activeMemberId, dbLoading } = useApp();

  const defaultMemberId = activeMemberId === ALL_MEMBERS_ID
    ? (data.members[0]?.id ?? '1')
    : activeMemberId;
  const [selectedMemberId, setSelectedMemberId] = useState(defaultMemberId);

  // Sync with header member switcher (skip 'all')
  useEffect(() => {
    if (activeMemberId !== ALL_MEMBERS_ID) setSelectedMemberId(activeMemberId);
  }, [activeMemberId]);

  const entry = data.ppf.find(p => p.memberId === selectedMemberId);

  const [form, setForm] = useState({
    currentAmount: entry?.currentAmount ?? 0,
    yearlyContribution: entry?.yearlyContribution ?? 0,
    accountNumber: entry?.accountNumber ?? '',
    lastUpdated: entry?.lastUpdated ?? new Date().toISOString().split('T')[0],
  });
  const [saved, setSaved] = useState(false);

  // Reload form when member changes or Firestore data first loads
  useEffect(() => {
    if (dbLoading) return;
    const e = data.ppf.find(p => p.memberId === selectedMemberId);
    setForm({
      currentAmount: e?.currentAmount ?? 0,
      yearlyContribution: e?.yearlyContribution ?? 0,
      accountNumber: e?.accountNumber ?? '',
      lastUpdated: e?.lastUpdated ?? new Date().toISOString().split('T')[0],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, dbLoading]);

  const handleSave = () => {
    const currentEntry = data.ppf.find(p => p.memberId === selectedMemberId);
    dispatch({
      type: 'UPSERT_PPF',
      payload: {
        id: currentEntry?.id ?? generateId(),
        memberId: selectedMemberId,
        ...form,
        lastUpdated: new Date().toISOString().split('T')[0],
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const projections = [1, 3, 5, 10].map(years => {
    let amount = form.currentAmount;
    for (let y = 0; y < years; y++) {
      amount = (amount + form.yearlyContribution) * (1 + PPF_RATE / 100);
    }
    return { years, amount };
  });

  const maxLimit = 150000;
  const remainingLimit = maxLimit - form.yearlyContribution;
  const selectedMember = data.members.find(m => m.id === selectedMemberId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-content">Public Provident Fund (PPF)</h2>
          <p className="text-muted text-sm mt-1">{selectedMember?.name} — Current Rate: {PPF_RATE}% p.a.</p>
        </div>
      </div>

      {/* Member tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {data.members.map(m => (
          <button
            key={m.id}
            onClick={() => setSelectedMemberId(m.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              selectedMemberId === m.id
                ? 'bg-indigo-600 text-white'
                : 'bg-surface text-muted hover:text-content hover:bg-surface3'
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input form */}
        <div className="bg-surface border border-edge rounded-2xl shadow-card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <PiggyBank size={20} className="text-accent" />
            <h3 className="text-content font-semibold">Update PPF Balance — {selectedMember?.name}</h3>
          </div>

          <div>
            <label className={labelClass}>Account Number</label>
            <input className={inputClass} placeholder="PPF account number" value={form.accountNumber}
              onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Current Balance (₹)</label>
            <input className={inputClass} type="number" min="0" placeholder="Current PPF amount"
              value={form.currentAmount || ''}
              onChange={e => setForm(f => ({ ...f, currentAmount: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className={labelClass}>Annual Contribution (₹)</label>
            <input className={inputClass} type="number" min="0" max="150000" placeholder="Yearly deposit"
              value={form.yearlyContribution || ''}
              onChange={e => setForm(f => ({ ...f, yearlyContribution: parseFloat(e.target.value) || 0 }))} />
            <p className={`text-xs mt-1 ${remainingLimit >= 0 ? 'text-faint' : 'text-danger'}`}>
              {remainingLimit >= 0
                ? `₹${remainingLimit.toLocaleString('en-IN')} remaining under ₹1.5L annual limit`
                : `₹${Math.abs(remainingLimit).toLocaleString('en-IN')} over the annual limit`}
            </p>
          </div>
          <div>
            <label className={labelClass}>Last Updated</label>
            <input className={inputClass} type="date" value={form.lastUpdated}
              onChange={e => setForm(f => ({ ...f, lastUpdated: e.target.value }))} />
          </div>

          <button onClick={handleSave}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
            {saved ? <><RefreshCw size={16} className="animate-spin" /> Saved!</> : <><Save size={16} /> Save Balance</>}
          </button>
        </div>

        {/* Info panel */}
        <div className="space-y-4">
          <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
            <h3 className="text-content font-semibold mb-4">Current Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted text-sm">Current Balance</span>
                <span className="text-content font-bold text-lg">{formatCurrency(form.currentAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">Annual Contribution</span>
                <span className="text-accent font-semibold">{formatCurrency(form.yearlyContribution)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">Interest Rate</span>
                <span className="text-warn font-semibold">{PPF_RATE}% p.a.</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">Lock-in Period</span>
                <span className="text-muted font-semibold">{PPF_LOCK_YEARS} years</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted text-sm">Tax Benefit</span>
                <span className="text-success font-semibold">EEE (80C)</span>
              </div>
            </div>
          </div>

          <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
            <h3 className="text-content font-semibold mb-4">Growth Projections</h3>
            <div className="space-y-2">
              {projections.map(({ years, amount }) => (
                <div key={years} className="flex items-center gap-3">
                  <span className="text-muted text-sm w-16">{years} yr{years > 1 ? 's' : ''}</span>
                  <div className="flex-1 bg-surface2 rounded-full h-2">
                    <div className="bg-indigo-500 h-2 rounded-full"
                      style={{ width: `${Math.min((amount / (projections[projections.length - 1].amount || 1)) * 100, 100)}%` }} />
                  </div>
                  <span className="text-content font-semibold text-sm w-28 text-right">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
            <p className="text-faint text-xs mt-3">Assuming {PPF_RATE}% annual rate and current contribution.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Briefcase, Save, RefreshCw, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, generateId } from '../utils/helpers';

const inputClass =
  'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500 transition-colors placeholder-slate-500';
const labelClass = 'block text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wide';

const PF_RATE = 8.25;

export default function PFPage() {
  const { data, dispatch, activeMemberId } = useApp();
  const member = data.members.find(m => m.id === activeMemberId);
  const entry = data.pf.find(p => p.memberId === activeMemberId);

  const [form, setForm] = useState({
    currentAmount: entry?.currentAmount ?? 0,
    employeeContribution: entry?.employeeContribution ?? 0,
    employerContribution: entry?.employerContribution ?? 0,
    uanNumber: entry?.uanNumber ?? '',
    lastUpdated: entry?.lastUpdated ?? new Date().toISOString().split('T')[0],
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    dispatch({
      type: 'UPSERT_PF',
      payload: {
        id: entry?.id ?? generateId(),
        memberId: activeMemberId,
        ...form,
        lastUpdated: new Date().toISOString().split('T')[0],
      },
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const totalMonthly = form.employeeContribution + form.employerContribution;
  const yearlyAccrual = totalMonthly * 12;

  const projections = [1, 5, 10, 20].map(years => {
    let amount = form.currentAmount;
    for (let y = 0; y < years; y++) {
      amount = (amount + yearlyAccrual) * (1 + PF_RATE / 100);
    }
    return { years, amount };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Provident Fund (EPF)</h2>
          <p className="text-slate-400 text-sm mt-1">{member?.name} — Current Rate: {PF_RATE}% p.a.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase size={20} className="text-indigo-400" />
            <h3 className="text-white font-semibold">Update PF Details</h3>
          </div>

          <div>
            <label className={labelClass}>UAN Number</label>
            <input className={inputClass} placeholder="Universal Account Number" value={form.uanNumber}
              onChange={e => setForm(f => ({ ...f, uanNumber: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Current PF Balance (₹)</label>
            <input className={inputClass} type="number" min="0" placeholder="Total balance as on date"
              value={form.currentAmount || ''}
              onChange={e => setForm(f => ({ ...f, currentAmount: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className={labelClass}>Employee Contribution / Month (₹)</label>
            <input className={inputClass} type="number" min="0" placeholder="12% of basic salary"
              value={form.employeeContribution || ''}
              onChange={e => setForm(f => ({ ...f, employeeContribution: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className={labelClass}>Employer Contribution / Month (₹)</label>
            <input className={inputClass} type="number" min="0" placeholder="Employer's 12% share"
              value={form.employerContribution || ''}
              onChange={e => setForm(f => ({ ...f, employerContribution: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className={labelClass}>Last Updated</label>
            <input className={inputClass} type="date" value={form.lastUpdated}
              onChange={e => setForm(f => ({ ...f, lastUpdated: e.target.value }))} />
          </div>

          <button onClick={handleSave}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium transition-all ${saved ? 'bg-emerald-600 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
            {saved ? <><RefreshCw size={16} className="animate-spin" /> Saved!</> : <><Save size={16} /> Save Details</>}
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-4">Contribution Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Current Balance</span>
                <span className="text-white font-bold text-lg">{formatCurrency(form.currentAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Employee / Month</span>
                <span className="text-blue-400 font-semibold">{formatCurrency(form.employeeContribution)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Employer / Month</span>
                <span className="text-purple-400 font-semibold">{formatCurrency(form.employerContribution)}</span>
              </div>
              <div className="h-px bg-slate-700" />
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Total / Month</span>
                <span className="text-emerald-400 font-bold">{formatCurrency(totalMonthly)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Total / Year</span>
                <span className="text-emerald-400 font-semibold">{formatCurrency(yearlyAccrual)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Interest Rate</span>
                <span className="text-amber-400 font-semibold">{PF_RATE}% p.a.</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
            <h3 className="text-white font-semibold mb-4">Retirement Projections</h3>
            <div className="space-y-2">
              {projections.map(({ years, amount }) => (
                <div key={years} className="flex items-center gap-3">
                  <span className="text-slate-400 text-sm w-16">{years} yr{years > 1 ? 's' : ''}</span>
                  <div className="flex-1 bg-slate-700/50 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full"
                      style={{ width: `${Math.min((amount / (projections[projections.length - 1].amount || 1)) * 100, 100)}%` }} />
                  </div>
                  <span className="text-white font-semibold text-sm w-28 text-right">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
            <p className="text-slate-500 text-xs mt-3">Assuming {PF_RATE}% annual rate and current contributions.</p>
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 flex gap-3">
            <Info size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-slate-400 text-xs leading-relaxed">
              EPF is tax-exempt on contribution (80C), interest, and withdrawal after 5 years (EEE status).
              Employer contributes 8.33% to EPS and 3.67% to EPF from their 12% share.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

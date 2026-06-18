import React, { useState } from 'react';
import type { MutualFund } from '../../types';
import { generateId } from '../../utils/helpers';

interface MFFormProps {
  initial?: MutualFund;
  memberId: string;
  onSave: (mf: MutualFund) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500 transition-colors placeholder-slate-500';
const labelClass = 'block text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wide';

export default function MFForm({ initial, memberId, onSave, onCancel }: MFFormProps) {
  const [form, setForm] = useState({
    companyName: initial?.companyName ?? '',
    schemeName: initial?.schemeName ?? '',
    isSIP: initial?.isSIP ?? false,
    quantity: initial?.quantity ?? 0,
    purchasePrice: initial?.purchasePrice ?? 0,
    dateOfPurchase: initial?.dateOfPurchase ?? '',
    currentPrice: initial?.currentPrice ?? 0,
  });

  const set = (field: keyof typeof form, value: string | number | boolean) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, id: initial?.id ?? generateId(), memberId });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* SIP toggle */}
      <div className="flex items-center gap-3 bg-slate-700/50 rounded-xl p-3">
        <span className="text-slate-300 text-sm flex-1">Type</span>
        <button type="button" onClick={() => set('isSIP', false)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${!form.isSIP ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
          Lump Sum
        </button>
        <button type="button" onClick={() => set('isSIP', true)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${form.isSIP ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
          SIP
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>AMC / Fund House *</label>
          <input className={inputClass} required placeholder="e.g. SBI, Mirae, Axis" value={form.companyName}
            onChange={e => set('companyName', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Scheme Name *</label>
          <input className={inputClass} required placeholder="e.g. Bluechip Fund Direct" value={form.schemeName}
            onChange={e => set('schemeName', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Units Held *</label>
          <input className={inputClass} required type="number" step="0.001" min="0" placeholder="Units"
            value={form.quantity || ''}
            onChange={e => set('quantity', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelClass}>Avg. Purchase NAV (₹) *</label>
          <input className={inputClass} required type="number" step="0.01" min="0" placeholder="NAV at purchase"
            value={form.purchasePrice || ''}
            onChange={e => set('purchasePrice', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelClass}>Date of Purchase *</label>
          <input className={inputClass} required type="date" value={form.dateOfPurchase}
            onChange={e => set('dateOfPurchase', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Current NAV (₹) *</label>
          <input className={inputClass} required type="number" step="0.01" min="0" placeholder="Today's NAV"
            value={form.currentPrice || ''}
            onChange={e => set('currentPrice', parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      {form.quantity > 0 && form.purchasePrice > 0 && (
        <div className="bg-slate-700/50 rounded-xl p-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-slate-400 text-xs">Invested</p>
            <p className="text-white font-semibold">₹{(form.quantity * form.purchasePrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Current Value</p>
            <p className="text-white font-semibold">₹{(form.quantity * form.currentPrice).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">P&L</p>
            <p className={`font-semibold ${form.currentPrice >= form.purchasePrice ? 'text-emerald-400' : 'text-red-400'}`}>
              ₹{((form.quantity * form.currentPrice) - (form.quantity * form.purchasePrice)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition-colors">
          {initial ? 'Update Fund' : 'Add Fund'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 rounded-xl transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

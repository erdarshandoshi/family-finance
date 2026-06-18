import React, { useState } from 'react';
import type { FD } from '../../types';
import { generateId } from '../../utils/helpers';

interface FDFormProps {
  initial?: FD;
  memberId: string;
  onSave: (fd: FD) => void;
  onCancel: () => void;
}

const empty = (): Omit<FD, 'id' | 'memberId'> => ({
  bankName: '',
  customerId: '',
  accountNumber: '',
  amountInvested: 0,
  maturityAmount: 0,
  dateOfInvestment: '',
  maturityDate: '',
  rateOfInterest: 0,
});

const inputClass =
  'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500 transition-colors placeholder-slate-500';
const labelClass = 'block text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wide';

export default function FDForm({ initial, memberId, onSave, onCancel }: FDFormProps) {
  const [form, setForm] = useState<Omit<FD, 'id' | 'memberId'>>(
    initial ? { ...initial } : empty()
  );

  const set = (field: keyof typeof form, value: string | number) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, id: initial?.id ?? generateId(), memberId });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Bank Name *</label>
          <input className={inputClass} required placeholder="e.g. SBI, HDFC" value={form.bankName}
            onChange={e => set('bankName', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Customer ID</label>
          <input className={inputClass} placeholder="Customer ID" value={form.customerId}
            onChange={e => set('customerId', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>FD Account Number *</label>
          <input className={inputClass} required placeholder="Account number" value={form.accountNumber}
            onChange={e => set('accountNumber', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Rate of Interest (%) *</label>
          <input className={inputClass} required type="number" step="0.01" min="0" max="20"
            placeholder="e.g. 7.5" value={form.rateOfInterest || ''}
            onChange={e => set('rateOfInterest', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelClass}>Amount Invested (₹) *</label>
          <input className={inputClass} required type="number" min="0" placeholder="e.g. 100000"
            value={form.amountInvested || ''}
            onChange={e => set('amountInvested', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelClass}>Maturity Amount (₹) *</label>
          <input className={inputClass} required type="number" min="0" placeholder="e.g. 115000"
            value={form.maturityAmount || ''}
            onChange={e => set('maturityAmount', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelClass}>Date of Investment *</label>
          <input className={inputClass} required type="date" value={form.dateOfInvestment}
            onChange={e => set('dateOfInvestment', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Maturity Date *</label>
          <input className={inputClass} required type="date" value={form.maturityDate}
            onChange={e => set('maturityDate', e.target.value)} />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit"
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition-colors">
          {initial ? 'Update FD' : 'Add FD'}
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 rounded-xl transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

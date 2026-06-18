import React, { useState } from 'react';
import type { Stock } from '../../types';
import { generateId } from '../../utils/helpers';

interface StockFormProps {
  initial?: Stock;
  memberId: string;
  onSave: (s: Stock) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none focus:border-indigo-500 transition-colors placeholder-slate-500';
const labelClass = 'block text-slate-400 text-xs font-medium mb-1.5 uppercase tracking-wide';

export default function StockForm({ initial, memberId, onSave, onCancel }: StockFormProps) {
  const [form, setForm] = useState({
    stockName: initial?.stockName ?? '',
    dateOfPurchase: initial?.dateOfPurchase ?? '',
    quantity: initial?.quantity ?? 0,
    purchasePrice: initial?.purchasePrice ?? 0,
    currentPrice: initial?.currentPrice ?? 0,
  });

  const set = (field: keyof typeof form, value: string | number) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, id: initial?.id ?? generateId(), memberId });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelClass}>Stock Name / Symbol *</label>
          <input className={inputClass} required placeholder="e.g. RELIANCE, TCS, HDFC Bank" value={form.stockName}
            onChange={e => set('stockName', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Date of Purchase *</label>
          <input className={inputClass} required type="date" value={form.dateOfPurchase}
            onChange={e => set('dateOfPurchase', e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Quantity (Shares) *</label>
          <input className={inputClass} required type="number" min="0.0001" step="0.0001" placeholder="No. of shares"
            value={form.quantity || ''}
            onChange={e => set('quantity', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelClass}>Purchase Price (₹/share) *</label>
          <input className={inputClass} required type="number" min="0.01" step="0.01" placeholder="Price at buy"
            value={form.purchasePrice || ''}
            onChange={e => set('purchasePrice', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className={labelClass}>Current Market Price (₹) *</label>
          <input className={inputClass} required type="number" min="0.01" step="0.01" placeholder="Today's price"
            value={form.currentPrice || ''}
            onChange={e => set('currentPrice', parseFloat(e.target.value) || 0)} />
        </div>
      </div>

      {form.quantity > 0 && form.purchasePrice > 0 && (
        <div className="bg-slate-700/50 rounded-xl p-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-slate-400 text-xs">Total Invested</p>
            <p className="text-white font-semibold">₹{(form.quantity * form.purchasePrice).toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Current Value</p>
            <p className="text-white font-semibold">₹{(form.quantity * form.currentPrice).toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">P&L</p>
            <p className={`font-semibold ${form.currentPrice >= form.purchasePrice ? 'text-emerald-400' : 'text-red-400'}`}>
              ₹{((form.quantity * form.currentPrice) - (form.quantity * form.purchasePrice)).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition-colors">
          {initial ? 'Update Stock' : 'Add Stock'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium py-2.5 rounded-xl transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

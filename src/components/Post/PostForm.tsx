import React, { useState } from 'react';
import type { PostInvestment, FamilyMember, PostScheme } from '../../types';
import { generateId } from '../../utils/helpers';
import { SCHEME_INFO, calcMaturityDate, calcMaturityAmount } from '../../utils/postUtils';

interface Props {
  initial?: PostInvestment;
  memberId: string;
  members: FamilyMember[];
  onSave: (inv: PostInvestment) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full bg-surface border border-edge rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint';
const labelClass = 'block text-muted text-xs font-medium mb-1.5 uppercase tracking-wide';

const SCHEMES: PostScheme[] = ['NSC', 'KVP', 'MIS', 'TD', 'SCSS', 'RD', 'SSY'];

type FormState = Omit<PostInvestment, 'id' | 'memberId'>;

const emptyForm = (): FormState => ({
  scheme: 'NSC',
  accountNumber: '',
  principal: 0,
  monthlyDeposit: 0,
  interestRate: SCHEME_INFO['NSC'].rate,
  startDate: '',
  maturityDate: '',
  maturityAmount: 0,
  notes: '',
});

export default function PostForm({ initial, memberId, members, onSave, onCancel }: Props) {
  const defaultMemberId = members.find(m => m.id === memberId) ? memberId : (members[0]?.id ?? memberId);
  const [selectedMemberId, setSelectedMemberId] = useState(initial?.memberId ?? defaultMemberId);
  const [form, setForm] = useState<FormState>(
    initial ? { ...initial } : emptyForm()
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (field: string, value: unknown) => setForm(f => ({ ...f, [field]: value }));

  const handleSchemeChange = (scheme: PostScheme) => {
    const newRate = SCHEME_INFO[scheme].rate;
    const newMaturityDate = form.startDate ? calcMaturityDate(form.startDate, scheme) : '';
    setForm(f => ({ ...f, scheme, interestRate: newRate, maturityDate: newMaturityDate }));
  };

  const handleStartDateChange = (startDate: string) => {
    const newMaturityDate = startDate ? calcMaturityDate(startDate, form.scheme) : '';
    setForm(f => ({ ...f, startDate, maturityDate: newMaturityDate }));
  };

  const handleAutoCalc = () => {
    const amt = calcMaturityAmount(
      form.scheme,
      form.principal,
      form.interestRate,
      form.monthlyDeposit,
      form.startDate,
      form.maturityDate,
    );
    set('maturityAmount', amt);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, id: initial?.id ?? generateId(), memberId: selectedMemberId });
  };

  const isRD = form.scheme === 'RD';
  const principalLabel = isRD ? 'Principal / Initial Deposit (₹)' : 'Principal / Investment (₹)';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Member selector */}
      <div>
        <label className={labelClass}>Family Member *</label>
        <select
          className={inputClass}
          value={selectedMemberId}
          onChange={e => setSelectedMemberId(e.target.value)}
        >
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Scheme */}
      <div>
        <label className={labelClass}>Scheme *</label>
        <select
          className={inputClass}
          value={form.scheme}
          onChange={e => handleSchemeChange(e.target.value as PostScheme)}
        >
          {SCHEMES.map(s => (
            <option key={s} value={s}>{s} — {SCHEME_INFO[s].label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Account / Certificate Number</label>
          <input
            className={inputClass}
            placeholder="Account or certificate no."
            value={form.accountNumber}
            onChange={e => set('accountNumber', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>{principalLabel} *</label>
          <input
            className={inputClass}
            required
            type="number"
            min="0"
            placeholder="e.g. 100000"
            value={form.principal || ''}
            onChange={e => set('principal', parseFloat(e.target.value) || 0)}
          />
        </div>

        {/* Monthly deposit — only for RD */}
        {isRD && (
          <div>
            <label className={labelClass}>Monthly Deposit (₹) *</label>
            <input
              className={inputClass}
              required
              type="number"
              min="0"
              placeholder="e.g. 5000"
              value={form.monthlyDeposit || ''}
              onChange={e => set('monthlyDeposit', parseFloat(e.target.value) || 0)}
            />
          </div>
        )}

        <div>
          <label className={labelClass}>Interest Rate (%)</label>
          <input
            className={inputClass}
            type="number"
            step="0.01"
            min="0"
            max="30"
            value={form.interestRate || ''}
            onChange={e => set('interestRate', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className={labelClass}>Start Date *</label>
          <input
            className={inputClass}
            required
            type="date"
            value={form.startDate}
            onChange={e => handleStartDateChange(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Maturity Date</label>
          <input
            className={inputClass}
            type="date"
            value={form.maturityDate}
            onChange={e => set('maturityDate', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Maturity Amount (₹)</label>
          <div className="flex gap-2">
            <input
              className={inputClass}
              type="number"
              min="0"
              placeholder="e.g. 140000"
              value={form.maturityAmount || ''}
              onChange={e => set('maturityAmount', parseFloat(e.target.value) || 0)}
            />
            <button
              type="button"
              onClick={handleAutoCalc}
              className="flex-shrink-0 px-3 py-2 bg-surface3 hover:bg-surface3 text-muted hover:text-content rounded-xl text-xs transition-colors whitespace-nowrap"
            >
              Auto-calc
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea
          className={inputClass}
          rows={2}
          placeholder="Additional notes..."
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition-colors"
        >
          {initial ? 'Update Investment' : 'Add Investment'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-surface3 hover:bg-surface3 text-content font-medium py-2.5 rounded-xl transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

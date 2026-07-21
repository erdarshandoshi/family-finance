import React, { useState } from 'react';
import type { InsurancePolicy, FamilyMember } from '../../types';
import { generateId } from '../../utils/helpers';

interface Props {
  initial?: InsurancePolicy;
  memberId: string;
  members: FamilyMember[];
  defaultType: 'mediclaim' | 'term';
  onSave: (policy: InsurancePolicy) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full bg-surface border border-edge rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint';
const labelClass = 'block text-muted text-xs font-medium mb-1.5 uppercase tracking-wide';

type FormState = Omit<InsurancePolicy, 'id' | 'memberId'>;

const emptyForm = (defaultType: 'mediclaim' | 'term'): FormState => ({
  type: defaultType,
  insurer: '',
  policyNumber: '',
  planName: '',
  sumAssured: 0,
  premiumAmount: 0,
  premiumFrequency: 'annual',
  startDate: '',
  endDate: '',
  nominees: '',
  notes: '',
  coverageType: 'individual',
  policyTerm: 20,
});

export default function InsuranceForm({ initial, memberId, members, defaultType, onSave, onCancel }: Props) {
  const defaultMemberId = members.find(m => m.id === memberId) ? memberId : (members[0]?.id ?? memberId);
  const [selectedMemberId, setSelectedMemberId] = useState(initial?.memberId ?? defaultMemberId);
  const [form, setForm] = useState<FormState>(
    initial ? { ...initial } : emptyForm(defaultType)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (field: string, value: unknown) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ ...form, id: initial?.id ?? generateId(), memberId: selectedMemberId });
  };

  const endDateLabel = form.type === 'mediclaim' ? 'Renewal Date' : 'End Date';

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

      {/* Type toggle */}
      <div>
        <label className={labelClass}>Policy Type</label>
        <div className="flex gap-2">
          {(['mediclaim', 'term'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => set('type', t)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border ${
                form.type === t
                  ? 'bg-indigo-600/20 text-accent border-indigo-500/50'
                  : 'bg-surface text-muted border-edge hover:text-content'
              }`}
            >
              {t === 'mediclaim' ? 'Mediclaim / Health' : 'Term Plan'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Insurer *</label>
          <input
            className={inputClass}
            required
            placeholder="e.g. LIC, Star Health"
            value={form.insurer}
            onChange={e => set('insurer', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Plan Name *</label>
          <input
            className={inputClass}
            required
            placeholder="e.g. New Jeevan Anand"
            value={form.planName}
            onChange={e => set('planName', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Policy Number</label>
          <input
            className={inputClass}
            placeholder="Policy / Certificate No."
            value={form.policyNumber}
            onChange={e => set('policyNumber', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>Sum Assured / Cover (₹) *</label>
          <input
            className={inputClass}
            required
            type="number"
            min="0"
            placeholder="e.g. 500000"
            value={form.sumAssured || ''}
            onChange={e => set('sumAssured', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className={labelClass}>Premium Amount (₹) *</label>
          <input
            className={inputClass}
            required
            type="number"
            min="0"
            placeholder="e.g. 12000"
            value={form.premiumAmount || ''}
            onChange={e => set('premiumAmount', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div>
          <label className={labelClass}>Premium Frequency</label>
          <select
            className={inputClass}
            value={form.premiumFrequency}
            onChange={e => set('premiumFrequency', e.target.value)}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="half-yearly">Half-Yearly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Start Date</label>
          <input
            className={inputClass}
            type="date"
            value={form.startDate}
            onChange={e => set('startDate', e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass}>{endDateLabel} *</label>
          <input
            className={inputClass}
            required
            type="date"
            value={form.endDate}
            onChange={e => set('endDate', e.target.value)}
          />
        </div>

        {/* Conditional: coverageType for mediclaim */}
        {form.type === 'mediclaim' && (
          <div>
            <label className={labelClass}>Coverage Type</label>
            <select
              className={inputClass}
              value={form.coverageType}
              onChange={e => set('coverageType', e.target.value)}
            >
              <option value="individual">Individual</option>
              <option value="floater">Family Floater</option>
            </select>
          </div>
        )}

        {/* Conditional: policyTerm for term */}
        {form.type === 'term' && (
          <div>
            <label className={labelClass}>Policy Term (Years)</label>
            <input
              className={inputClass}
              type="number"
              min="1"
              max="100"
              value={form.policyTerm || ''}
              onChange={e => set('policyTerm', parseInt(e.target.value) || 0)}
            />
          </div>
        )}

        <div>
          <label className={labelClass}>Nominees</label>
          <input
            className={inputClass}
            placeholder="e.g. Spouse, Children"
            value={form.nominees}
            onChange={e => set('nominees', e.target.value)}
          />
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
          {initial ? 'Update Policy' : 'Add Policy'}
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

import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FD, FamilyMember } from '../../types';
import { generateId } from '../../utils/helpers';

interface FDEntry {
  accountNumber: string;
  rateOfInterest: string;
  amountInvested: string;
  maturityAmount: string;
  dateOfInvestment: string;
  maturityDate: string;
}

interface FDFormProps {
  initial?: FD;
  memberId: string;
  members: FamilyMember[];
  existingFDs: FD[];
  onSave: (fds: FD[]) => void;
  onCancel: () => void;
}

const emptyEntry = (): FDEntry => ({
  accountNumber: '',
  rateOfInterest: '',
  amountInvested: '',
  maturityAmount: '',
  dateOfInvestment: '',
  maturityDate: '',
});

const inputClass =
  'w-full bg-surface border border-edge rounded-xl px-3 py-2.5 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint';
const labelClass = 'block text-muted text-xs font-medium mb-1.5 uppercase tracking-wide';

export default function FDForm({ initial, memberId, members, existingFDs, onSave, onCancel }: FDFormProps) {
  const defaultMemberId = members.find(m => m.id === memberId) ? memberId : (members[0]?.id ?? memberId);
  const [selectedMemberId, setSelectedMemberId] = useState(initial?.memberId ?? defaultMemberId);
  const [bankName, setBankName] = useState(initial?.bankName ?? '');
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '');
  const [nominee, setNominee] = useState(initial?.nominee ?? '');
  const [isJoint, setIsJoint] = useState(initial?.isJoint ?? false);
  const [jointHolderName, setJointHolderName] = useState(initial?.jointHolderName ?? '');
  const [entries, setEntries] = useState<FDEntry[]>(
    initial
      ? [{
          accountNumber: initial.accountNumber,
          rateOfInterest: String(initial.rateOfInterest),
          amountInvested: String(initial.amountInvested),
          maturityAmount: String(initial.maturityAmount),
          dateOfInvestment: initial.dateOfInvestment,
          maturityDate: initial.maturityDate,
        }]
      : [emptyEntry()]
  );

  const handleBankChange = (value: string) => {
    setBankName(value);
    if (!initial) {
      const match = existingFDs.find(f => f.bankName.toLowerCase() === value.trim().toLowerCase());
      if (match?.customerId) setCustomerId(match.customerId);
    }
  };

  const updateEntry = (i: number, field: keyof FDEntry, value: string) => {
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e));
  };

  const addEntry = () => setEntries(prev => [...prev, emptyEntry()]);
  const removeEntry = (i: number) => setEntries(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fds: FD[] = entries.map(entry => ({
      id: initial?.id ?? generateId(),
      memberId: selectedMemberId,
      bankName,
      customerId,
      accountNumber: entry.accountNumber,
      rateOfInterest: parseFloat(entry.rateOfInterest) || 0,
      amountInvested: parseFloat(entry.amountInvested) || 0,
      maturityAmount: parseFloat(entry.maturityAmount) || 0,
      dateOfInvestment: entry.dateOfInvestment,
      maturityDate: entry.maturityDate,
      nominee: nominee || undefined,
      isJoint,
      jointHolderName: isJoint ? (jointHolderName || undefined) : undefined,
    }));
    onSave(fds);
  };

  const isEdit = !!initial;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Shared fields — row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>Family Member *</label>
          <select className={inputClass} value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Bank Name *</label>
          <input className={inputClass} required placeholder="e.g. SBI, HDFC" value={bankName}
            onChange={e => handleBankChange(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Customer ID</label>
          <input className={inputClass} placeholder="Customer ID (auto-filled)" value={customerId}
            onChange={e => setCustomerId(e.target.value)} />
        </div>
      </div>

      {/* Shared fields — row 2: FD type + nominee */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>FD Type</label>
          <div className="flex items-center gap-2 bg-surface2 rounded-xl p-1">
            {(['Single', 'Joint'] as const).map(type => (
              <button key={type} type="button"
                onClick={() => setIsJoint(type === 'Joint')}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${isJoint === (type === 'Joint') ? 'bg-indigo-600 text-white' : 'text-muted hover:text-content'}`}>
                {type}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass}>Nominee</label>
          <input className={inputClass} placeholder="Nominee name" value={nominee}
            onChange={e => setNominee(e.target.value)} />
        </div>
      </div>

      {/* Joint holder name (conditional) */}
      {isJoint && (
        <div>
          <label className={labelClass}>Joint Holder Name *</label>
          <input className={inputClass} required={isJoint} placeholder="Name of the joint account holder"
            value={jointHolderName} onChange={e => setJointHolderName(e.target.value)} />
        </div>
      )}

      {/* FD entry cards */}
      <div className="space-y-4">
        {entries.map((entry, i) => (
          <div key={i} className="bg-surface border border-edge rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-muted text-sm font-medium">
                {entries.length > 1 ? `FD ${i + 1}` : 'FD Details'}
              </span>
              {entries.length > 1 && (
                <button type="button" onClick={() => removeEntry(i)}
                  className="text-faint hover:text-danger transition-colors p-1">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Account No. *</label>
                <input className={inputClass} required placeholder="Account number" value={entry.accountNumber}
                  onChange={e => updateEntry(i, 'accountNumber', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Rate (%) *</label>
                <input className={inputClass} required type="number" step="0.01" min="0" max="20"
                  placeholder="e.g. 7.5" value={entry.rateOfInterest}
                  onChange={e => updateEntry(i, 'rateOfInterest', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Invested (₹) *</label>
                <input className={inputClass} required type="number" min="0" placeholder="e.g. 100000"
                  value={entry.amountInvested}
                  onChange={e => updateEntry(i, 'amountInvested', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Maturity Amt (₹) *</label>
                <input className={inputClass} required type="number" min="0" placeholder="e.g. 115000"
                  value={entry.maturityAmount}
                  onChange={e => updateEntry(i, 'maturityAmount', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Inv. Date *</label>
                <input className={inputClass} required type="date" value={entry.dateOfInvestment}
                  onChange={e => updateEntry(i, 'dateOfInvestment', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Maturity Date *</label>
                <input className={inputClass} required type="date" value={entry.maturityDate}
                  onChange={e => updateEntry(i, 'maturityDate', e.target.value)} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add another (add mode only) */}
      {!isEdit && (
        <button type="button" onClick={addEntry}
          className="w-full flex items-center justify-center gap-2 border border-dashed border-edge rounded-xl py-2.5 text-muted hover:text-content hover:border-edge transition-colors text-sm">
          <Plus size={14} /> Add Another FD
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button type="submit"
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition-colors text-sm">
          {isEdit ? 'Update FD' : entries.length > 1 ? `Save ${entries.length} FDs` : 'Add FD'}
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 bg-surface3 hover:bg-surface3 text-content font-medium py-2.5 rounded-xl transition-colors text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

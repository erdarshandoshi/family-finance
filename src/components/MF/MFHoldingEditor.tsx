import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { generateId, formatCurrency } from '../../utils/helpers';
import type { MutualFund, FamilyMember } from '../../types';
import type { MFGroup } from '../../utils/mfUtils';

interface LotRow {
  id: string;
  dateOfPurchase: string;
  quantity: number | '';
  purchasePrice: number | '';
  isInitialPayment?: boolean;
}

interface Props {
  group: MFGroup;
  members: FamilyMember[];
  onSave: (finalLots: MutualFund[], originalIds: string[]) => void;
  onCancel: () => void;
}

const fieldCls = 'w-full bg-surface3 text-content rounded-lg px-2 py-1.5 text-xs border border-edge focus:border-indigo-500 outline-none placeholder-faint';
const sharedCls = 'w-full bg-surface3 text-content rounded-xl px-3 py-2.5 text-sm border border-edge focus:border-indigo-500 outline-none placeholder-faint';

export default function MFHoldingEditor({ group, members, onSave, onCancel }: Props) {
  const originalIds = group.lots.map(l => l.id);
  const [selectedMemberId, setSelectedMemberId] = useState(group.memberId);
  const [companyName] = useState(group.companyName);
  const [schemeName, setSchemeName] = useState(group.schemeName);
  const [folioNumber, setFolioNumber] = useState(group.folioNumber ?? '');
  const [nominee, setNominee] = useState(group.nominee ?? '');
  const [remarks, setRemarks] = useState(group.remarks ?? '');
  const [lots, setLots] = useState<LotRow[]>(
    group.lots.map(l => ({
      id: l.id,
      dateOfPurchase: l.dateOfPurchase,
      quantity: l.quantity,
      purchasePrice: l.purchasePrice,
      isInitialPayment: l.isInitialPayment,
    }))
  );

  const updateLot = (id: string, field: keyof LotRow, value: string | number | '') =>
    setLots(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));

  const deleteLot = (id: string) => {
    if (lots.length === 1) return;
    setLots(prev => prev.filter(l => l.id !== id));
  };

  const addLot = () => setLots(prev => [...prev, {
    id: generateId(),
    dateOfPurchase: new Date().toISOString().split('T')[0],
    quantity: '',
    purchasePrice: '',
  }]);

  const handleSave = () => {
    const finalLots: MutualFund[] = lots.map(l => {
      const mf: MutualFund = {
        id: l.id,
        memberId: selectedMemberId,
        companyName: companyName.trim() || group.companyName,
        schemeName: schemeName.trim() || group.schemeName,
        isSIP: group.isSIP,
        dateOfPurchase: l.dateOfPurchase,
        quantity: Number(l.quantity) || 0,
        purchasePrice: Number(l.purchasePrice) || 0,
        currentPrice: group.currentNav,
      };
      if (group.schemeCode) mf.schemeCode = group.schemeCode;
      if (folioNumber) mf.folioNumber = folioNumber;
      if (nominee) mf.nominee = nominee;
      if (remarks) mf.remarks = remarks;
      // Carry through attribution/classification the editor doesn't expose,
      // otherwise saving here would silently drop them.
      if (group.guardianMemberId) mf.guardianMemberId = group.guardianMemberId;
      if (l.isInitialPayment) mf.isInitialPayment = true;
      return mf;
    });
    onSave(finalLots, originalIds);
  };

  const totalUnits = lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const totalInvested = lots.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.purchasePrice) || 0), 0);
  const avgNav = totalUnits > 0 ? totalInvested / totalUnits : 0;
  const totalCurrent = totalUnits * group.currentNav;
  const pl = totalCurrent - totalInvested;

  return (
    <div className="space-y-5">
      {/* Scheme name */}
      <div>
        <label className="text-muted text-xs font-medium block mb-1.5 uppercase tracking-wide">Scheme Name</label>
        <input value={schemeName} onChange={e => setSchemeName(e.target.value)}
          placeholder="e.g. Bluechip Fund Direct Growth" className={sharedCls} />
      </div>

      {/* Current NAV + type strip */}
      <div className="flex items-center justify-between bg-surface2 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${group.isSIP ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
            {group.isSIP ? 'SIP' : 'Lump Sum'}
          </span>
          {group.schemeCode && <span className="text-faint text-xs">Code: {group.schemeCode}</span>}
        </div>
        <div className="text-right">
          <p className="text-muted text-xs">Current NAV</p>
          <p className="text-content font-bold">₹{group.currentNav.toLocaleString('en-IN', { maximumFractionDigits: 4 })}</p>
        </div>
      </div>

      {/* Member + Folio + Nominee */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-muted text-xs font-medium block mb-1.5 uppercase tracking-wide">Member</label>
          <select value={selectedMemberId} onChange={e => setSelectedMemberId(e.target.value)} className={sharedCls}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-muted text-xs font-medium block mb-1.5 uppercase tracking-wide">Folio Number</label>
          <input value={folioNumber} onChange={e => setFolioNumber(e.target.value)}
            placeholder="e.g. 12345678 / 01" className={sharedCls} />
        </div>
        <div>
          <label className="text-muted text-xs font-medium block mb-1.5 uppercase tracking-wide">Nominee</label>
          <input value={nominee} onChange={e => setNominee(e.target.value)}
            placeholder="Nominee name" className={sharedCls} />
        </div>
      </div>

      {/* Remarks */}
      <div>
        <label className="text-muted text-xs font-medium block mb-1.5 uppercase tracking-wide">Remarks</label>
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
          placeholder="Any notes — e.g. auto-SIP on 5th, linked to goal, tax-saving, etc."
          rows={2}
          className="w-full bg-surface3 text-content rounded-xl px-3 py-2.5 text-sm border border-edge focus:border-indigo-500 outline-none placeholder-faint resize-none" />
      </div>

      {/* Lots */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-muted text-sm font-medium">Purchase Lots ({lots.length})</p>
          <button type="button" onClick={addLot}
            className="flex items-center gap-1 text-accent hover:text-accent text-sm transition-colors">
            <Plus size={14} /> Add Lot
          </button>
        </div>
        <div className="space-y-2">
          {lots.map((lot, idx) => (
            <div key={lot.id} className="bg-surface2 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-faint text-xs font-medium flex items-center gap-1.5">
                  Lot {idx + 1}
                  {lot.isInitialPayment && (
                    <span className="bg-amber-500/15 text-warn px-1.5 py-0.5 rounded text-xs font-medium">Initial</span>
                  )}
                </span>
                {lots.length > 1 && (
                  <button type="button" onClick={() => deleteLot(lot.id)}
                    className="text-danger/60 hover:text-danger transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-muted text-xs mb-1 block">Date</label>
                  <input type="date" value={lot.dateOfPurchase}
                    onChange={e => updateLot(lot.id, 'dateOfPurchase', e.target.value)}
                    className={fieldCls} />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">Units</label>
                  <input type="number" min="0" step="0.001" value={lot.quantity}
                    onChange={e => updateLot(lot.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                    className={fieldCls} />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">Buy NAV (₹)</label>
                  <input type="number" min="0" step="0.01" value={lot.purchasePrice}
                    onChange={e => updateLot(lot.id, 'purchasePrice', e.target.value === '' ? '' : Number(e.target.value))}
                    className={fieldCls} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live aggregate */}
      <div className="bg-surface rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {[
          { label: 'Total Units', value: totalUnits.toFixed(3) },
          { label: 'Avg Buy NAV', value: `₹${avgNav.toFixed(2)}` },
          { label: 'Invested', value: formatCurrency(totalInvested) },
          { label: 'P&L', value: (pl >= 0 ? '+' : '') + formatCurrency(pl), color: pl >= 0 ? 'text-success' : 'text-danger' },
        ].map(item => (
          <div key={item.label}>
            <p className="text-faint text-xs">{item.label}</p>
            <p className={`font-semibold text-sm mt-0.5 ${item.color ?? 'text-content'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 bg-surface3 hover:bg-surface3 text-content rounded-xl py-2.5 text-sm font-medium transition-colors">
          Cancel
        </button>
        <button type="button" onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
          <Save size={15} /> Save Holdings
        </button>
      </div>
    </div>
  );
}

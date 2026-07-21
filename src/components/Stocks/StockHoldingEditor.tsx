import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { generateId, formatCurrency } from '../../utils/helpers';
import type { Stock, FamilyMember } from '../../types';
import type { StockGroup } from '../../utils/stockUtils';

interface LotRow {
  id: string;
  dateOfPurchase: string;
  quantity: number | '';
  purchasePrice: number | '';
}

interface Props {
  group: StockGroup;
  members: FamilyMember[];
  onSave: (finalLots: Stock[], originalIds: string[]) => void;
  onCancel: () => void;
}

export default function StockHoldingEditor({ group, members, onSave, onCancel }: Props) {
  const originalIds = group.lots.map(l => l.id);
  const [selectedMemberId, setSelectedMemberId] = useState(group.memberId);
  const [lots, setLots] = useState<LotRow[]>(
    group.lots.map(l => ({
      id: l.id,
      dateOfPurchase: l.dateOfPurchase,
      quantity: l.quantity,
      purchasePrice: l.purchasePrice,
    }))
  );

  const updateLot = (id: string, field: keyof LotRow, value: string | number | '') => {
    setLots(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const deleteLot = (id: string) => {
    if (lots.length === 1) return;
    setLots(prev => prev.filter(l => l.id !== id));
  };

  const addLot = () => {
    setLots(prev => [
      ...prev,
      {
        id: generateId(),
        dateOfPurchase: new Date().toISOString().split('T')[0],
        quantity: '',
        purchasePrice: '',
      },
    ]);
  };

  const handleSave = () => {
    const finalLots: Stock[] = lots.map(l => ({
      id: l.id,
      memberId: selectedMemberId,
      symbol: group.symbol,
      stockName: group.stockName,
      isin: group.isin,
      dateOfPurchase: l.dateOfPurchase,
      quantity: Number(l.quantity) || 0,
      purchasePrice: Number(l.purchasePrice) || 0,
      currentPrice: group.currentPrice,
      dematAccount: group.dematAccount,
    }));
    onSave(finalLots, originalIds);
  };

  const totalQty = lots.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  const totalInvested = lots.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.purchasePrice) || 0), 0);
  const avgPrice = totalQty > 0 ? totalInvested / totalQty : 0;
  const totalCurrent = totalQty * group.currentPrice;
  const pl = totalCurrent - totalInvested;

  return (
    <div className="space-y-5">
      {/* Stock header */}
      <div className="bg-surface2 rounded-xl p-4 flex items-start justify-between">
        <div>
          <p className="text-content font-bold text-lg">{group.symbol}</p>
          <p className="text-muted text-sm">{group.stockName}</p>
          {group.isin && <p className="text-faint text-xs font-mono mt-0.5">{group.isin}</p>}
        </div>
        <div className="text-right space-y-1">
          <div>
            <p className="text-muted text-xs">Live Price</p>
            <p className="text-content font-bold">₹{group.currentPrice.toLocaleString('en-IN')}</p>
          </div>
          <span className="inline-flex items-center text-xs bg-indigo-500/15 text-accent border border-indigo-500/25 px-2 py-0.5 rounded-full">
            {group.dematAccount}
          </span>
        </div>
      </div>

      {/* Member selector */}
      <div>
        <label className="text-muted text-xs font-medium block mb-1.5">Assign to</label>
        <select
          value={selectedMemberId}
          onChange={e => setSelectedMemberId(e.target.value)}
          className="w-full bg-surface3 text-content rounded-xl px-3 py-2.5 text-sm border border-edge focus:border-indigo-500 outline-none"
        >
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Lots */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-muted text-sm font-medium">Purchase Lots ({lots.length})</p>
          <button onClick={addLot}
            className="flex items-center gap-1 text-accent hover:text-accent text-sm transition-colors">
            <Plus size={14} /> Add Lot
          </button>
        </div>
        <div className="space-y-2">
          {lots.map((lot, idx) => (
            <div key={lot.id} className="bg-surface2 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-faint text-xs font-medium">Lot {idx + 1}</span>
                {lots.length > 1 && (
                  <button onClick={() => deleteLot(lot.id)}
                    className="text-danger/60 hover:text-danger transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-muted text-xs mb-1 block">Date</label>
                  <input
                    type="date"
                    value={lot.dateOfPurchase}
                    onChange={e => updateLot(lot.id, 'dateOfPurchase', e.target.value)}
                    className="w-full bg-surface3 text-content rounded-lg px-2 py-1.5 text-xs border border-edge focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">Qty</label>
                  <input
                    type="number" min="0" value={lot.quantity}
                    onChange={e => updateLot(lot.id, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-surface3 text-content rounded-lg px-2 py-1.5 text-xs border border-edge focus:border-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-muted text-xs mb-1 block">Buy Price (₹)</label>
                  <input
                    type="number" min="0" step="0.01" value={lot.purchasePrice}
                    onChange={e => updateLot(lot.id, 'purchasePrice', e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-surface3 text-content rounded-lg px-2 py-1.5 text-xs border border-edge focus:border-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live aggregate preview */}
      <div className="bg-surface rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        {[
          { label: 'Total Qty', value: totalQty.toString() },
          { label: 'Avg Buy', value: `₹${avgPrice.toFixed(2)}` },
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
        <button onClick={onCancel}
          className="flex-1 bg-surface3 hover:bg-surface3 text-content rounded-xl py-2.5 text-sm font-medium transition-colors">
          Cancel
        </button>
        <button onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors">
          <Save size={15} /> Save Holdings
        </button>
      </div>
    </div>
  );
}

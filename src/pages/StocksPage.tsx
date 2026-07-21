import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, getPLColor } from '../utils/helpers';
import type { Stock } from '../types';
import Modal from '../components/common/Modal';
import StockForm from '../components/Stocks/StockForm';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

export default function StocksPage() {
  const { data, dispatch, activeMemberId, setActiveMemberId } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Stock | null>(null);

  // Darshan and Jainil don't hold any stocks yet, so default this page to Niyati's tab.
  useEffect(() => {
    const niyati = data.members.find(m => m.name.trim().toLowerCase() === 'niyati');
    if (niyati) setActiveMemberId(niyati.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stocks = data.stocks.filter(s => s.memberId === activeMemberId);
  const member = data.members.find(m => m.id === activeMemberId);

  const handleSave = (s: Stock) => {
    dispatch({ type: editing ? 'UPDATE_STOCK' : 'ADD_STOCK', payload: s });
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this stock?')) dispatch({ type: 'DELETE_STOCK', payload: id });
  };

  const totalInvested = stocks.reduce((s, st) => s + st.quantity * st.purchasePrice, 0);
  const totalCurrent = stocks.reduce((s, st) => s + st.quantity * st.currentPrice, 0);
  const totalPL = totalCurrent - totalInvested;
  const plPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const pieData = stocks.map(s => ({
    name: s.stockName,
    value: s.quantity * s.currentPrice,
  }));

  const barData = stocks
    .map(s => ({
      name: s.stockName.length > 8 ? s.stockName.slice(0, 8) + '…' : s.stockName,
      pl: s.quantity * s.currentPrice - s.quantity * s.purchasePrice,
      plPct: ((s.currentPrice - s.purchasePrice) / s.purchasePrice) * 100,
    }))
    .sort((a, b) => b.pl - a.pl);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Stock Portfolio</h2>
          <p className="text-slate-400 text-sm mt-1">{member?.name} — {stocks.length} stock{stocks.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Add Stock
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Invested', value: formatCurrency(totalInvested), color: 'text-blue-400' },
          { label: 'Current Value', value: formatCurrency(totalCurrent), color: 'text-white' },
          { label: 'Total P&L', value: formatCurrency(totalPL), color: totalPL >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Overall Return', value: `${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(2)}%`, color: plPercent >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(item => (
          <div key={item.label} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
            <p className="text-slate-400 text-xs font-medium">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {stocks.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {/* Allocation Pie */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Portfolio Allocation</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={(v: unknown) => formatCurrency(v as number)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* P&L Bar */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Profit & Loss by Stock</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={(v: unknown) => formatCurrency(v as number)}
                />
                <Bar dataKey="pl" radius={[4, 4, 0, 0]} name="P&L">
                  {barData.map((d, i) => <Cell key={i} fill={d.pl >= 0 ? '#10b981' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Stock list */}
      {stocks.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
          <p>No stocks yet. Add your first stock holding.</p>
        </div>
      ) : (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Stock', 'Purchase Date', 'Qty', 'Buy Price', 'Curr. Price', 'Invested', 'Curr. Value', 'P&L', 'Return %', ''].map(h => (
                  <th key={h} className="text-left text-slate-400 text-xs font-medium px-4 py-3 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stocks.map(s => {
                const invested = s.quantity * s.purchasePrice;
                const current = s.quantity * s.currentPrice;
                const pl = current - invested;
                const pct = invested > 0 ? (pl / invested) * 100 : 0;

                return (
                  <tr key={s.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${pl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                          {pl >= 0 ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />}
                        </div>
                        <span className="text-white font-semibold">{s.stockName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(s.dateOfPurchase)}</td>
                    <td className="px-4 py-3 text-slate-300">{s.quantity}</td>
                    <td className="px-4 py-3 text-slate-300">₹{s.purchasePrice.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-slate-300">₹{s.currentPrice.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-slate-300">{formatCurrency(invested)}</td>
                    <td className="px-4 py-3 text-white font-medium">{formatCurrency(current)}</td>
                    <td className={`px-4 py-3 font-semibold ${getPLColor(pl)}`}>{pl >= 0 ? '+' : ''}{formatCurrency(pl)}</td>
                    <td className={`px-4 py-3 font-semibold ${getPLColor(pl)}`}>
                      <span className="flex items-center gap-0.5">
                        {pl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                        {Math.abs(pct).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setEditing(s); setShowForm(true); }}
                          className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(s.id)}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <Modal title={editing ? 'Edit Stock' : 'Add Stock'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <StockForm initial={editing ?? undefined} memberId={activeMemberId} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

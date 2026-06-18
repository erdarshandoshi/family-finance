import React, { useState } from 'react';
import { Plus, Edit2, Trash2, BarChart3, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, getPLColor } from '../utils/helpers';
import type { MutualFund } from '../types';
import Modal from '../components/common/Modal';
import MFForm from '../components/MF/MFForm';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];

export default function MFPage() {
  const { data, dispatch, activeMemberId } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MutualFund | null>(null);
  const [filter, setFilter] = useState<'all' | 'lump' | 'sip'>('all');

  const member = data.members.find(m => m.id === activeMemberId);
  const allMfs = data.mfs.filter(m => m.memberId === activeMemberId);
  const mfs = filter === 'sip' ? allMfs.filter(m => m.isSIP) : filter === 'lump' ? allMfs.filter(m => !m.isSIP) : allMfs;

  const handleSave = (mf: MutualFund) => {
    dispatch({ type: editing ? 'UPDATE_MF' : 'ADD_MF', payload: mf });
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this fund?')) dispatch({ type: 'DELETE_MF', payload: id });
  };

  const totalInvested = mfs.reduce((s, m) => s + m.quantity * m.purchasePrice, 0);
  const totalCurrent = mfs.reduce((s, m) => s + m.quantity * m.currentPrice, 0);
  const totalPL = totalCurrent - totalInvested;
  const plPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  const sipCount = allMfs.filter(m => m.isSIP).length;
  const lumpCount = allMfs.filter(m => !m.isSIP).length;

  const pieData = mfs.map(m => ({ name: m.schemeName || m.companyName, value: m.quantity * m.currentPrice }));
  const barData = mfs.map(m => ({
    name: (m.schemeName || m.companyName).slice(0, 10) + '…',
    pl: m.quantity * m.currentPrice - m.quantity * m.purchasePrice,
  })).sort((a, b) => b.pl - a.pl);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Mutual Funds & SIP</h2>
          <p className="text-slate-400 text-sm mt-1">{member?.name} — {sipCount} SIP · {lumpCount} Lump Sum</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> Add Fund
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Invested', value: formatCurrency(totalInvested), color: 'text-blue-400' },
          { label: 'Current Value', value: formatCurrency(totalCurrent), color: 'text-white' },
          { label: 'Total P&L', value: formatCurrency(totalPL), color: totalPL >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Overall Return', value: `${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%`, color: plPct >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(item => (
          <div key={item.label} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4">
            <p className="text-slate-400 text-xs font-medium">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        {(['all', 'lump', 'sip'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
            {f === 'all' ? 'All Funds' : f === 'sip' ? 'SIP Only' : 'Lump Sum Only'}
          </button>
        ))}
      </div>

      {mfs.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Portfolio Allocation</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">P&L by Fund</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="pl" radius={[4, 4, 0, 0]} name="P&L">
                  {barData.map((d, i) => <Cell key={i} fill={d.pl >= 0 ? '#10b981' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {mfs.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No funds yet. Add your first Mutual Fund or SIP.</p>
        </div>
      ) : (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                {['Fund', 'Type', 'Date', 'Units', 'Buy NAV', 'Curr. NAV', 'Invested', 'Value', 'P&L', 'Return', ''].map(h => (
                  <th key={h} className="text-left text-slate-400 text-xs font-medium px-4 py-3 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mfs.map(m => {
                const invested = m.quantity * m.purchasePrice;
                const current = m.quantity * m.currentPrice;
                const pl = current - invested;
                const pct = invested > 0 ? (pl / invested) * 100 : 0;

                return (
                  <tr key={m.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${pl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                          {pl >= 0 ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-red-400" />}
                        </div>
                        <div>
                          <p className="text-white font-semibold text-xs">{m.companyName}</p>
                          <p className="text-slate-400 text-xs">{m.schemeName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.isSIP ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                        {m.isSIP ? 'SIP' : 'Lump'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(m.dateOfPurchase)}</td>
                    <td className="px-4 py-3 text-slate-300">{m.quantity.toFixed(3)}</td>
                    <td className="px-4 py-3 text-slate-300">₹{m.purchasePrice}</td>
                    <td className="px-4 py-3 text-slate-300">₹{m.currentPrice}</td>
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
                        <button onClick={() => { setEditing(m); setShowForm(true); }}
                          className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(m.id)}
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
        <Modal title={editing ? 'Edit Fund' : 'Add Mutual Fund / SIP'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <MFForm initial={editing ?? undefined} memberId={activeMemberId} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

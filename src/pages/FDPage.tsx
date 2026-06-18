import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Landmark, AlertTriangle, Clock, CheckCircle, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, isMatured, isMaturityThisMonth, daysUntilMaturity } from '../utils/helpers';
import type { FD } from '../types';
import Modal from '../components/common/Modal';
import FDForm from '../components/FD/FDForm';

type StatusFilter = 'all' | 'active' | 'matured' | 'this-month';
type SortField = 'bankName' | 'amountInvested' | 'maturityAmount' | 'maturityDate' | 'rateOfInterest';
type SortDir = 'asc' | 'desc';

export default function FDPage() {
  const { data, dispatch, activeMemberId } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FD | null>(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [bankFilter, setBankFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('maturityDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const fds = data.fds.filter(f => f.memberId === activeMemberId);
  const member = data.members.find(m => m.id === activeMemberId);

  const uniqueBanks = useMemo(() => Array.from(new Set(fds.map(f => f.bankName))).sort(), [fds]);

  const filtered = useMemo(() => {
    let list = [...fds];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.bankName.toLowerCase().includes(q) ||
        f.accountNumber.toLowerCase().includes(q) ||
        f.customerId.toLowerCase().includes(q)
      );
    }

    if (bankFilter !== 'all') list = list.filter(f => f.bankName === bankFilter);

    if (statusFilter === 'active') list = list.filter(f => !isMatured(f.maturityDate));
    else if (statusFilter === 'matured') list = list.filter(f => isMatured(f.maturityDate));
    else if (statusFilter === 'this-month') list = list.filter(f => isMaturityThisMonth(f.maturityDate));

    list.sort((a, b) => {
      let av: number | string = a[sortField];
      let bv: number | string = b[sortField];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [fds, search, bankFilter, statusFilter, sortField, sortDir]);

  const handleSave = (fd: FD) => {
    dispatch({ type: editing ? 'UPDATE_FD' : 'ADD_FD', payload: fd });
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this FD?')) dispatch({ type: 'DELETE_FD', payload: id });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className={`ml-1 text-xs ${sortField === field ? 'text-indigo-400' : 'text-slate-600'}`}>
      {sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  const totalInvested = filtered.reduce((s, f) => s + f.amountInvested, 0);
  const totalMaturity = filtered.reduce((s, f) => s + f.maturityAmount, 0);
  const maturingThisMonth = fds.filter(f => isMaturityThisMonth(f.maturityDate));
  const hasFilters = search || bankFilter !== 'all' || statusFilter !== 'all';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Fixed Deposits</h2>
          <p className="text-slate-400 text-sm mt-1">
            {member?.name} — {filtered.length} of {fds.length} FD{fds.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add FD
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Invested', value: formatCurrency(totalInvested), color: 'text-blue-400' },
          { label: 'Total at Maturity', value: formatCurrency(totalMaturity), color: 'text-emerald-400' },
          { label: 'Total Gain', value: formatCurrency(totalMaturity - totalInvested), color: 'text-amber-400' },
          { label: 'Maturing This Month', value: String(maturingThisMonth.length), color: maturingThisMonth.length > 0 ? 'text-red-400' : 'text-slate-400' },
        ].map(item => (
          <div key={item.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-400 text-xs font-medium">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Maturing this month alert */}
      {maturingThisMonth.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
          <p className="text-amber-300 text-sm">
            <span className="font-semibold">{maturingThisMonth.length} FD{maturingThisMonth.length > 1 ? 's' : ''} maturing this month:</span>{' '}
            {maturingThisMonth.map(f => `${f.bankName} (${formatCurrency(f.maturityAmount)})`).join(' · ')}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="w-full bg-slate-700/50 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-white text-sm outline-none focus:border-indigo-500 transition-colors placeholder-slate-500"
              placeholder="Search by bank, account no, customer ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Bank filter */}
          <select
            className="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 transition-colors"
            value={bankFilter}
            onChange={e => setBankFilter(e.target.value)}
          >
            <option value="all">All Banks</option>
            {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          {/* Status filter */}
          <div className="flex items-center gap-1 bg-slate-700/50 border border-slate-600 rounded-lg p-1">
            {([
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'matured', label: 'Matured' },
              { value: 'this-month', label: 'This Month' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  statusFilter === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setBankFilter('all'); setStatusFilter('all'); }}
              className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors"
            >
              <X size={12} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {fds.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Landmark size={40} className="mx-auto mb-3 opacity-30" />
          <p>No FDs yet. Add your first Fixed Deposit.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <Search size={32} className="mx-auto mb-3 opacity-30" />
          <p>No FDs match your filters.</p>
        </div>
      ) : (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 bg-slate-800/80">
                  <th className="text-left px-4 py-3">
                    <button onClick={() => toggleSort('bankName')} className="text-slate-400 text-xs font-semibold uppercase tracking-wide hover:text-white flex items-center">
                      Bank <SortIcon field="bankName" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wide">Account No.</th>
                  <th className="text-left px-4 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wide">Customer ID</th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => toggleSort('rateOfInterest')} className="text-slate-400 text-xs font-semibold uppercase tracking-wide hover:text-white flex items-center">
                      Rate <SortIcon field="rateOfInterest" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => toggleSort('amountInvested')} className="text-slate-400 text-xs font-semibold uppercase tracking-wide hover:text-white flex items-center">
                      Invested <SortIcon field="amountInvested" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => toggleSort('maturityAmount')} className="text-slate-400 text-xs font-semibold uppercase tracking-wide hover:text-white flex items-center">
                      Maturity Amt <SortIcon field="maturityAmount" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wide">Gain</th>
                  <th className="text-left px-4 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wide">Inv. Date</th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => toggleSort('maturityDate')} className="text-slate-400 text-xs font-semibold uppercase tracking-wide hover:text-white flex items-center">
                      Maturity Date <SortIcon field="maturityDate" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((fd, idx) => {
                  const matured = isMatured(fd.maturityDate);
                  const thisMonth = isMaturityThisMonth(fd.maturityDate);
                  const days = daysUntilMaturity(fd.maturityDate);
                  const gain = fd.maturityAmount - fd.amountInvested;

                  return (
                    <tr
                      key={fd.id}
                      className={`border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-800/20'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Landmark size={14} className="text-indigo-400 flex-shrink-0" />
                          <span className="text-white font-semibold">{fd.bankName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-300 font-mono text-xs">{fd.accountNumber}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{fd.customerId || '—'}</td>
                      <td className="px-4 py-3 text-blue-400 font-semibold">{fd.rateOfInterest}%</td>
                      <td className="px-4 py-3 text-slate-200">{formatCurrency(fd.amountInvested)}</td>
                      <td className="px-4 py-3 text-emerald-400 font-semibold">{formatCurrency(fd.maturityAmount)}</td>
                      <td className="px-4 py-3 text-amber-400 font-semibold">{formatCurrency(gain)}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(fd.dateOfInvestment)}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{formatDate(fd.maturityDate)}</td>
                      <td className="px-4 py-3">
                        {matured ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <CheckCircle size={10} /> Matured
                          </span>
                        ) : thisMonth ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            <AlertTriangle size={10} /> This Month
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                            <Clock size={10} /> {days}d left
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setEditing(fd); setShowForm(true); }}
                            className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(fd.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {filtered.length > 1 && (
                <tfoot>
                  <tr className="border-t border-slate-600 bg-slate-800/80">
                    <td colSpan={4} className="px-4 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wide">
                      Totals ({filtered.length} FDs)
                    </td>
                    <td className="px-4 py-3 text-white font-bold text-sm">{formatCurrency(totalInvested)}</td>
                    <td className="px-4 py-3 text-emerald-400 font-bold text-sm">{formatCurrency(totalMaturity)}</td>
                    <td className="px-4 py-3 text-amber-400 font-bold text-sm">{formatCurrency(totalMaturity - totalInvested)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <Modal
          title={editing ? 'Edit Fixed Deposit' : 'Add Fixed Deposit'}
          onClose={() => { setShowForm(false); setEditing(null); }}
        >
          <FDForm
            initial={editing ?? undefined}
            memberId={activeMemberId}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

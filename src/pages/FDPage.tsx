import { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Landmark, AlertTriangle, Clock, CheckCircle, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, isMatured, isMaturityThisMonth, timeUntilDate } from '../utils/helpers';
import type { FD } from '../types';
import Modal from '../components/common/Modal';
import FDForm from '../components/FD/FDForm';
import { ALL_MEMBERS_ID } from '../components/Layout/Header';

type StatusFilter = 'all' | 'active' | 'matured' | 'this-month';
type SortField = 'bankName' | 'amountInvested' | 'maturityAmount' | 'maturityDate' | 'rateOfInterest';
type SortDir = 'asc' | 'desc';

function maturityProgress(dateOfInvestment: string, maturityDate: string): number {
  const start = new Date(dateOfInvestment).getTime();
  const end = new Date(maturityDate).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
}

export default function FDPage() {
  const { data, dispatch, activeMemberId } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FD | null>(null);

  const [search, setSearch] = useState('');
  const [bankFilter, setBankFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('maturityDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const isAll = activeMemberId === ALL_MEMBERS_ID;
  const member = data.members.find(m => m.id === activeMemberId);
  const fds = data.fds.filter(f => isAll ? true : f.memberId === activeMemberId);

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

  const groupedFDs = useMemo(() => {
    const bankOrder = Array.from(new Set(filtered.map(f => f.bankName))).sort();
    return bankOrder.map(bankName => {
      const bankFDs = filtered.filter(f => f.bankName === bankName);
      const totalInvested = bankFDs.reduce((s, f) => s + f.amountInvested, 0);
      const totalMaturity = bankFDs.reduce((s, f) => s + f.maturityAmount, 0);
      const hasUrgent = bankFDs.some(f => isMaturityThisMonth(f.maturityDate));
      return { bankName, fds: bankFDs, totalInvested, totalMaturity, hasUrgent };
    });
  }, [filtered]);

  const handleSave = (fds: FD[]) => {
    if (editing) {
      dispatch({ type: 'UPDATE_FD', payload: fds[0] });
    } else {
      fds.forEach(fd => dispatch({ type: 'ADD_FD', payload: fd }));
    }
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
    <span className={`ml-1 text-xs ${sortField === field ? 'text-accent' : 'text-faint'}`}>
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
          <h2 className="text-2xl font-bold text-content">Fixed Deposits</h2>
          <p className="text-muted text-sm mt-1">
            {isAll ? 'All Family' : member?.name} — {filtered.length} of {fds.length} FD{fds.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Add FD</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Invested', value: formatCurrency(totalInvested), color: 'text-blue-400' },
          { label: 'Total at Maturity', value: formatCurrency(totalMaturity), color: 'text-success' },
          { label: 'Total Gain', value: formatCurrency(totalMaturity - totalInvested), color: 'text-warn' },
          { label: 'Maturing This Month', value: String(maturingThisMonth.length), color: maturingThisMonth.length > 0 ? 'text-danger' : 'text-muted' },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-edge rounded-xl p-4">
            <p className="text-muted text-xs font-medium">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Maturing this month alert */}
      {maturingThisMonth.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-warn flex-shrink-0" />
          <p className="text-warn text-sm">
            <span className="font-semibold">{maturingThisMonth.length} FD{maturingThisMonth.length > 1 ? 's' : ''} maturing this month:</span>{' '}
            {maturingThisMonth.map(f => `${f.bankName} (${formatCurrency(f.maturityAmount)})`).join(' · ')}
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface border border-edge rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-40">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="w-full bg-surface2 border border-edge rounded-lg pl-8 pr-3 py-2 text-content text-sm outline-none focus:border-indigo-500 transition-colors placeholder-faint"
              placeholder="Search by bank, account no…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-content">
                <X size={14} />
              </button>
            )}
          </div>
          <select
            className="bg-surface2 border border-edge rounded-lg px-3 py-2 text-sm text-content outline-none focus:border-indigo-500 transition-colors"
            value={bankFilter}
            onChange={e => setBankFilter(e.target.value)}
          >
            <option value="all">All Banks</option>
            {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div className="flex items-center gap-1 bg-surface2 border border-edge rounded-lg p-1">
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
                  statusFilter === opt.value ? 'bg-indigo-600 text-white' : 'text-muted hover:text-content'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setBankFilter('all'); setStatusFilter('all'); }}
              className="text-xs text-faint hover:text-content flex items-center gap-1 transition-colors"
            >
              <X size={12} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Grouped bank cards */}
      {fds.length === 0 ? (
        <div className="text-center py-16 text-faint">
          <Landmark size={40} className="mx-auto mb-3 opacity-30" />
          <p>No FDs yet. Add your first Fixed Deposit.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-faint">
          <Search size={32} className="mx-auto mb-3 opacity-30" />
          <p>No FDs match your filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedFDs.map(group => {
            const bankGainPct = group.totalInvested > 0
              ? ((group.totalMaturity - group.totalInvested) / group.totalInvested) * 100
              : 0;
            return (
              <div
                key={group.bankName}
                className={`rounded-xl overflow-hidden border ${group.hasUrgent ? 'border-amber-500/40' : 'border-edge'}`}
              >
                {/* Bank header */}
                <div className={`flex items-center justify-between px-4 py-3 border-b ${group.hasUrgent ? 'bg-amber-500/10 border-amber-500/20' : 'bg-indigo-600/10 border-edge'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${group.hasUrgent ? 'bg-amber-500/20' : 'bg-indigo-500/20'}`}>
                      <Landmark size={14} className={group.hasUrgent ? 'text-warn' : 'text-accent'} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-content font-semibold">{group.bankName}</span>
                      {group.hasUrgent && (
                        <span className="ml-2 text-warn text-xs">⚠ Maturing this month</span>
                      )}
                    </div>
                    <span className="text-faint text-xs flex-shrink-0">
                      {group.fds.length} FD{group.fds.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs flex-shrink-0">
                    <div className="text-right hidden md:block">
                      <p className="text-faint">Invested</p>
                      <p className="text-content font-semibold">{formatCurrency(group.totalInvested)}</p>
                    </div>
                    <div className="text-right hidden md:block">
                      <p className="text-faint">At Maturity</p>
                      <p className="text-success font-semibold">{formatCurrency(group.totalMaturity)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-faint">Gain</p>
                      <p className="text-warn font-semibold">
                        {formatCurrency(group.totalMaturity - group.totalInvested)}
                        <span className="text-warn/60 font-normal ml-1">({bankGainPct.toFixed(1)}%)</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Inner FD table */}
                <div className="overflow-x-auto bg-surface">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-edge bg-surface">
                        {isAll && <th className="text-left px-4 py-2 text-faint text-xs font-medium">Member</th>}
                        <th className="text-left px-4 py-2 text-faint text-xs font-medium">Account No.</th>
                        <th className="text-left px-4 py-2">
                          <button onClick={() => toggleSort('rateOfInterest')} className="text-faint text-xs font-medium hover:text-muted flex items-center">
                            Rate <SortIcon field="rateOfInterest" />
                          </button>
                        </th>
                        <th className="text-left px-4 py-2">
                          <button onClick={() => toggleSort('amountInvested')} className="text-faint text-xs font-medium hover:text-muted flex items-center">
                            Invested <SortIcon field="amountInvested" />
                          </button>
                        </th>
                        <th className="text-left px-4 py-2">
                          <button onClick={() => toggleSort('maturityAmount')} className="text-faint text-xs font-medium hover:text-muted flex items-center">
                            Maturity Amt <SortIcon field="maturityAmount" />
                          </button>
                        </th>
                        <th className="text-left px-4 py-2 text-faint text-xs font-medium hidden sm:table-cell">Gain</th>
                        <th className="text-left px-4 py-2 text-faint text-xs font-medium hidden lg:table-cell">Inv. Date</th>
                        <th className="text-left px-4 py-2">
                          <button onClick={() => toggleSort('maturityDate')} className="text-faint text-xs font-medium hover:text-muted flex items-center">
                            Mat. Date <SortIcon field="maturityDate" />
                          </button>
                        </th>
                        <th className="text-left px-4 py-2 text-faint text-xs font-medium">Status</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {group.fds.map((fd, idx) => {
                        const matured = isMatured(fd.maturityDate);
                        const thisMonth = isMaturityThisMonth(fd.maturityDate);
                        const gain = fd.maturityAmount - fd.amountInvested;
                        const gainPct = fd.amountInvested > 0 ? (gain / fd.amountInvested) * 100 : 0;
                        const fdMember = isAll ? data.members.find(m => m.id === fd.memberId) : null;
                        const progress = maturityProgress(fd.dateOfInvestment, fd.maturityDate);

                        const rowBg = matured
                          ? 'bg-emerald-900/10'
                          : thisMonth
                          ? 'bg-amber-900/10'
                          : idx % 2 !== 0 ? 'bg-surface' : '';

                        return (
                          <tr
                            key={fd.id}
                            className={`border-b border-edge hover:bg-surface2 transition-colors ${rowBg}`}
                          >
                            {isAll && (
                              <td className="px-4 py-3 text-accent text-xs whitespace-nowrap">
                                {fdMember?.name ?? '—'}
                              </td>
                            )}
                            <td className="px-4 py-3 whitespace-nowrap">
                              <p className="text-muted font-mono text-xs">{fd.accountNumber}</p>
                              {fd.isJoint && (
                                <span className="inline-flex items-center gap-1 text-xs bg-violet-500/10 text-violet-400 border border-violet-500/20 px-1.5 py-0.5 rounded-full mt-1 font-sans">
                                  Joint{fd.jointHolderName ? `: ${fd.jointHolderName}` : ''}
                                </span>
                              )}
                              {fd.nominee && (
                                <p className="text-faint text-xs mt-0.5">Nominee: {fd.nominee}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="text-blue-400 font-semibold">{fd.rateOfInterest}%</span>
                              <span className="text-faint text-xs"> p.a.</span>
                            </td>
                            <td className="px-4 py-3 text-content whitespace-nowrap">
                              {formatCurrency(fd.amountInvested)}
                            </td>
                            <td className="px-4 py-3 text-success font-semibold whitespace-nowrap">
                              {formatCurrency(fd.maturityAmount)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                              <span className="text-warn font-semibold">{formatCurrency(gain)}</span>
                              <span className="text-faint text-xs ml-1">(+{gainPct.toFixed(1)}%)</span>
                            </td>
                            <td className="px-4 py-3 text-muted text-xs whitespace-nowrap hidden lg:table-cell">
                              {formatDate(fd.dateOfInvestment)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-muted text-xs whitespace-nowrap">{formatDate(fd.maturityDate)}</div>
                              <div className="mt-1.5 h-1 bg-surface3 rounded-full w-16 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${matured ? 'bg-emerald-500' : thisMonth ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {matured ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-success border border-emerald-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                                  <CheckCircle size={10} /> Matured
                                </span>
                              ) : thisMonth ? (
                                <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-warn border border-amber-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                                  <AlertTriangle size={10} /> This Month
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                                  <Clock size={10} /> {timeUntilDate(fd.maturityDate)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <button
                                  onClick={() => { setEditing(fd); setShowForm(true); }}
                                  className="p-1.5 text-faint hover:text-accent hover:bg-surface3 rounded-lg transition-colors"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDelete(fd.id)}
                                  className="p-1.5 text-faint hover:text-danger hover:bg-surface3 rounded-lg transition-colors"
                                >
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
              </div>
            );
          })}

          {/* Grand total — only when multiple banks */}
          {groupedFDs.length > 1 && (
            <div className="bg-surface border border-edge rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted text-xs font-semibold uppercase tracking-wide">
                Grand Total — {filtered.length} FD{filtered.length !== 1 ? 's' : ''} across {groupedFDs.length} banks
              </span>
              <div className="flex items-center gap-6 text-xs">
                <div className="text-right">
                  <p className="text-faint">Invested</p>
                  <p className="text-content font-bold text-sm">{formatCurrency(totalInvested)}</p>
                </div>
                <div className="text-right">
                  <p className="text-faint">At Maturity</p>
                  <p className="text-success font-bold text-sm">{formatCurrency(totalMaturity)}</p>
                </div>
                <div className="text-right">
                  <p className="text-faint">Gain</p>
                  <p className="text-warn font-bold text-sm">{formatCurrency(totalMaturity - totalInvested)}</p>
                </div>
              </div>
            </div>
          )}
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
            members={data.members}
            existingFDs={data.fds}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

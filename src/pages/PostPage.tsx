import { useState } from 'react';
import { Plus, Edit2, Trash2, Package } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, isMatured, isMaturityThisMonth, timeUntilDate } from '../utils/helpers';
import { SCHEME_INFO, SCHEME_COLORS, postTotalInvested } from '../utils/postUtils';
import type { PostInvestment, PostScheme } from '../types';
import Modal from '../components/common/Modal';
import PostForm from '../components/Post/PostForm';
import { ALL_MEMBERS_ID } from '../components/Layout/Header';

const ALL_SCHEMES: PostScheme[] = ['NSC', 'KVP', 'MIS', 'TD', 'SCSS', 'RD', 'SSY'];

export default function PostPage() {
  const { data, dispatch, activeMemberId } = useApp();
  const [schemeFilter, setSchemeFilter] = useState<PostScheme | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PostInvestment | null>(null);

  const isAll = activeMemberId === ALL_MEMBERS_ID;
  const investments = (data.postInvestments ?? []).filter(p => isAll ? true : p.memberId === activeMemberId);
  const filtered = schemeFilter === 'all' ? investments : investments.filter(p => p.scheme === schemeFilter);

  const totalInvested = investments.reduce((s, p) => s + postTotalInvested(p), 0);
  const totalAtMaturity = investments.reduce((s, p) => s + p.maturityAmount, 0);
  const totalGain = totalAtMaturity - totalInvested;
  const activeCount = investments.filter(p => !isMatured(p.maturityDate)).length;

  const handleSave = (inv: PostInvestment) => {
    dispatch({ type: editing ? 'UPDATE_POST' : 'ADD_POST', payload: inv });
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this investment?')) {
      dispatch({ type: 'DELETE_POST', payload: id });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-content">Post Office Investments</h2>
          <p className="text-muted text-sm mt-1">
            {isAll ? 'All Family' : data.members.find(m => m.id === activeMemberId)?.name} — {filtered.length} of {investments.length} investment{investments.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Add Investment</span>
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Invested',   value: formatCurrency(totalInvested),   color: 'text-blue-400' },
          { label: 'Total at Maturity',value: formatCurrency(totalAtMaturity),  color: 'text-success' },
          { label: 'Total Gain',       value: formatCurrency(totalGain),        color: 'text-warn' },
          { label: 'Active Holdings',  value: String(activeCount),              color: 'text-accent' },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-edge rounded-2xl shadow-card p-4">
            <p className="text-muted text-xs font-medium">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Scheme filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSchemeFilter('all')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
            schemeFilter === 'all'
              ? 'bg-indigo-600/20 text-accent border-indigo-500/50'
              : 'bg-surface text-muted border-edge hover:text-content'
          }`}
        >
          All ({investments.length})
        </button>
        {ALL_SCHEMES.map(scheme => {
          const count = investments.filter(p => p.scheme === scheme).length;
          return (
            <button
              key={scheme}
              onClick={() => setSchemeFilter(scheme)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${
                schemeFilter === scheme
                  ? 'bg-indigo-600/20 text-accent border-indigo-500/50'
                  : 'bg-surface text-muted border-edge hover:text-content'
              }`}
            >
              {scheme} ({count})
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {investments.length === 0 ? (
        <div className="text-center py-16 text-faint">
          <Package size={40} className="mx-auto mb-3 opacity-30" />
          <p>No post office investments yet.</p>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="mt-4 text-accent hover:text-accent text-sm transition-colors"
          >
            Add your first investment →
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-faint">
          <Package size={32} className="mx-auto mb-3 opacity-30" />
          <p>No {schemeFilter} investments found.</p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map(p => {
              const matured = isMatured(p.maturityDate);
              const thisMonth = isMaturityThisMonth(p.maturityDate);
              const invested = postTotalInvested(p);
              const gain = p.maturityAmount - invested;
              const member = isAll ? data.members.find(m => m.id === p.memberId) : null;
              return (
                <div key={p.id} className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${SCHEME_COLORS[p.scheme]}`}>
                          {p.scheme}
                        </span>
                        {p.accountNumber && (
                          <span className="text-faint text-xs font-mono">{p.accountNumber}</span>
                        )}
                      </div>
                      <p className="text-muted text-xs">{SCHEME_INFO[p.scheme].label}</p>
                      {member && <p className="text-accent text-xs mt-1">{member.name}</p>}
                    </div>
                    <div className="text-right">
                      {matured ? (
                        <span className="inline-flex items-center text-xs bg-emerald-500/10 text-success border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          Matured
                        </span>
                      ) : thisMonth ? (
                        <span className="inline-flex items-center text-xs bg-amber-500/10 text-warn border border-amber-500/20 px-2 py-0.5 rounded-full">
                          This Month
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                          {timeUntilDate(p.maturityDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-faint">{p.scheme === 'RD' ? 'Monthly Deposit' : 'Principal'}</p>
                      <p className="text-content font-semibold">{formatCurrency(p.scheme === 'RD' ? p.monthlyDeposit : p.principal)}</p>
                    </div>
                    <div>
                      <p className="text-faint">Rate</p>
                      <p className="text-blue-400 font-semibold">{p.interestRate}%</p>
                    </div>
                    <div>
                      <p className="text-faint">Start → Maturity</p>
                      <p className="text-muted">{formatDate(p.startDate)} → {formatDate(p.maturityDate)}</p>
                    </div>
                    <div>
                      <p className="text-faint">Maturity Value</p>
                      <p className="text-success font-bold">{formatCurrency(p.maturityAmount)}</p>
                    </div>
                    <div>
                      <p className="text-faint">Gain</p>
                      <p className={gain >= 0 ? 'text-warn font-semibold' : 'text-danger font-semibold'}>{formatCurrency(gain)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setEditing(p); setShowForm(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-surface3 hover:bg-surface3 text-muted rounded-lg text-xs transition-colors"
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-surface3 hover:bg-red-900/40 text-muted hover:text-danger rounded-lg text-xs transition-colors"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block bg-surface border border-edge rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge bg-surface">
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Scheme</th>
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Account No</th>
                    {isAll && <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Member</th>}
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Principal / Deposit</th>
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Rate</th>
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Start Date</th>
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Maturity Date</th>
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Maturity Value</th>
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Gain</th>
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, idx) => {
                    const matured = isMatured(p.maturityDate);
                    const thisMonth = isMaturityThisMonth(p.maturityDate);
                    const invested = postTotalInvested(p);
                    const gain = p.maturityAmount - invested;
                    const member = isAll ? data.members.find(m => m.id === p.memberId) : null;
                    return (
                      <tr
                        key={p.id}
                        className={`border-b border-edge hover:bg-surface2 transition-colors ${idx % 2 === 0 ? '' : 'bg-surface'}`}
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${SCHEME_COLORS[p.scheme]}`}>
                            {p.scheme}
                          </span>
                          <p className="text-faint text-xs mt-1">{SCHEME_INFO[p.scheme].label}</p>
                        </td>
                        <td className="px-4 py-3 text-muted font-mono text-xs">{p.accountNumber || '—'}</td>
                        {isAll && <td className="px-4 py-3 text-accent text-xs">{member?.name ?? '—'}</td>}
                        <td className="px-4 py-3">
                          <p className="text-content font-semibold">{formatCurrency(p.scheme === 'RD' ? p.monthlyDeposit : p.principal)}</p>
                          {p.scheme === 'RD' && <p className="text-faint text-xs">/month</p>}
                        </td>
                        <td className="px-4 py-3 text-blue-400 font-semibold">{p.interestRate}%</td>
                        <td className="px-4 py-3 text-muted text-xs">{formatDate(p.startDate)}</td>
                        <td className="px-4 py-3 text-muted text-xs">{formatDate(p.maturityDate)}</td>
                        <td className="px-4 py-3 text-success font-semibold">{formatCurrency(p.maturityAmount)}</td>
                        <td className="px-4 py-3 text-warn font-semibold">{formatCurrency(gain)}</td>
                        <td className="px-4 py-3">
                          {matured ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-success border border-emerald-500/20 px-2 py-0.5 rounded-full">
                              Matured
                            </span>
                          ) : thisMonth ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-warn border border-amber-500/20 px-2 py-0.5 rounded-full">
                              This Month
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                              {timeUntilDate(p.maturityDate)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setEditing(p); setShowForm(true); }}
                              className="p-1.5 text-faint hover:text-accent hover:bg-surface3 rounded-lg transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
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
                {filtered.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-edge bg-surface">
                      <td colSpan={isAll ? 4 : 3} className="px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">
                        Totals ({filtered.length})
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-success font-bold text-sm">{formatCurrency(filtered.reduce((s, p) => s + p.maturityAmount, 0))}</td>
                      <td className="px-4 py-3 text-warn font-bold text-sm">{formatCurrency(filtered.reduce((s, p) => s + p.maturityAmount - postTotalInvested(p), 0))}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <Modal
          title={editing ? 'Edit Investment' : 'Add Post Office Investment'}
          onClose={() => { setShowForm(false); setEditing(null); }}
        >
          <PostForm
            initial={editing ?? undefined}
            memberId={activeMemberId}
            members={data.members}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

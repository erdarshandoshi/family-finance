import { useState } from 'react';
import { Plus, Edit2, Trash2, Shield, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate } from '../utils/helpers';
import type { InsurancePolicy } from '../types';
import Modal from '../components/common/Modal';
import InsuranceForm from '../components/Insurance/InsuranceForm';
import { ALL_MEMBERS_ID } from '../components/Layout/Header';

function annualPremium(amount: number, freq: string): number {
  const mult: Record<string, number> = { monthly: 12, quarterly: 4, 'half-yearly': 2, annual: 1 };
  return amount * (mult[freq] ?? 1);
}

function policyStatus(endDate: string): 'expired' | 'expiring' | 'active' {
  if (!endDate) return 'active';
  const end = new Date(endDate);
  const now = new Date();
  if (end < now) return 'expired';
  return (end.getTime() - now.getTime()) < 30 * 86400 * 1000 ? 'expiring' : 'active';
}

const statusBadgeClass: Record<'expired' | 'expiring' | 'active', string> = {
  expired:  'bg-red-500/10 text-danger border-red-500/20',
  expiring: 'bg-amber-500/10 text-warn border-amber-500/20',
  active:   'bg-emerald-500/10 text-success border-emerald-500/20',
};

const statusLabel: Record<'expired' | 'expiring' | 'active', string> = {
  expired:  'Expired',
  expiring: 'Expiring Soon',
  active:   'Active',
};

export default function InsurancePage() {
  const { data, dispatch, activeMemberId } = useApp();
  const [activeTab, setActiveTab] = useState<'mediclaim' | 'term'>('mediclaim');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InsurancePolicy | null>(null);

  const isAll = activeMemberId === ALL_MEMBERS_ID;
  const allPolicies = (data.insurances ?? []).filter(p => isAll ? true : p.memberId === activeMemberId);
  const policies = allPolicies.filter(p => p.type === activeTab);

  const totalCoverage = policies.reduce((s, p) => s + p.sumAssured, 0);
  const totalAnnualPremium = policies.reduce((s, p) => s + annualPremium(p.premiumAmount, p.premiumFrequency), 0);
  const activePolicies = policies.filter(p => policyStatus(p.endDate) === 'active').length;
  const expiringPolicies = policies.filter(p => policyStatus(p.endDate) === 'expiring');

  const handleSave = (policy: InsurancePolicy) => {
    dispatch({ type: editing ? 'UPDATE_INSURANCE' : 'ADD_INSURANCE', payload: policy });
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Delete this policy?')) {
      dispatch({ type: 'DELETE_INSURANCE', payload: id });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-content">Insurance</h2>
          <p className="text-muted text-sm mt-1">
            {isAll ? 'All Family' : data.members.find(m => m.id === activeMemberId)?.name} — {policies.length} {activeTab === 'mediclaim' ? 'Mediclaim' : 'Term'} polic{policies.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> <span className="hidden sm:inline">Add Policy</span>
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 bg-surface border border-edge rounded-xl p-1 w-fit">
        {(['mediclaim', 'term'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-indigo-600 text-white'
                : 'text-muted hover:text-content'
            }`}
          >
            {tab === 'mediclaim' ? 'Mediclaim / Health' : 'Term Plans'}
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Policies',   value: String(policies.length),            color: 'text-blue-400' },
          { label: 'Total Coverage',   value: formatCurrency(totalCoverage),       color: 'text-success' },
          { label: 'Annual Premium',   value: formatCurrency(totalAnnualPremium),  color: 'text-warn' },
          { label: 'Active Policies',  value: String(activePolicies),              color: 'text-accent' },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-edge rounded-2xl shadow-card p-4">
            <p className="text-muted text-xs font-medium">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Expiring soon alert */}
      {expiringPolicies.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle size={16} className="text-warn flex-shrink-0" />
          <p className="text-warn text-sm">
            <span className="font-semibold">{expiringPolicies.length} polic{expiringPolicies.length > 1 ? 'ies' : 'y'} expiring within 30 days:</span>{' '}
            {expiringPolicies.map(p => `${p.insurer} – ${p.planName}`).join(' · ')}
          </p>
        </div>
      )}

      {/* Empty state */}
      {policies.length === 0 ? (
        <div className="text-center py-16 text-faint">
          <Shield size={40} className="mx-auto mb-3 opacity-30" />
          <p>No {activeTab === 'mediclaim' ? 'mediclaim' : 'term'} policies yet.</p>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="mt-4 text-accent hover:text-accent text-sm transition-colors"
          >
            Add your first policy →
          </button>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {policies.map(p => {
              const status = policyStatus(p.endDate);
              const member = isAll ? data.members.find(m => m.id === p.memberId) : null;
              return (
                <div key={p.id} className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-content font-semibold">{p.insurer}</p>
                      <p className="text-muted text-xs mt-0.5">{p.planName}</p>
                      {p.policyNumber && <p className="text-faint text-xs font-mono mt-0.5">{p.policyNumber}</p>}
                      {member && <p className="text-accent text-xs mt-1">{member.name}</p>}
                    </div>
                    <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 flex-shrink-0 ${statusBadgeClass[status]}`}>
                      {statusLabel[status]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-faint">Sum {activeTab === 'mediclaim' ? 'Insured' : 'Assured'}</p>
                      <p className="text-success font-bold text-base">{formatCurrency(p.sumAssured)}</p>
                    </div>
                    <div>
                      <p className="text-faint">Annual Premium</p>
                      <p className="text-warn font-semibold">{formatCurrency(annualPremium(p.premiumAmount, p.premiumFrequency))}</p>
                    </div>
                    <div>
                      <p className="text-faint">{activeTab === 'mediclaim' ? 'Renewal' : 'End Date'}</p>
                      <p className="text-muted">{formatDate(p.endDate)}</p>
                    </div>
                    {activeTab === 'mediclaim' && (
                      <div>
                        <p className="text-faint">Coverage</p>
                        <p className="text-muted capitalize">{p.coverageType}</p>
                      </div>
                    )}
                    {activeTab === 'term' && (
                      <div>
                        <p className="text-faint">Term</p>
                        <p className="text-muted">{p.policyTerm} yrs</p>
                      </div>
                    )}
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
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Policy / Insurer</th>
                    {activeTab === 'mediclaim' && (
                      <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Coverage</th>
                    )}
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">
                      {activeTab === 'mediclaim' ? 'Sum Insured' : 'Sum Assured'}
                    </th>
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Premium</th>
                    {activeTab === 'term' && (
                      <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Start</th>
                    )}
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">
                      {activeTab === 'mediclaim' ? 'Renewal Date' : 'End Date'}
                    </th>
                    {activeTab === 'term' && (
                      <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Yrs Left</th>
                    )}
                    <th className="text-left px-4 py-3 text-muted text-xs font-semibold uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p, idx) => {
                    const status = policyStatus(p.endDate);
                    const member = isAll ? data.members.find(m => m.id === p.memberId) : null;
                    const yrLeft = p.endDate
                      ? Math.max(0, Math.ceil((new Date(p.endDate).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000)))
                      : '—';
                    return (
                      <tr
                        key={p.id}
                        className={`border-b border-edge hover:bg-surface2 transition-colors ${idx % 2 === 0 ? '' : 'bg-surface'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Shield size={14} className="text-accent flex-shrink-0" />
                            <div>
                              <p className="text-content font-semibold">{p.insurer}</p>
                              <p className="text-muted text-xs">{p.planName}</p>
                              {p.policyNumber && <p className="text-faint text-xs font-mono">{p.policyNumber}</p>}
                              {member && <p className="text-accent text-xs">{member.name}</p>}
                            </div>
                          </div>
                        </td>
                        {activeTab === 'mediclaim' && (
                          <td className="px-4 py-3 text-muted text-xs capitalize">{p.coverageType}</td>
                        )}
                        <td className="px-4 py-3 text-success font-semibold">{formatCurrency(p.sumAssured)}</td>
                        <td className="px-4 py-3">
                          <p className="text-warn font-semibold">{formatCurrency(annualPremium(p.premiumAmount, p.premiumFrequency))}/yr</p>
                          <p className="text-faint text-xs">{formatCurrency(p.premiumAmount)} {p.premiumFrequency}</p>
                        </td>
                        {activeTab === 'term' && (
                          <td className="px-4 py-3 text-muted text-xs">{formatDate(p.startDate)}</td>
                        )}
                        <td className="px-4 py-3 text-muted text-xs">{formatDate(p.endDate)}</td>
                        {activeTab === 'term' && (
                          <td className="px-4 py-3 text-muted text-xs">{yrLeft}</td>
                        )}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 ${statusBadgeClass[status]}`}>
                            {statusLabel[status]}
                          </span>
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
              </table>
            </div>
          </div>
        </>
      )}

      {showForm && (
        <Modal
          title={editing ? 'Edit Policy' : 'Add Insurance Policy'}
          onClose={() => { setShowForm(false); setEditing(null); }}
        >
          <InsuranceForm
            initial={editing ?? undefined}
            memberId={activeMemberId}
            members={data.members}
            defaultType={editing?.type ?? activeTab}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditing(null); }}
          />
        </Modal>
      )}
    </div>
  );
}

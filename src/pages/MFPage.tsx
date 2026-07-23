import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, BarChart3, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, List, Repeat, CalendarDays } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, getPLColor } from '../utils/helpers';
import type { MutualFund } from '../types';
import Modal from '../components/common/Modal';
import MFForm from '../components/MF/MFForm';
import MFHoldingEditor from '../components/MF/MFHoldingEditor';
import SIPCalendar from '../components/MF/SIPCalendar';
import SIPTracker from '../components/MF/SIPTracker';
import { ALL_MEMBERS_ID } from '../components/Layout/Header';
import { groupMutualFunds } from '../utils/mfUtils';

export default function MFPage() {
  const { data, dispatch, activeMemberId } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ReturnType<typeof groupMutualFunds>[number] | null>(null);
  const [filter, setFilter] = useState<'all' | 'lump' | 'sip'>('all');
  const [view, setView] = useState<'list' | 'calendar' | 'sip'>('list');
  const navFetchedRef = useRef(false);

  useEffect(() => {
    if (navFetchedRef.current || data.mfs.length === 0) return;
    const today = new Date().toDateString();
    const lastFetch = localStorage.getItem('ff_mf_nav_date');
    const hasZero = data.mfs.some(m => m.currentPrice === 0 && m.schemeCode);
    if (lastFetch === today && !hasZero) { navFetchedRef.current = true; return; }
    navFetchedRef.current = true;
    Promise.all(
      data.mfs.filter(m => m.schemeCode).map(async m => {
        try {
          const res = await fetch(`https://api.mfapi.in/mf/${m.schemeCode}/latest`);
          const json = await res.json() as { data: { nav: string }[]; status: string };
          if (json.status === 'SUCCESS' && json.data?.[0]?.nav) {
            const nav = parseFloat(json.data[0].nav);
            if (nav !== m.currentPrice) dispatch({ type: 'UPDATE_MF', payload: { ...m, currentPrice: nav } });
          }
        } catch { /* ignore */ }
      })
    ).then(() => localStorage.setItem('ff_mf_nav_date', today));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.mfs.length]);

  const isAll = activeMemberId === ALL_MEMBERS_ID;
  const member = data.members.find(m => m.id === activeMemberId);
  const allMfs = data.mfs.filter(m => isAll ? true : m.memberId === activeMemberId);
  const allGroups = groupMutualFunds(allMfs);
  const groups = filter === 'sip' ? allGroups.filter(g => g.isSIP)
    : filter === 'lump' ? allGroups.filter(g => !g.isSIP)
    : allGroups;

  // Sort flat list by scheme name
  const sortedGroups = [...groups].sort((a, b) => (a.schemeName || '').localeCompare(b.schemeName || ''));

  const handleAddSave = (mfs: MutualFund[]) => {
    mfs.forEach(mf => dispatch({ type: 'ADD_MF', payload: mf }));
    setShowForm(false);
  };

  const handleGroupedSave = (finalLots: MutualFund[], originalIds: string[]) => {
    const finalIds = new Set(finalLots.map(l => l.id));
    originalIds.filter(id => !finalIds.has(id)).forEach(id => dispatch({ type: 'DELETE_MF', payload: id }));
    finalLots.forEach(lot => {
      if (originalIds.includes(lot.id)) {
        dispatch({ type: 'UPDATE_MF', payload: lot });
      } else {
        dispatch({ type: 'ADD_MF', payload: lot });
      }
    });
    setEditingGroup(null);
  };

  const handleDeleteGroup = (g: ReturnType<typeof groupMutualFunds>[number]) => {
    const name = g.schemeName || g.companyName || 'this fund';
    const plural = g.lots.length > 1;
    const msg = plural
      ? `This will permanently delete "${name}" and all ${g.lots.length} purchase lots.\n\nType DELETE to confirm:`
      : `This will permanently delete "${name}".\n\nType DELETE to confirm:`;
    const input = window.prompt(msg);
    if (input?.trim().toUpperCase() === 'DELETE') {
      g.lots.forEach(lot => dispatch({ type: 'DELETE_MF', payload: lot.id }));
    }
  };

  const totalInvested = groups.reduce((s, g) => s + g.totalInvested, 0);
  const totalCurrent = groups.reduce((s, g) => s + g.totalCurrent, 0);
  const totalPL = totalCurrent - totalInvested;
  const plPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const sipCount = allGroups.filter(g => g.isSIP).length;
  const lumpCount = allGroups.filter(g => !g.isSIP).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-content">Mutual Funds & SIP</h2>
          <p className="text-muted text-sm mt-1">
            {isAll ? 'All Family' : member?.name} — {sipCount} SIP · {lumpCount} Lump Sum · {allGroups.length} fund{allGroups.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          <Plus size={16} /> <span className="hidden sm:inline">Add Fund</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Invested', value: formatCurrency(totalInvested), color: 'text-blue-400' },
          { label: 'Current Value', value: formatCurrency(totalCurrent), color: 'text-content' },
          { label: 'Total P&L', value: formatCurrency(totalPL), color: totalPL >= 0 ? 'text-success' : 'text-danger' },
          { label: 'Overall Return', value: `${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%`, color: plPct >= 0 ? 'text-success' : 'text-danger' },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-edge rounded-2xl shadow-card p-4">
            <p className="text-muted text-xs font-medium">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Filter + view toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'lump', 'sip'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${filter === f ? 'bg-indigo-600 text-white' : 'bg-surface text-muted hover:text-content'}`}>
              {f === 'all' ? 'All Funds' : f === 'sip' ? 'SIP Only' : 'Lump Sum Only'}
            </button>
          ))}
        </div>
        {/* List / Calendar / SIP Tracker */}
        <div className="flex items-center gap-1 bg-surface2 rounded-xl p-1">
          {([
            ['list', List, 'List'],
            ['calendar', CalendarDays, 'Calendar'],
            ['sip', Repeat, 'SIP Tracker'],
          ] as const).map(([v, Icon, label]) => (
            <button key={v} onClick={() => setView(v)}
              title={label}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === v ? 'bg-indigo-600 text-white' : 'text-muted hover:text-content'}`}>
              <Icon size={15} /> <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'calendar' ? (
        <SIPCalendar mfs={sortedGroups.flatMap(g => g.lots)} />
      ) : view === 'sip' ? (
        /* Always every SIP, regardless of the lump/SIP filter */
        <SIPTracker groups={allGroups} members={data.members} />
      ) : sortedGroups.length === 0 ? (
        <div className="text-center py-16 text-faint">
          <BarChart3 size={40} className="mx-auto mb-3 opacity-30" />
          <p>No funds yet. Add your first Mutual Fund or SIP.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* ── Mobile cards ── */}
          <div className="sm:hidden space-y-3">
            {sortedGroups.map(g => {
              const mfMember = isAll ? data.members.find(m => m.id === g.memberId) : null;
              return (
                <div key={g.key} className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${g.isSIP ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {g.isSIP ? 'SIP' : 'Lump Sum'}
                        </span>
                      </div>
                      <p className="text-content text-sm font-semibold leading-snug">{g.schemeName || '—'}</p>
                      {g.companyName && <p className="text-faint text-xs mt-0.5">{g.companyName}</p>}
                      {mfMember && <p className="text-accent text-xs mt-0.5">{mfMember.name}</p>}
                      {g.guardianMemberId && (
                        <p className="text-faint text-xs mt-0.5">Held by {data.members.find(m => m.id === g.guardianMemberId)?.name ?? '—'} · Guardian</p>
                      )}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setEditingGroup(g)}
                        className="p-2 text-faint hover:text-accent hover:bg-surface3 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteGroup(g)}
                        className="p-2 text-faint hover:text-danger hover:bg-surface3 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-surface2 rounded-xl p-2.5 text-center">
                    {[
                      { label: 'Units', value: g.totalUnits.toFixed(3) },
                      { label: 'Avg NAV', value: `₹${g.avgPurchaseNav.toFixed(2)}` },
                      { label: 'Curr NAV', value: `₹${g.currentNav.toFixed(2)}` },
                      { label: 'Invested', value: formatCurrency(g.totalInvested) },
                      { label: 'Value', value: formatCurrency(g.totalCurrent) },
                      { label: 'Folio', value: g.folioNumber || '—' },
                    ].map(item => (
                      <div key={item.label} className="py-0.5">
                        <p className="text-faint text-xs">{item.label}</p>
                        <p className="text-content text-xs font-medium mt-0.5 truncate">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className={`flex items-center justify-between font-semibold text-sm ${getPLColor(g.pl)}`}>
                    <span>{g.pl >= 0 ? '+' : ''}{formatCurrency(g.pl)}</span>
                    <span className="flex items-center gap-0.5">
                      {g.pl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {Math.abs(g.plPct).toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Desktop flat table ── */}
          <div className="hidden sm:block bg-surface border border-edge rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge bg-surface">
                    {['Scheme', 'Folio', 'Units', 'Avg NAV', 'Curr NAV', 'Invested', 'Value', 'P&L', 'Return', ''].map(h => (
                      <th key={h} className="text-left text-faint text-xs font-medium px-4 py-3 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedGroups.map((g, idx) => {
                    const mfMember = isAll ? data.members.find(m => m.id === g.memberId) : null;
                    return (
                      <tr key={g.key}
                        className={`border-b border-edge hover:bg-surface2 transition-colors ${idx % 2 !== 0 ? 'bg-surface' : ''}`}>
                        <td className="px-4 py-3 max-w-[220px]">
                          <div className="flex items-start gap-2">
                            <div className={`p-1 rounded-lg flex-shrink-0 mt-0.5 ${g.pl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                              {g.pl >= 0
                                ? <TrendingUp size={12} className="text-success" />
                                : <TrendingDown size={12} className="text-danger" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-content text-xs font-medium leading-snug line-clamp-2">{g.schemeName || '—'}</p>
                              {g.companyName && <p className="text-faint text-xs mt-0.5 truncate">{g.companyName}</p>}
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${g.isSIP ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                  {g.isSIP ? 'SIP' : 'Lump'}
                                </span>
                                {mfMember && <span className="text-accent text-xs">{mfMember.name}</span>}
                                {g.guardianMemberId && (
                                  <span className="text-faint text-xs">Held by {data.members.find(m => m.id === g.guardianMemberId)?.name ?? '—'}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">
                          {g.folioNumber || <span className="text-faint">—</span>}
                        </td>
                        <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{g.totalUnits.toFixed(3)}</td>
                        <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">₹{g.avgPurchaseNav.toFixed(2)}</td>
                        <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">₹{g.currentNav.toFixed(2)}</td>
                        <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{formatCurrency(g.totalInvested)}</td>
                        <td className="px-4 py-3 text-content text-xs font-medium whitespace-nowrap">{formatCurrency(g.totalCurrent)}</td>
                        <td className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${getPLColor(g.pl)}`}>
                          {g.pl >= 0 ? '+' : ''}{formatCurrency(g.pl)}
                        </td>
                        <td className={`px-4 py-3 text-xs font-semibold whitespace-nowrap ${getPLColor(g.pl)}`}>
                          <span className="flex items-center gap-0.5">
                            {g.pl >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {Math.abs(g.plPct).toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => setEditingGroup(g)}
                              title="Edit holdings"
                              className="p-1.5 text-faint hover:text-accent hover:bg-surface3 rounded-lg transition-colors">
                              <Edit2 size={13} />
                            </button>
                            <button onClick={() => handleDeleteGroup(g)}
                              className="p-1.5 text-faint hover:text-danger hover:bg-surface3 rounded-lg transition-colors">
                              <Trash2 size={13} />
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

          {/* Grand total */}
          {sortedGroups.length > 1 && (
            <div className="bg-surface border border-edge rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted text-xs font-semibold uppercase tracking-wide">
                Grand Total — {groups.length} fund{groups.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-6 text-xs">
                <div className="text-right">
                  <p className="text-faint">Invested</p>
                  <p className="text-content font-bold text-sm">{formatCurrency(totalInvested)}</p>
                </div>
                <div className="text-right">
                  <p className="text-faint">Current</p>
                  <p className="text-content font-bold text-sm">{formatCurrency(totalCurrent)}</p>
                </div>
                <div className="text-right">
                  <p className="text-faint">P&L</p>
                  <p className={`font-bold text-sm ${totalPL >= 0 ? 'text-success' : 'text-danger'}`}>
                    {totalPL >= 0 ? '+' : ''}{formatCurrency(totalPL)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <Modal title="Add Mutual Fund / SIP" onClose={() => setShowForm(false)}>
          <MFForm
            memberId={activeMemberId}
            members={data.members}
            onSave={handleAddSave}
            onCancel={() => setShowForm(false)}
          />
        </Modal>
      )}

      {editingGroup && (
        <Modal title="Edit Holdings" onClose={() => setEditingGroup(null)}>
          <MFHoldingEditor
            group={editingGroup}
            members={data.members}
            onSave={handleGroupedSave}
            onCancel={() => setEditingGroup(null)}
          />
        </Modal>
      )}
    </div>
  );
}

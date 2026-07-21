import { useState, useEffect, useRef } from 'react';
import {
  Plus, Edit2, Trash2, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, RefreshCw, BarChart2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, getPLColor } from '../utils/helpers';
import type { Stock } from '../types';
import Modal from '../components/common/Modal';
import StockForm from '../components/Stocks/StockForm';
import StockHoldingEditor from '../components/Stocks/StockHoldingEditor';
import { ALL_MEMBERS_ID } from '../components/Layout/Header';
import { groupStocks, groupStocksByDemat, type StockGroup } from '../utils/stockUtils';

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/price?symbol=${encodeURIComponent(symbol)}`);
    const json = await res.json() as { price: number | null };
    return json.price ?? null;
  } catch { return null; }
}

export default function StocksPage() {
  const navigate = useNavigate();
  const { data, dispatch, activeMemberId, setActiveMemberId } = useApp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StockGroup | null>(null);
  const [pickingDematForGroup, setPickingDematForGroup] = useState<StockGroup | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fetchedRef = useRef(false);

  const isAll = activeMemberId === ALL_MEMBERS_ID;
  const member = data.members.find(m => m.id === activeMemberId);
  const [dematFilter, setDematFilter] = useState<string>('all');

  // Darshan and Jainil don't hold any stocks yet, so default this page to Niyati's tab.
  useEffect(() => {
    const niyati = data.members.find(m => m.name.trim().toLowerCase() === 'niyati');
    if (niyati) setActiveMemberId(niyati.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stocks = data.stocks.filter(s => (isAll ? true : s.memberId === activeMemberId));
  const filteredStocks = dematFilter === 'all'
    ? stocks
    : stocks.filter(s => (s.dematAccount ?? 'KIFS') === dematFilter);

  // All-Accounts tab: combined row per stock (totals across both demats)
  // KIFS / Zerodha tab: one row per stock per demat
  const stockGroups = dematFilter === 'all'
    ? groupStocks(filteredStocks)
    : groupStocksByDemat(filteredStocks);

  const refreshPrices = async (allStocks: Stock[]) => {
    const withSymbol = allStocks.filter(s => s.symbol);
    if (withSymbol.length === 0) return;
    setRefreshing(true);
    await Promise.all(
      withSymbol.map(async s => {
        const price = await fetchPrice(s.symbol);
        if (price !== null && price !== s.currentPrice) {
          dispatch({ type: 'UPDATE_STOCK', payload: { ...s, currentPrice: price } });
        }
      }),
    );
    setRefreshing(false);
  };

  useEffect(() => {
    if (fetchedRef.current || data.stocks.length === 0) return;
    const today = new Date().toDateString();
    const lastFetch = localStorage.getItem('ff_prices_date');
    const hasZeroPrice = data.stocks.some(s => s.currentPrice === 0 && s.symbol);
    if (lastFetch === today && !hasZeroPrice) { fetchedRef.current = true; return; }
    fetchedRef.current = true;
    refreshPrices(data.stocks).then(() => localStorage.setItem('ff_prices_date', today));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.stocks.length]);

  const handleAdd = (s: Stock) => {
    dispatch({ type: 'ADD_STOCK', payload: s });
    setShowAddForm(false);
  };

  const handleGroupedSave = (finalLots: Stock[], originalIds: string[]) => {
    const finalIds = new Set(finalLots.map(l => l.id));
    originalIds
      .filter(id => !finalIds.has(id))
      .forEach(id => dispatch({ type: 'DELETE_STOCK', payload: id }));
    finalLots.forEach(lot => {
      if (originalIds.includes(lot.id)) {
        dispatch({ type: 'UPDATE_STOCK', payload: lot });
      } else {
        dispatch({ type: 'ADD_STOCK', payload: lot });
      }
    });
    setEditingGroup(null);
  };

  // Open the lot editor — if the group spans multiple demats (All Accounts view),
  // show a demat picker first; otherwise go straight to the editor.
  const handleEditClick = (g: StockGroup) => {
    if (g.dematAccounts.length > 1) {
      setPickingDematForGroup(g);
    } else {
      // Already a single-demat group (either demat-filtered view or combined with one demat)
      const dematGroup = groupStocksByDemat(g.lots)[0];
      setEditingGroup(dematGroup);
    }
  };

  const handleDematPick = (combinedGroup: StockGroup, demat: string) => {
    const dematLots = combinedGroup.lots.filter(l => (l.dematAccount ?? 'KIFS') === demat);
    const dematGroup = groupStocksByDemat(dematLots)[0];
    setEditingGroup(dematGroup);
    setPickingDematForGroup(null);
  };

  const handleDeleteGroup = (group: StockGroup) => {
    const n = group.lots.length;
    const dematInfo = group.dematAccounts.length > 1
      ? ` across ${group.dematAccounts.join(' & ')}`
      : ` from ${group.dematAccounts[0]}`;
    const msg = n > 1
      ? `Delete ${group.symbol}? This removes all ${n} purchase lots${dematInfo}.`
      : `Delete ${group.symbol}${dematInfo}?`;
    if (window.confirm(msg)) {
      group.lots.forEach(lot => dispatch({ type: 'DELETE_STOCK', payload: lot.id }));
    }
  };

  const totalInvested = filteredStocks.reduce((s, st) => s + st.quantity * st.purchasePrice, 0);
  const totalCurrent = filteredStocks.reduce((s, st) => s + st.quantity * st.currentPrice, 0);
  const totalPL = totalCurrent - totalInvested;
  const plPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;

  // Label shown in the demat badge cell
  const dematBadgeLabel = (g: StockGroup) =>
    g.dematAccounts.length > 1 ? g.dematAccounts.join(' + ') : g.dematAccounts[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-content">Stock Portfolio</h2>
          <p className="text-muted text-sm mt-1">
            {isAll ? 'All Family' : member?.name} — {stockGroups.length} holding{stockGroups.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/stocks/reports')}
            title="View Analytics"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border border-edge text-muted hover:text-content hover:border-edge transition-colors"
          >
            <BarChart2 size={14} />
            <span>Reports</span>
          </button>
          <button
            onClick={() => {
              fetchedRef.current = false;
              refreshPrices(data.stocks).then(() => {
                fetchedRef.current = true;
                localStorage.setItem('ff_prices_date', new Date().toDateString());
              });
            }}
            disabled={refreshing}
            title="Refresh prices from NSE"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium border border-edge text-muted hover:text-content hover:border-edge transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /> <span className="hidden sm:inline">Add Stock</span>
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Invested', value: formatCurrency(totalInvested), color: 'text-blue-400' },
          { label: 'Current Value', value: formatCurrency(totalCurrent), color: 'text-content' },
          { label: 'Total P&L', value: formatCurrency(totalPL), color: totalPL >= 0 ? 'text-success' : 'text-danger' },
          { label: 'Overall Return', value: `${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(2)}%`, color: plPercent >= 0 ? 'text-success' : 'text-danger' },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-edge rounded-2xl shadow-card p-4">
            <p className="text-muted text-xs font-medium">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Demat account filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'KIFS', 'Zerodha'] as const).map(f => {
          const count = f === 'all' ? stocks.length : stocks.filter(s => (s.dematAccount ?? 'KIFS') === f).length;
          return (
            <button key={f} onClick={() => setDematFilter(f)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-sm font-medium transition-colors ${dematFilter === f ? 'bg-indigo-600 text-white' : 'bg-surface text-muted hover:text-content'}`}>
              {f === 'all' ? 'All Accounts' : f}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${dematFilter === f ? 'bg-white/20' : 'bg-surface3'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {stockGroups.length === 0 ? (
        <div className="text-center py-16 text-faint">
          <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
          <p>No stocks yet. Add your first stock holding.</p>
        </div>
      ) : (
        <>
          {/* ── Mobile cards ── */}
          <div className="sm:hidden space-y-3">
            {stockGroups.map(g => (
              <div key={g.key} className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`p-2 rounded-lg flex-shrink-0 ${g.pl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      {g.pl >= 0
                        ? <TrendingUp size={16} className="text-success" />
                        : <TrendingDown size={16} className="text-danger" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-content font-bold leading-tight">{g.symbol}</p>
                      <p className="text-muted text-xs truncate">{g.stockName}</p>
                      {g.lots.length > 1 && (
                        <p className="text-accent text-xs">{g.lots.length} lots</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 ml-2">
                    <button
                      onClick={() => handleEditClick(g)}
                      className="p-2 text-faint hover:text-accent hover:bg-surface3 rounded-lg transition-colors"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(g)}
                      className="p-2 text-faint hover:text-danger hover:bg-surface3 rounded-lg transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-faint text-xs">Profit / Loss</p>
                    <p className={`font-bold text-base ${getPLColor(g.pl)}`}>
                      {g.pl >= 0 ? '+' : ''}{formatCurrency(g.pl)}
                    </p>
                  </div>
                  <div className={`flex items-center gap-0.5 font-bold text-base ${getPLColor(g.pl)}`}>
                    {g.pl >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                    {Math.abs(g.plPct).toFixed(2)}%
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-surface2 rounded-xl p-2.5 text-center">
                  {[
                    { label: 'Qty', value: g.totalQty.toString() },
                    { label: 'Avg Price', value: `₹${g.avgPrice.toFixed(0)}` },
                    { label: 'CMP', value: `₹${g.currentPrice.toLocaleString('en-IN')}` },
                    { label: 'Invested', value: formatCurrency(g.totalInvested) },
                    { label: 'Value', value: formatCurrency(g.totalCurrent) },
                    { label: 'Since', value: g.earliestDate ? formatDate(g.earliestDate) : '—' },
                  ].map(item => (
                    <div key={item.label} className="py-0.5">
                      <p className="text-faint text-xs">{item.label}</p>
                      <p className="text-content text-xs font-medium mt-0.5 truncate">{item.value}</p>
                    </div>
                  ))}
                </div>

                {isAll && (
                  <p className="text-accent text-xs">
                    {data.members.find(m => m.id === g.memberId)?.name}
                  </p>
                )}
                <span className="inline-flex items-center text-xs bg-surface2 text-muted px-2 py-0.5 rounded-full mt-1">
                  {dematBadgeLabel(g)}
                </span>
              </div>
            ))}
          </div>

          {/* ── Desktop table ── */}
          <div className="hidden sm:block bg-surface border border-edge rounded-2xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge">
                    {['Stock', 'Total Qty', 'Avg Buy', 'Curr. Price', 'Invested', 'Curr. Value', 'P&L', 'Return %', ''].map(h => (
                      <th key={h} className="text-left text-muted text-xs font-medium px-4 py-3 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stockGroups.map(g => {
                    const stockMember = isAll ? data.members.find(m => m.id === g.memberId) : null;
                    return (
                      <tr key={g.key} className="border-b border-edge hover:bg-surface2 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${g.pl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                              {g.pl >= 0
                                ? <TrendingUp size={14} className="text-success" />
                                : <TrendingDown size={14} className="text-danger" />}
                            </div>
                            <div>
                              <p className="text-content font-semibold text-sm">{g.symbol}</p>
                              <p className="text-muted text-xs truncate max-w-[140px]">{g.stockName}</p>
                              {g.isin && <p className="text-faint text-xs font-mono">{g.isin}</p>}
                              {stockMember && <p className="text-accent text-xs">{stockMember.name}</p>}
                              <span className="inline-flex items-center text-xs bg-surface2 text-muted px-1.5 py-0.5 rounded-full mt-0.5">
                                {dematBadgeLabel(g)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">{g.totalQty}</td>
                        <td className="px-4 py-3 text-muted">
                          ₹{g.avgPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-muted">₹{g.currentPrice.toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3 text-muted">{formatCurrency(g.totalInvested)}</td>
                        <td className="px-4 py-3 text-content font-medium">{formatCurrency(g.totalCurrent)}</td>
                        <td className={`px-4 py-3 font-semibold ${getPLColor(g.pl)}`}>
                          {g.pl >= 0 ? '+' : ''}{formatCurrency(g.pl)}
                        </td>
                        <td className={`px-4 py-3 font-semibold ${getPLColor(g.pl)}`}>
                          <span className="flex items-center gap-0.5">
                            {g.pl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {Math.abs(g.plPct).toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditClick(g)}
                              className="p-1.5 text-faint hover:text-accent hover:bg-surface3 rounded-lg transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteGroup(g)}
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

      {/* Add stock modal */}
      {showAddForm && (
        <Modal title="Add Stock" onClose={() => setShowAddForm(false)}>
          <StockForm
            memberId={activeMemberId}
            members={data.members}
            onSave={handleAdd}
            onCancel={() => setShowAddForm(false)}
          />
        </Modal>
      )}

      {/* Demat picker — shown when editing from All Accounts and stock has both demats */}
      {pickingDematForGroup && (
        <Modal title={`Edit ${pickingDematForGroup.symbol}`} onClose={() => setPickingDematForGroup(null)}>
          <div className="space-y-4">
            <p className="text-muted text-sm">
              This stock has lots in multiple demat accounts. Choose which account to edit:
            </p>
            <div className="flex gap-3">
              {pickingDematForGroup.dematAccounts.map(demat => (
                <button
                  key={demat}
                  onClick={() => handleDematPick(pickingDematForGroup, demat)}
                  className="flex-1 bg-surface3 hover:bg-indigo-600 border border-edge hover:border-indigo-500 text-white rounded-xl py-4 text-sm font-semibold transition-colors"
                >
                  {demat}
                  <p className="text-xs font-normal text-muted mt-1">
                    {pickingDematForGroup.lots.filter(l => (l.dematAccount ?? 'KIFS') === demat).length} lot(s)
                  </p>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Lot editor */}
      {editingGroup && (
        <Modal title={`Edit ${editingGroup.symbol} — ${editingGroup.dematAccount}`} onClose={() => setEditingGroup(null)}>
          <StockHoldingEditor
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

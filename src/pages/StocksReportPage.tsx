import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ALL_MEMBERS_ID } from '../components/Layout/Header';
import { formatCurrency, formatDate, daysToHumanDuration } from '../utils/helpers';
import { groupStocks } from '../utils/stockUtils';
import { groupMutualFunds } from '../utils/mfUtils';
import StockNewsTab from '../components/Stocks/StockNewsTab';
import StockPerformanceTab from '../components/Stocks/StockPerformanceTab';
import { fetchNews, fetchHistory, NIFTY_SYMBOL, type NewsMap, type HistoryMap } from '../utils/stockHistory';
import { xirrFromLots } from '../utils/finance';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, ReferenceLine,
} from 'recharts';

type ReportTab = 'stocks' | 'mf' | 'news' | 'performance';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
const TT = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' };
const TICK = { fill: '#94a3b8', fontSize: 11 } as const;

export default function StocksReportPage() {
  const navigate = useNavigate();
  const { data, activeMemberId } = useApp();
  const [tab, setTab] = useState<ReportTab>('stocks');

  const isAll = activeMemberId === ALL_MEMBERS_ID;
  const member = data.members.find(m => m.id === activeMemberId);
  const stocks = data.stocks.filter(s => (isAll ? true : s.memberId === activeMemberId));
  const groups = groupStocks(stocks);

  // ── News & history data (lazy-loaded when their tab is first opened) ────────
  const heldStocks = groups
    .filter(g => g.symbol)
    .map(g => ({ symbol: g.symbol, stockName: g.stockName }));
  const symbolsKey = heldStocks.map(s => s.symbol).sort().join(',');

  const [news, setNews] = useState<NewsMap | null>(null);
  const [newsLoading, setNewsLoading] = useState(false);
  const [history, setHistory] = useState<HistoryMap | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Reset cached data when the visible holdings change (e.g. member switch)
  useEffect(() => { setNews(null); setHistory(null); }, [symbolsKey]);

  const loadNews = () => {
    if (!symbolsKey) return;
    setNewsLoading(true);
    fetchNews(heldStocks)
      .then(setNews)
      .catch(() => setNews({}))
      .finally(() => setNewsLoading(false));
  };
  const loadHistory = () => {
    if (!symbolsKey) return;
    setHistoryLoading(true);
    // Include the Nifty 50 index for relative-strength comparison
    fetchHistory([...symbolsKey.split(','), NIFTY_SYMBOL], '3y')
      .then(setHistory)
      .catch(() => setHistory({}))
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    if (tab === 'news' && news === null && !newsLoading) loadNews();
    if (tab === 'performance' && history === null && !historyLoading) loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, symbolsKey]);

  // MF data for analytics tab
  const allMfs = data.mfs.filter(m => isAll ? true : m.memberId === activeMemberId);
  const mfGroups = groupMutualFunds(allMfs);
  const amcMap = new Map<string, { amc: string; totalInvested: number; totalCurrent: number; pl: number }>();
  for (const g of mfGroups) {
    const amc = g.companyName || 'Unknown';
    if (!amcMap.has(amc)) amcMap.set(amc, { amc, totalInvested: 0, totalCurrent: 0, pl: 0 });
    const entry = amcMap.get(amc)!;
    entry.totalInvested += g.totalInvested;
    entry.totalCurrent += g.totalCurrent;
    entry.pl += g.pl;
  }
  const amcGroups = Array.from(amcMap.values()).sort((a, b) => b.totalCurrent - a.totalCurrent);
  const mfTotalInvested = mfGroups.reduce((s, g) => s + g.totalInvested, 0);
  const mfTotalCurrent = mfGroups.reduce((s, g) => s + g.totalCurrent, 0);
  const mfTotalPL = mfTotalCurrent - mfTotalInvested;
  const mfPlPct = mfTotalInvested > 0 ? (mfTotalPL / mfTotalInvested) * 100 : 0;
  const mfXirr = xirrFromLots(allMfs.map(m => ({ date: m.dateOfPurchase, invested: m.quantity * m.purchasePrice })), mfTotalCurrent);
  const mfPieData = mfGroups.map(g => ({ name: g.schemeName || g.companyName, value: g.totalCurrent }));
  const mfAmcBarData = amcGroups.map(a => ({
    name: a.amc.length > 14 ? a.amc.slice(0, 14) + '…' : a.amc,
    pl: a.pl,
    invested: a.totalInvested,
    value: a.totalCurrent,
  }));

  if (stocks.length === 0) {
    return (
      <div className="text-center py-20 text-faint">
        <TrendingUp size={40} className="mx-auto mb-4 opacity-30" />
        <p className="mb-4">No stocks found. Add holdings to see reports.</p>
        <button
          onClick={() => navigate('/stocks')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          Go to Portfolio
        </button>
      </div>
    );
  }

  const totalInvested = groups.reduce((s, g) => s + g.totalInvested, 0);
  const totalCurrent = groups.reduce((s, g) => s + g.totalCurrent, 0);
  const totalPL = totalCurrent - totalInvested;
  const plPct = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0;
  const winners = groups.filter(g => g.pl > 0).length;
  const losers = groups.filter(g => g.pl < 0).length;
  const stockXirr = xirrFromLots(stocks.map(s => ({ date: s.dateOfPurchase, invested: s.quantity * s.purchasePrice })), totalCurrent);

  const sortedByReturn = [...groups].sort((a, b) => b.plPct - a.plPct);
  const best = sortedByReturn[0];
  const worst = sortedByReturn[sortedByReturn.length - 1];
  const showWorst = worst && worst.key !== best?.key;

  // Chart datasets
  const allocationData = groups.map(g => ({ name: g.symbol, value: Math.round(g.totalCurrent) }));

  const plBarData = [...groups]
    .sort((a, b) => b.pl - a.pl)
    .map(g => ({ name: g.symbol.slice(0, 8), pl: Math.round(g.pl), pos: g.pl >= 0 }));

  const returnData = sortedByReturn.map(g => ({
    name: g.symbol.slice(0, 8),
    pct: parseFloat(g.plPct.toFixed(2)),
    pos: g.plPct >= 0,
  }));

  const comparisonData = groups.map(g => ({
    name: g.symbol.slice(0, 6),
    invested: Math.round(g.totalInvested),
    value: Math.round(g.totalCurrent),
  }));

  const chartHeight = Math.max(200, groups.length * 42);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/stocks')}
          className="p-2 text-muted hover:text-content hover:bg-surface rounded-xl transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-content">Analytics & Reports</h2>
          <p className="text-muted text-sm">
            {isAll ? 'All Family' : member?.name}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: 'stocks', label: 'Stocks Analytics' },
          { key: 'mf', label: 'MF Analytics' },
          { key: 'news', label: 'Stock News' },
          { key: 'performance', label: 'Performance & Health' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-surface text-muted hover:text-content'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'news' && (
        <StockNewsTab stocks={heldStocks} news={news} loading={newsLoading} onRefresh={loadNews} />
      )}

      {tab === 'performance' && (
        <StockPerformanceTab groups={groups} history={history} loading={historyLoading} onRefresh={loadHistory} />
      )}

      {tab === 'mf' && (
        <div className="space-y-6">
          {mfGroups.length === 0 ? (
            <div className="text-center py-16 text-faint">
              <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
              <p>No mutual funds found. Add funds to see analytics.</p>
            </div>
          ) : (
            <>
              {/* MF KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Total Invested', value: formatCurrency(mfTotalInvested), color: 'text-blue-400' },
                  { label: 'Current Value', value: formatCurrency(mfTotalCurrent), color: 'text-content' },
                  { label: 'Total P&L', value: (mfTotalPL >= 0 ? '+' : '') + formatCurrency(mfTotalPL), color: mfTotalPL >= 0 ? 'text-success' : 'text-danger' },
                  { label: 'Overall Return', value: `${mfPlPct >= 0 ? '+' : ''}${mfPlPct.toFixed(2)}%`, color: mfPlPct >= 0 ? 'text-success' : 'text-danger' },
                  { label: 'XIRR (p.a.)', value: mfXirr != null ? `${mfXirr >= 0 ? '+' : ''}${mfXirr.toFixed(1)}%` : '—', color: (mfXirr ?? 0) >= 0 ? 'text-success' : 'text-danger' },
                ].map(item => (
                  <div key={item.label} className="bg-surface border border-edge rounded-2xl shadow-card p-4">
                    <p className="text-muted text-xs font-medium">{item.label}</p>
                    <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Portfolio allocation + P&L by AMC */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
                  <h3 className="text-content font-semibold text-sm mb-4">Portfolio Allocation by Fund</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={mfPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                        {mfPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={TT} formatter={(v: unknown) => [formatCurrency(v as number), 'Value']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
                    {mfPieData.slice(0, 8).map((d, i) => (
                      <div key={d.name} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-muted text-xs truncate max-w-[120px]">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
                  <h3 className="text-content font-semibold text-sm mb-4">P&L by AMC (₹)</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={mfAmcBarData} margin={{ left: 4, right: 4 }}>
                      <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
                      <YAxis tick={TICK} axisLine={false} tickLine={false}
                        tickFormatter={v => `₹${(Math.abs(v as number) / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={TT} formatter={(v: unknown) => [formatCurrency(v as number), 'P&L']} />
                      <ReferenceLine y={0} stroke="#475569" />
                      <Bar dataKey="pl" radius={[4, 4, 0, 0]} name="P&L">
                        {mfAmcBarData.map((d, i) => <Cell key={i} fill={d.pl >= 0 ? '#10b981' : '#ef4444'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Invested vs Current by AMC */}
              <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
                <h3 className="text-content font-semibold text-sm mb-1">Invested vs Current Value by AMC</h3>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-indigo-500" /><span className="text-muted text-xs">Invested</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /><span className="text-muted text-xs">Current Value</span></div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={mfAmcBarData} barSize={14} barGap={2}>
                    <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK} axisLine={false} tickLine={false}
                      tickFormatter={v => `₹${((v as number) / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={TT} formatter={(v: unknown) => [formatCurrency(v as number), '']} />
                    <Bar dataKey="invested" name="Invested" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="value" name="Current Value" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Fund-level table */}
              <div className="bg-surface border border-edge rounded-2xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-edge">
                  <h3 className="text-content font-semibold text-sm">Fund Performance Summary</h3>
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden divide-y divide-edge">
                  {[...mfGroups].sort((a, b) => b.plPct - a.plPct).map(g => (
                    <div key={g.key} className="p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-content font-medium text-sm truncate">{g.schemeName || '—'}</p>
                          <p className="text-faint text-xs truncate">{g.companyName || '—'}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${g.isSIP ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                          {g.isSIP ? 'SIP' : 'Lump'}
                        </span>
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-faint text-xs">Current Value</p>
                          <p className="text-content text-base font-bold">{formatCurrency(g.totalCurrent)}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${g.pl >= 0 ? 'text-success' : 'text-danger'}`}>
                            {g.pl >= 0 ? '+' : ''}{formatCurrency(g.pl)}
                          </p>
                          <p className={`text-xs font-medium ${g.plPct >= 0 ? 'text-success' : 'text-danger'}`}>
                            {g.plPct >= 0 ? '+' : ''}{g.plPct.toFixed(2)}%
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 bg-surface2 rounded-lg p-2.5 text-center">
                        <div><p className="text-faint text-xs">Units</p><p className="text-muted text-xs font-medium mt-0.5">{g.totalUnits.toFixed(3)}</p></div>
                        <div><p className="text-faint text-xs">Avg NAV</p><p className="text-muted text-xs font-medium mt-0.5">₹{g.avgPurchaseNav.toFixed(2)}</p></div>
                        <div><p className="text-faint text-xs">Curr NAV</p><p className="text-muted text-xs font-medium mt-0.5">₹{g.currentNav.toFixed(2)}</p></div>
                      </div>
                      <p className="text-faint text-xs">Invested {formatCurrency(g.totalInvested)}</p>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="overflow-x-auto hidden sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-edge">
                        {['Fund', 'AMC', 'Units', 'Avg NAV', 'Curr NAV', 'Invested', 'Value', 'P&L', 'Return'].map(h => (
                          <th key={h} className="text-left text-muted text-xs font-medium px-4 py-3 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...mfGroups].sort((a, b) => b.plPct - a.plPct).map(g => (
                        <tr key={g.key} className="border-b border-edge hover:bg-surface2 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-content font-medium text-xs truncate max-w-[160px]">{g.schemeName || '—'}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${g.isSIP ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                              {g.isSIP ? 'SIP' : 'Lump'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{g.companyName || '—'}</td>
                          <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{g.totalUnits.toFixed(3)}</td>
                          <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">₹{g.avgPurchaseNav.toFixed(2)}</td>
                          <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">₹{g.currentNav.toFixed(2)}</td>
                          <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{formatCurrency(g.totalInvested)}</td>
                          <td className="px-4 py-3 text-content font-medium text-xs whitespace-nowrap">{formatCurrency(g.totalCurrent)}</td>
                          <td className={`px-4 py-3 font-semibold text-xs whitespace-nowrap ${g.pl >= 0 ? 'text-success' : 'text-danger'}`}>
                            {g.pl >= 0 ? '+' : ''}{formatCurrency(g.pl)}
                          </td>
                          <td className={`px-4 py-3 font-semibold text-xs whitespace-nowrap ${g.plPct >= 0 ? 'text-success' : 'text-danger'}`}>
                            {g.plPct >= 0 ? '+' : ''}{g.plPct.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'stocks' && (
        <>{/* ── Stocks Analytics ── */}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'Portfolio Value', value: formatCurrency(totalCurrent), color: 'text-content' },
          { label: 'Total P&L', value: (totalPL >= 0 ? '+' : '') + formatCurrency(totalPL), color: totalPL >= 0 ? 'text-success' : 'text-danger' },
          { label: 'Overall Return', value: `${plPct >= 0 ? '+' : ''}${plPct.toFixed(2)}%`, color: plPct >= 0 ? 'text-success' : 'text-danger' },
          { label: 'XIRR (p.a.)', value: stockXirr != null ? `${stockXirr >= 0 ? '+' : ''}${stockXirr.toFixed(1)}%` : '—', color: (stockXirr ?? 0) >= 0 ? 'text-success' : 'text-danger' },
          { label: 'Winners / Losers', value: `${winners}W  ·  ${losers}L`, color: winners >= losers ? 'text-success' : 'text-danger' },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-edge rounded-2xl shadow-card p-4">
            <p className="text-muted text-xs font-medium">{item.label}</p>
            <p className={`text-xl font-bold mt-1 ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Best / Worst performer spotlight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {best && (
          <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-success text-xs font-medium uppercase tracking-wide">Best Performer</p>
              <p className="text-content font-bold text-lg mt-0.5">{best.symbol}</p>
              <p className="text-muted text-xs">{best.stockName}</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1 text-success font-bold text-lg justify-end">
                <TrendingUp size={18} />
                {best.plPct >= 0 ? '+' : ''}{best.plPct.toFixed(2)}%
              </div>
              <p className="text-success/70 text-sm">{best.pl >= 0 ? '+' : ''}{formatCurrency(best.pl)}</p>
            </div>
          </div>
        )}
        {showWorst && (
          <div className={`${worst.pl < 0 ? 'bg-red-900/20 border-red-700/30' : 'bg-surface border-edge'} border rounded-2xl shadow-card p-4 flex items-center justify-between`}>
            <div>
              <p className={`text-xs font-medium uppercase tracking-wide ${worst.pl < 0 ? 'text-danger' : 'text-muted'}`}>
                {worst.pl < 0 ? 'Needs Attention' : 'Lowest Return'}
              </p>
              <p className="text-content font-bold text-lg mt-0.5">{worst.symbol}</p>
              <p className="text-muted text-xs">{worst.stockName}</p>
            </div>
            <div className="text-right">
              <div className={`flex items-center gap-1 font-bold text-lg justify-end ${worst.plPct >= 0 ? 'text-success' : 'text-danger'}`}>
                {worst.plPct >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                {worst.plPct >= 0 ? '+' : ''}{worst.plPct.toFixed(2)}%
              </div>
              <p className={`text-sm ${worst.pl >= 0 ? 'text-success/70' : 'text-danger/70'}`}>
                {worst.pl >= 0 ? '+' : ''}{formatCurrency(worst.pl)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Allocation donut + Absolute P&L bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
          <h3 className="text-content font-semibold text-sm mb-4">Portfolio Allocation by Value</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={allocationData}
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                {allocationData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TT}
                formatter={(v: unknown) => [formatCurrency(v as number), 'Value']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
            {allocationData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                <span className="text-muted text-xs">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
          <h3 className="text-content font-semibold text-sm mb-4">Absolute P&L by Stock (₹)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={plBarData} margin={{ left: 4, right: 4 }}>
              <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
              <YAxis
                tick={TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `₹${(Math.abs(v as number) / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={TT}
                formatter={(v: unknown) => [formatCurrency(v as number), 'P&L']}
              />
              <ReferenceLine y={0} stroke="#475569" />
              <Bar dataKey="pl" radius={[4, 4, 0, 0]} name="P&L">
                {plBarData.map((d, i) => (
                  <Cell key={i} fill={d.pos ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Return % ranking — horizontal bar */}
      <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
        <h3 className="text-content font-semibold text-sm mb-1">Return % Ranking</h3>
        <p className="text-faint text-xs mb-4">Best to worst performers by percentage gain/loss</p>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={returnData} layout="vertical" margin={{ left: 0, right: 24 }}>
            <XAxis
              type="number"
              tick={TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${(v as number).toFixed(0)}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={TICK}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              contentStyle={TT}
              formatter={(v: unknown) => [`${(v as number).toFixed(2)}%`, 'Return']}
            />
            <ReferenceLine x={0} stroke="#475569" />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]} name="Return %">
              {returnData.map((d, i) => (
                <Cell key={i} fill={d.pos ? '#10b981' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Invested vs Current Value comparison */}
      <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
        <h3 className="text-content font-semibold text-sm mb-1">Invested vs Current Value</h3>
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-indigo-500" />
            <span className="text-muted text-xs">Invested</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span className="text-muted text-xs">Current Value</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={comparisonData} barSize={14} barGap={2}>
            <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} />
            <YAxis
              tick={TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `₹${((v as number) / 1000).toFixed(0)}k`}
            />
            <Tooltip
              contentStyle={TT}
              formatter={(v: unknown) => [formatCurrency(v as number), '']}
            />
            <Bar dataKey="invested" name="Invested" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="value" name="Current Value" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Holding period & annualized return table */}
      <div className="bg-surface border border-edge rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-edge">
          <h3 className="text-content font-semibold text-sm">Holding Period & Annualized Return</h3>
          <p className="text-faint text-xs mt-0.5">
            Annualized return normalizes performance to a per-year basis — useful for comparing stocks held for different durations
          </p>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-edge">
          {[...groups].sort((a, b) => b.annualizedReturn - a.annualizedReturn).map(g => (
            <div key={g.key} className="p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-content font-semibold text-sm">{g.symbol}</p>
                  <p className="text-faint text-xs truncate">{g.stockName}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-semibold ${g.pl >= 0 ? 'text-success' : 'text-danger'}`}>
                    {g.pl >= 0 ? '+' : ''}{formatCurrency(g.pl)}
                  </p>
                  <p className={`text-xs ${g.plPct >= 0 ? 'text-success' : 'text-danger'}`}>
                    {g.plPct >= 0 ? '+' : ''}{g.plPct.toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 bg-surface2 rounded-lg p-2.5 text-center">
                <div><p className="text-faint text-xs">First Buy</p><p className="text-muted text-xs font-medium mt-0.5">{g.earliestDate ? formatDate(g.earliestDate) : '—'}</p></div>
                <div><p className="text-faint text-xs">Held For</p><p className="text-muted text-xs font-medium mt-0.5">{daysToHumanDuration(g.daysHeld)}</p></div>
                <div><p className="text-faint text-xs">Ann. p.a.</p><p className={`text-xs font-semibold mt-0.5 ${g.annualizedReturn >= 0 ? 'text-success' : 'text-danger'}`}>{g.annualizedReturn >= 0 ? '+' : ''}{g.annualizedReturn.toFixed(1)}%</p></div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="overflow-x-auto hidden sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge">
                {['Stock', 'First Buy', 'Held For', 'Abs Return', 'Ann. Return (p.a.)', 'P&L'].map(h => (
                  <th key={h} className="text-left text-muted text-xs font-medium px-4 py-3 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...groups].sort((a, b) => b.annualizedReturn - a.annualizedReturn).map(g => (
                <tr key={g.key} className="border-b border-edge hover:bg-surface2 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-content font-semibold">{g.symbol}</p>
                    <p className="text-faint text-xs truncate max-w-[160px]">{g.stockName}</p>
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {g.earliestDate ? formatDate(g.earliestDate) : '—'}
                  </td>
                  <td className="px-4 py-3 text-muted whitespace-nowrap">{daysToHumanDuration(g.daysHeld)}</td>
                  <td className={`px-4 py-3 font-medium ${g.plPct >= 0 ? 'text-success' : 'text-danger'}`}>
                    {g.plPct >= 0 ? '+' : ''}{g.plPct.toFixed(2)}%
                  </td>
                  <td className={`px-4 py-3 font-semibold ${g.annualizedReturn >= 0 ? 'text-success' : 'text-danger'}`}>
                    {g.annualizedReturn >= 0 ? '+' : ''}{g.annualizedReturn.toFixed(1)}%
                  </td>
                  <td className={`px-4 py-3 font-medium ${g.pl >= 0 ? 'text-success' : 'text-danger'}`}>
                    {g.pl >= 0 ? '+' : ''}{formatCurrency(g.pl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

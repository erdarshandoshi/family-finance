import { useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Info } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import type { StockGroup } from '../../utils/stockUtils';
import {
  buildPortfolioSeries, buildHealth, financialYears, NIFTY_SYMBOL,
  type HistoryMap, type StockHealth, type SignalState,
} from '../../utils/stockHistory';
import { formatCurrency } from '../../utils/helpers';

const TT = { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' };
const TICK = { fill: '#94a3b8', fontSize: 11 } as const;

interface Props {
  groups: StockGroup[];
  history: HistoryMap | null;
  loading: boolean;
  onRefresh: () => void;
}

// ── Date helpers ───────────────────────────────────────────────────────────────
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthsAgo(n: number): string { const d = new Date(); d.setMonth(d.getMonth() - n); return iso(d); }
function ytdStart(): string { return `${new Date().getFullYear()}-01-01`; }
const TODAY = iso(new Date());

function fmtAxisDate(day: string, longRange: boolean): string {
  const d = new Date(day + 'T00:00:00');
  return longRange
    ? d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

// Dot colour per signal state
const STATE_UI: Record<SignalState, { dot: string }> = {
  good: { dot: 'bg-emerald-400' },
  warn: { dot: 'bg-amber-400' },
  bad:  { dot: 'bg-red-400' },
  na:   { dot: 'bg-slate-500' },
};

// Overall band from positive-signal ratio (factual summary, not a recommendation)
function healthBand(h: StockHealth): { label: string; color: string; bg: string } {
  const ratio = h.scored ? h.positives / h.scored : 0;
  if (ratio >= 0.66) return { label: 'Mostly positive', color: 'text-success', bg: 'bg-emerald-500/10 border-emerald-500/30' };
  if (ratio >= 0.4)  return { label: 'Mixed', color: 'text-warn', bg: 'bg-amber-500/10 border-amber-500/30' };
  return { label: 'Mostly weak', color: 'text-danger', bg: 'bg-red-500/10 border-red-500/30' };
}

export default function StockPerformanceTab({ groups, history, loading, onRefresh }: Props) {
  const [start, setStart] = useState(monthsAgo(12));
  const [end, setEnd]     = useState(TODAY);
  const [preset, setPreset] = useState<string>('1Y');

  const series = useMemo(
    () => (history ? buildPortfolioSeries(groups, history) : []),
    [groups, history],
  );

  const health = useMemo(() => {
    if (!history) return [];
    const nifty = history[NIFTY_SYMBOL] ?? [];
    const totalValue = groups.reduce((s, g) => s + g.totalCurrent, 0);
    return groups
      .map(g => buildHealth(g, history[g.symbol] ?? [], nifty, totalValue > 0 ? (g.totalCurrent / totalValue) * 100 : 0))
      .sort((a, b) => (b.positives / (b.scored || 1)) - (a.positives / (a.scored || 1)));
  }, [groups, history]);

  const hasNifty = !!(history && (history[NIFTY_SYMBOL]?.length ?? 0) > 0);

  const ranged = useMemo(
    () => series.filter(p => p.day >= start && p.day <= end),
    [series, start, end],
  );

  const startVal = ranged[0]?.value ?? 0;
  const endVal   = ranged[ranged.length - 1]?.value ?? 0;
  const change   = endVal - startVal;
  const changePct = startVal > 0 ? (change / startVal) * 100 : 0;
  const peak = ranged.length ? Math.max(...ranged.map(p => p.value)) : 0;
  const low  = ranged.length ? Math.min(...ranged.map(p => p.value)) : 0;

  const longRange = ranged.length > 180;
  const chartData = ranged.map(p => ({ ...p, label: fmtAxisDate(p.day, longRange) }));

  const applyPreset = (key: string, s: string) => { setPreset(key); setStart(s); setEnd(TODAY); };
  const fys = financialYears(4);

  if (loading && history === null) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
        <div className="w-9 h-9 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-sm">Loading price history for your holdings…</p>
      </div>
    );
  }

  if (history && series.length === 0) {
    return (
      <div className="text-center py-16 text-faint">
        <Info size={36} className="mx-auto mb-3 opacity-30" />
        <p>Couldn't load price history for your holdings.</p>
        <button onClick={onRefresh} className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Range controls */}
      <div className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex flex-wrap gap-1.5">
            {([
              ['1M', monthsAgo(1)], ['3M', monthsAgo(3)], ['6M', monthsAgo(6)],
              ['1Y', monthsAgo(12)], ['YTD', ytdStart()], ['3Y', monthsAgo(36)],
            ] as [string, string][]).map(([k, s]) => (
              <button key={k} onClick={() => applyPreset(k, s)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                  preset === k ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-surface border-edge text-muted hover:text-content'}`}>
                {k}
              </button>
            ))}
          </div>
          <button onClick={onRefresh} disabled={loading}
            className="flex items-center gap-1.5 text-muted hover:text-content text-xs border border-edge hover:border-edge rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Financial years */}
        <div className="flex flex-wrap gap-1.5">
          {fys.map(fy => (
            <button key={fy.label} onClick={() => { setPreset(fy.label); setStart(fy.start); setEnd(fy.end); }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                preset === fy.label ? 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-surface border-edge text-muted hover:text-content'}`}>
              {fy.label}
            </button>
          ))}
        </div>

        {/* Custom range */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-faint text-xs">Custom:</span>
          <input type="date" value={start} max={end}
            onChange={e => { setStart(e.target.value); setPreset('custom'); }}
            className="bg-surface border border-edge rounded-lg px-2.5 py-1.5 text-content text-xs outline-none focus:border-indigo-500" />
          <span className="text-faint text-xs">to</span>
          <input type="date" value={end} min={start} max={TODAY}
            onChange={e => { setEnd(e.target.value); setPreset('custom'); }}
            className="bg-surface border border-edge rounded-lg px-2.5 py-1.5 text-content text-xs outline-none focus:border-indigo-500" />
        </div>
      </div>

      {/* KPIs for the selected range */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Value at Start', value: formatCurrency(startVal), sub: ranged[0]?.day ?? '—', color: 'text-content' },
          { label: 'Value at End', value: formatCurrency(endVal), sub: ranged[ranged.length - 1]?.day ?? '—', color: 'text-content' },
          {
            label: 'Change', value: `${change >= 0 ? '+' : ''}${formatCurrency(change)}`,
            sub: `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`,
            color: change >= 0 ? 'text-success' : 'text-danger',
          },
          { label: 'Period High / Low', value: formatCurrency(peak), sub: `Low ${formatCurrency(low)}`, color: 'text-content' },
        ].map(item => (
          <div key={item.label} className="bg-surface border border-edge rounded-2xl shadow-card p-4">
            <p className="text-muted text-xs font-medium">{item.label}</p>
            <p className={`text-lg font-bold mt-1 ${item.color}`}>{item.value}</p>
            <p className="text-faint text-xs mt-0.5">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* Portfolio value chart */}
      <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-content font-semibold text-sm">Portfolio Value Over Time</h3>
          <span className={`text-sm font-semibold flex items-center gap-1 ${change >= 0 ? 'text-success' : 'text-danger'}`}>
            {change >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
          </span>
        </div>
        <p className="text-faint text-xs mb-4">
          Mark-to-market value of your <strong>current</strong> holdings, valued at each day's closing price.
        </p>
        {chartData.length === 0 ? (
          <p className="text-center text-faint py-12 text-sm">No data in the selected range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ left: 4, right: 8 }}>
              <defs>
                <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={change >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={change >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false}
                interval="preserveStartEnd" minTickGap={40} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} width={52}
                tickFormatter={v => {
                  const n = v as number;
                  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
                  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
                  return `₹${(n / 1000).toFixed(0)}k`;
                }} />
              <Tooltip contentStyle={TT}
                labelFormatter={(l, p) => (p && p[0] ? (p[0].payload as { day: string }).day : String(l))}
                formatter={(v: unknown) => [formatCurrency(v as number), 'Value']} />
              {startVal > 0 && <ReferenceLine y={startVal} stroke="#475569" strokeDasharray="4 4" />}
              <Area type="monotone" dataKey="value" stroke={change >= 0 ? '#10b981' : '#ef4444'}
                strokeWidth={2} fill="url(#valGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-stock health scorecards */}
      <div>
        <div className="flex items-end justify-between flex-wrap gap-2 mb-3">
          <div>
            <h3 className="text-content font-semibold text-sm">Stock Health Scorecards</h3>
            <p className="text-faint text-xs mt-0.5">
              Each holding scored on 6 objective signals — the standout being <strong>relative strength vs the Nifty 50</strong>.
            </p>
          </div>
          {!hasNifty && (
            <span className="text-warn/80 text-xs">Nifty data unavailable — relative-strength signal hidden</span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {health.map(h => {
            const band = healthBand(h);
            const posInRange = h.metrics.high52 > h.metrics.low52
              ? ((h.metrics.cmp - h.metrics.low52) / (h.metrics.high52 - h.metrics.low52)) * 100 : 50;
            return (
              <div key={h.symbol} className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-content font-semibold text-sm">{h.symbol}</p>
                    <p className="text-faint text-xs truncate max-w-[180px]">{h.stockName}</p>
                  </div>
                  <div className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${band.bg} ${band.color} flex-shrink-0`}>
                    {h.positives}/{h.scored} positive · {band.label}
                  </div>
                </div>

                {/* Key numbers */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Your Return', value: fmtPct(h.yourReturnPct), color: h.yourReturnPct >= 0 ? 'text-success' : 'text-danger' },
                    { label: 'vs Nifty 1Y', value: h.relStr1y != null ? fmtPct(h.relStr1y) : '—', color: (h.relStr1y ?? 0) >= 0 ? 'text-success' : 'text-danger' },
                    { label: '1Y', value: fmtPct(h.metrics.ret1y), color: (h.metrics.ret1y ?? 0) >= 0 ? 'text-success' : 'text-danger' },
                    { label: 'Weight', value: `${h.weightPct.toFixed(1)}%`, color: 'text-content' },
                  ].map(k => (
                    <div key={k.label} className="bg-surface rounded-lg py-2">
                      <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
                      <p className="text-faint text-xs mt-0.5">{k.label}</p>
                    </div>
                  ))}
                </div>

                {/* 52W position bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-faint mb-1">
                    <span>52W Low ₹{Math.round(h.metrics.low52).toLocaleString('en-IN')}</span>
                    <span>CMP ₹{h.cmp.toLocaleString('en-IN')}</span>
                    <span>High ₹{Math.round(h.metrics.high52).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-1.5 bg-surface3 rounded-full relative">
                    <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-indigo-400 border border-white/60"
                      style={{ left: `calc(${Math.max(0, Math.min(100, posInRange))}% - 5px)` }} />
                  </div>
                </div>

                {/* Signals */}
                <div className="space-y-1.5">
                  {h.signals.map(sig => {
                    const ui = STATE_UI[sig.state];
                    return (
                      <div key={sig.key} className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ui.dot}`} />
                        <span className={`text-xs ${sig.state === 'na' ? 'text-faint' : 'text-muted'}`}>{sig.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Secondary stats */}
                <div className="flex items-center gap-4 pt-1 border-t border-edge text-xs text-muted">
                  <span>Vol <span className="text-muted">{h.metrics.volatility != null ? `${h.metrics.volatility.toFixed(0)}%` : '—'}</span></span>
                  <span>Max drop <span className="text-danger">{h.metrics.maxDrawdown != null ? `${h.metrics.maxDrawdown.toFixed(0)}%` : '—'}</span></span>
                  <span>Avg cost <span className="text-muted">₹{h.avgCost.toFixed(0)}</span></span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-start gap-2">
          <Info size={13} className="text-faint flex-shrink-0 mt-0.5" />
          <p className="text-faint text-xs">
            Signals are factual technical indicators for your reference only — not investment advice or a
            recommendation to buy, hold, or sell. Relative strength compares each stock's price return to the
            Nifty 50 over the same period. Prices are ~15 min delayed (Yahoo Finance).
          </p>
        </div>
      </div>
    </div>
  );
}

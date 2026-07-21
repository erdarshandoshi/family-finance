import type { StockGroup } from './stockUtils';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PricePoint { t: number; c: number; }          // t = ms epoch, c = close
export type HistoryMap = Record<string, PricePoint[]>;

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  time: number | null;
}
export type NewsMap = Record<string, NewsItem[]>;

export interface StockMetrics {
  symbol: string;
  stockName: string;
  cmp: number;
  high52: number;
  low52: number;
  pctFromHigh: number;          // negative = below 52w high
  pctFromLow: number;           // positive = above 52w low
  dma50: number | null;
  dma200: number | null;
  aboveDma50: boolean | null;
  aboveDma200: boolean | null;
  ret1m: number | null;
  ret3m: number | null;
  ret6m: number | null;
  ret1y: number | null;
  volatility: number | null;    // annualized %
  maxDrawdown: number | null;   // % (negative)
  dataPoints: number;
}

export interface PortfolioPoint { day: string; value: number; }

const DAY_MS = 86_400_000;

// ─── Fetch helpers ─────────────────────────────────────────────────────────────
export async function fetchHistory(symbols: string[], range = '3y'): Promise<HistoryMap> {
  if (symbols.length === 0) return {};
  const res = await fetch(`/api/history?symbols=${encodeURIComponent(symbols.join(','))}&range=${range}`);
  const json = await res.json() as { history: HistoryMap };
  return json.history ?? {};
}

export async function fetchNews(stocks: { symbol: string; stockName: string }[]): Promise<NewsMap> {
  if (stocks.length === 0) return {};
  // Send symbol + company name so the server can search news by company (reliable for NSE)
  const q = encodeURIComponent(JSON.stringify(stocks.map(s => ({ s: s.symbol, n: s.stockName }))));
  const res = await fetch(`/api/news?q=${q}`);
  const json = await res.json() as { news: NewsMap };
  return json.news ?? {};
}

// ─── Date helpers ──────────────────────────────────────────────────────────────
export function dayStr(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// Close price as of `days` ago (last point on/before the target date)
function closeDaysAgo(points: PricePoint[], days: number): number | null {
  if (points.length === 0) return null;
  const target = Date.now() - days * DAY_MS;
  let chosen: PricePoint | null = null;
  for (const p of points) {
    if (p.t <= target) chosen = p;
    else break;
  }
  // If the window starts before our data, fall back to the earliest point
  return chosen ? chosen.c : points[0].c;
}

// ─── Per-stock metrics ───────────────────────────────────────────────────────
export function computeMetrics(
  symbol: string, stockName: string, points: PricePoint[], cmpLive: number,
): StockMetrics {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const cutoff1y = Date.now() - 365 * DAY_MS;
  const yr = sorted.filter(p => p.t >= cutoff1y);
  const window = yr.length ? yr : sorted;

  const closes = window.map(p => p.c);
  const cmp = cmpLive > 0 ? cmpLive : (sorted[sorted.length - 1]?.c ?? 0);

  const high52 = closes.length ? Math.max(...closes) : cmp;
  const low52  = closes.length ? Math.min(...closes) : cmp;
  const pctFromHigh = high52 > 0 ? ((cmp - high52) / high52) * 100 : 0;
  const pctFromLow  = low52  > 0 ? ((cmp - low52)  / low52)  * 100 : 0;

  const avgLast = (n: number): number | null => {
    if (sorted.length < n) return null;
    const slice = sorted.slice(-n);
    return slice.reduce((s, p) => s + p.c, 0) / slice.length;
  };
  const dma50  = avgLast(50);
  const dma200 = avgLast(200);

  const ret = (days: number): number | null => {
    const base = closeDaysAgo(sorted, days);
    if (base == null || base === 0) return null;
    return ((cmp - base) / base) * 100;
  };

  // Annualized volatility from daily log returns over the 1y window
  let volatility: number | null = null;
  if (window.length > 5) {
    const logRets: number[] = [];
    for (let i = 1; i < window.length; i++) {
      const prev = window[i - 1].c, cur = window[i].c;
      if (prev > 0 && cur > 0) logRets.push(Math.log(cur / prev));
    }
    if (logRets.length > 1) {
      const mean = logRets.reduce((s, r) => s + r, 0) / logRets.length;
      const variance = logRets.reduce((s, r) => s + (r - mean) ** 2, 0) / (logRets.length - 1);
      volatility = Math.sqrt(variance) * Math.sqrt(252) * 100;
    }
  }

  // Max drawdown over the 1y window (peak-to-trough, %)
  let maxDrawdown: number | null = null;
  if (window.length > 1) {
    let peak = window[0].c, maxDD = 0;
    for (const p of window) {
      if (p.c > peak) peak = p.c;
      if (peak > 0) {
        const dd = ((p.c - peak) / peak) * 100;
        if (dd < maxDD) maxDD = dd;
      }
    }
    maxDrawdown = maxDD;
  }

  return {
    symbol, stockName, cmp, high52, low52, pctFromHigh, pctFromLow,
    dma50, dma200,
    aboveDma50:  dma50  != null ? cmp >= dma50  : null,
    aboveDma200: dma200 != null ? cmp >= dma200 : null,
    ret1m: ret(30), ret3m: ret(91), ret6m: ret(182), ret1y: ret(365),
    volatility, maxDrawdown,
    dataPoints: sorted.length,
  };
}

// ─── Portfolio value time series (mark-to-market of currently held lots) ──────
// value(day) = Σ groups Σ lots(purchased on/before day) qty × close(day, forward-filled)
export function buildPortfolioSeries(groups: StockGroup[], history: HistoryMap): PortfolioPoint[] {
  // Global sorted set of trading days across all held symbols
  const dayset = new Set<string>();
  for (const g of groups) {
    for (const p of history[g.symbol] ?? []) dayset.add(dayStr(p.t));
  }
  const days = [...dayset].sort();
  if (days.length === 0) return [];

  // Forward-filled close per symbol, indexed by day
  const filled: Record<string, Record<string, number>> = {};
  for (const g of groups) {
    const byDay = new Map<string, number>();
    for (const p of history[g.symbol] ?? []) byDay.set(dayStr(p.t), p.c);
    const map: Record<string, number> = {};
    let last: number | null = null;
    for (const d of days) {
      if (byDay.has(d)) last = byDay.get(d)!;
      if (last != null) map[d] = last;
    }
    filled[g.symbol] = map;
  }

  return days.map(day => {
    let value = 0;
    for (const g of groups) {
      const price = filled[g.symbol]?.[day];
      if (price == null) continue;
      let qty = 0;
      for (const lot of g.lots) {
        if (lot.dateOfPurchase && lot.dateOfPurchase <= day) qty += lot.quantity;
      }
      value += qty * price;
    }
    return { day, value: Math.round(value) };
  });
}

// ─── Relative strength vs benchmark ──────────────────────────────────────────
export const NIFTY_SYMBOL = '^NSEI';

// % price return over the trailing `days`, using the latest available close as "now"
export function periodReturn(points: PricePoint[], days: number): number | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const now = sorted[sorted.length - 1].c;
  const base = closeDaysAgo(sorted, days);
  if (base == null || base === 0) return null;
  return ((now - base) / base) * 100;
}

// ─── Per-stock health scorecard ───────────────────────────────────────────────
export type SignalState = 'good' | 'warn' | 'bad' | 'na';

export interface HealthSignal {
  key: string;
  label: string;      // short factual statement
  state: SignalState;
}

export interface StockHealth {
  symbol: string;
  stockName: string;
  cmp: number;
  avgCost: number;
  yourReturnPct: number;    // your unrealized return on this holding
  weightPct: number;        // share of portfolio value
  currentValue: number;
  metrics: StockMetrics;
  relStr6m: number | null;  // stock 6M return − Nifty 6M return (percentage points)
  relStr1y: number | null;
  sharpe: number | null;    // 1Y return ÷ annualized volatility (risk-adjusted)
  goldenCross: boolean | null;
  signals: HealthSignal[];
  positives: number;
  scored: number;           // number of non-N/A signals
}

export function buildHealth(
  group: StockGroup,
  points: PricePoint[],
  niftyPoints: PricePoint[],
  weightPct: number,
): StockHealth {
  const m = computeMetrics(group.symbol, group.stockName, points, group.currentPrice);

  const niftyReturn = (days: number) => (niftyPoints.length ? periodReturn(niftyPoints, days) : null);
  const rel = (stockRet: number | null, days: number): number | null => {
    const nr = niftyReturn(days);
    return stockRet != null && nr != null ? stockRet - nr : null;
  };
  const relStr6m = rel(m.ret6m, 182);
  const relStr1y = rel(m.ret1y, 365);

  const sharpe = m.ret1y != null && m.volatility != null && m.volatility > 0
    ? m.ret1y / m.volatility
    : null;

  const goldenCross = m.dma50 != null && m.dma200 != null ? m.dma50 >= m.dma200 : null;

  const signals: HealthSignal[] = [];

  // 1. Long-term trend — price vs 200-DMA
  signals.push({
    key: 'trend',
    label: m.aboveDma200 == null ? 'Trend: n/a'
      : m.aboveDma200 ? 'Above 200-DMA (long-term uptrend)' : 'Below 200-DMA (long-term downtrend)',
    state: m.aboveDma200 == null ? 'na' : m.aboveDma200 ? 'good' : 'bad',
  });

  // 2. Trend structure — 50-DMA vs 200-DMA (golden / death cross)
  signals.push({
    key: 'cross',
    label: goldenCross == null ? 'MA cross: n/a'
      : goldenCross ? '50-DMA above 200-DMA (golden)' : '50-DMA below 200-DMA (death)',
    state: goldenCross == null ? 'na' : goldenCross ? 'good' : 'bad',
  });

  // 3. Relative strength vs Nifty (1Y) — the key "is it worth holding vs the market" check
  signals.push({
    key: 'relstr',
    label: relStr1y == null ? 'vs Nifty: n/a'
      : relStr1y >= 0 ? `Beating Nifty by ${relStr1y.toFixed(0)}% (1Y)` : `Lagging Nifty by ${Math.abs(relStr1y).toFixed(0)}% (1Y)`,
    state: relStr1y == null ? 'na' : relStr1y >= 5 ? 'good' : relStr1y >= -5 ? 'warn' : 'bad',
  });

  // 4. Momentum — 3M return
  signals.push({
    key: 'momentum',
    label: m.ret3m == null ? 'Momentum: n/a'
      : m.ret3m >= 0 ? `Positive 3M momentum (+${m.ret3m.toFixed(0)}%)` : `Negative 3M momentum (${m.ret3m.toFixed(0)}%)`,
    state: m.ret3m == null ? 'na' : m.ret3m >= 0 ? 'good' : 'bad',
  });

  // 5. Distance from 52-week high
  signals.push({
    key: 'fromhigh',
    label: m.pctFromHigh >= -10 ? `Near 52W high (${m.pctFromHigh.toFixed(0)}%)`
      : m.pctFromHigh >= -25 ? `${m.pctFromHigh.toFixed(0)}% off 52W high` : `Deep below 52W high (${m.pctFromHigh.toFixed(0)}%)`,
    state: m.pctFromHigh >= -10 ? 'good' : m.pctFromHigh >= -25 ? 'warn' : 'bad',
  });

  // 6. Risk-adjusted return — 1Y return per unit of volatility
  signals.push({
    key: 'riskadj',
    label: sharpe == null ? 'Risk-adjusted: n/a'
      : sharpe >= 0.5 ? `Good risk-adjusted return (${sharpe.toFixed(2)})`
      : sharpe >= 0 ? `Modest risk-adjusted return (${sharpe.toFixed(2)})` : `Poor risk-adjusted return (${sharpe.toFixed(2)})`,
    state: sharpe == null ? 'na' : sharpe >= 0.5 ? 'good' : sharpe >= 0 ? 'warn' : 'bad',
  });

  const scored = signals.filter(s => s.state !== 'na').length;
  const positives = signals.filter(s => s.state === 'good').length;

  return {
    symbol: group.symbol,
    stockName: group.stockName,
    cmp: m.cmp,
    avgCost: group.avgPrice,
    yourReturnPct: group.plPct,
    weightPct,
    currentValue: group.totalCurrent,
    metrics: m,
    relStr6m, relStr1y, sharpe, goldenCross,
    signals, positives, scored,
  };
}

// ─── Financial-year helpers (India: 1 Apr – 31 Mar) ───────────────────────────
export interface FYRange { label: string; start: string; end: string; }

export function financialYears(count = 4): FYRange[] {
  const now = new Date();
  // FY starting year: if before April, current FY started last calendar year
  const startYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const out: FYRange[] = [];
  for (let i = 0; i < count; i++) {
    const y = startYear - i;
    out.push({
      label: `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`,
      start: `${y}-04-01`,
      end: `${y + 1}-03-31`,
    });
  }
  return out;
}

import type { AppData } from '../types';

// ─── XIRR (money-weighted return) ─────────────────────────────────────────────
export interface CashFlow { date: Date; amount: number; }  // <0 invested, >0 returned/value

const MS_YEAR = 365 * 86_400_000;

export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  if (!sorted.some(f => f.amount < 0) || !sorted.some(f => f.amount > 0)) return null;

  const t0 = sorted[0].date.getTime();
  const yrs = (d: Date) => (d.getTime() - t0) / MS_YEAR;
  const npv  = (r: number) => sorted.reduce((s, f) => s + f.amount / Math.pow(1 + r, yrs(f.date)), 0);
  const dnpv = (r: number) => sorted.reduce((s, f) => {
    const y = yrs(f.date);
    return s - (y * f.amount) / Math.pow(1 + r, y + 1);
  }, 0);

  // Newton–Raphson with a bisection fallback
  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    const f = npv(r), df = dnpv(r);
    if (Math.abs(df) < 1e-12) break;
    let rn = r - f / df;
    if (!isFinite(rn)) break;
    if (rn <= -0.9999) rn = -0.9999;
    if (Math.abs(rn - r) < 1e-8) { r = rn; break; }
    r = rn;
  }
  if (isFinite(r) && r > -1 && Math.abs(npv(r)) < 1) return r * 100;

  // Fallback: bisection between -0.9999 and 10 (i.e. -100%..+1000%)
  let lo = -0.9999, hi = 10, flo = npv(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1) return mid * 100;
    if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else { hi = mid; }
  }
  return null;
}

// ─── FD / Post linear accrual (value on a given date) ─────────────────────────
function lerpValue(start: number, end: number, startDate: string, endDate: string, on: Date): number {
  const s = new Date(startDate).getTime();
  const e = new Date(endDate).getTime();
  const t = on.getTime();
  if (t <= s) return start;
  if (t >= e || e <= s) return end;
  return start + (end - start) * ((t - s) / (e - s));
}

// ─── Portfolio cash flows (for whole-portfolio XIRR as of today) ──────────────
export function portfolioCashFlows(data: AppData, memberIds: string[]): CashFlow[] {
  const now = new Date();
  const inc = (id: string) => memberIds.includes(id);
  const flows: CashFlow[] = [];
  let terminal = 0;

  for (const s of data.stocks) if (inc(s.memberId)) {
    if (s.dateOfPurchase) flows.push({ date: new Date(s.dateOfPurchase), amount: -(s.quantity * s.purchasePrice) });
    terminal += s.quantity * s.currentPrice;
  }
  for (const m of data.mfs) if (inc(m.memberId)) {
    if (m.dateOfPurchase) flows.push({ date: new Date(m.dateOfPurchase), amount: -(m.quantity * m.purchasePrice) });
    terminal += m.quantity * m.currentPrice;
  }
  for (const f of data.fds) if (inc(f.memberId)) {
    if (f.dateOfInvestment) flows.push({ date: new Date(f.dateOfInvestment), amount: -f.amountInvested });
    terminal += lerpValue(f.amountInvested, f.maturityAmount, f.dateOfInvestment, f.maturityDate, now);
  }
  for (const p of data.postInvestments) if (inc(p.memberId)) {
    if (p.startDate) flows.push({ date: new Date(p.startDate), amount: -p.principal });
    terminal += lerpValue(p.principal, p.maturityAmount, p.startDate, p.maturityDate, now);
  }
  for (const n of data.nps) if (inc(n.memberId)) {
    if (n.dateOfJoining) flows.push({ date: new Date(n.dateOfJoining), amount: -n.totalInvested });
    terminal += n.currentCorpus;
  }
  // PPF / PF: no dated cash flows available — excluded from XIRR (documented in UI)

  if (terminal > 0) flows.push({ date: now, amount: terminal });
  return flows;
}

export function xirrFromLots(
  lots: { date: string; invested: number }[], currentValue: number,
): number | null {
  const flows: CashFlow[] = lots
    .filter(l => l.date && l.invested > 0)
    .map(l => ({ date: new Date(l.date), amount: -l.invested }));
  if (currentValue > 0) flows.push({ date: new Date(), amount: currentValue });
  return xirr(flows);
}

// ─── Estimated monthly net-worth series ───────────────────────────────────────
export interface NetWorthPoint { month: string; total: number; } // month = YYYY-MM-01

function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function estimatedNetWorthSeries(data: AppData, memberIds: string[]): NetWorthPoint[] {
  const inc = (id: string) => memberIds.includes(id);
  const dates: number[] = [];
  const push = (s?: string) => { if (s) { const t = new Date(s).getTime(); if (!isNaN(t)) dates.push(t); } };

  data.stocks.forEach(s => inc(s.memberId) && push(s.dateOfPurchase));
  data.mfs.forEach(m => inc(m.memberId) && push(m.dateOfPurchase));
  data.fds.forEach(f => inc(f.memberId) && push(f.dateOfInvestment));
  data.postInvestments.forEach(p => inc(p.memberId) && push(p.startDate));
  data.nps.forEach(n => inc(n.memberId) && push(n.dateOfJoining));
  if (dates.length === 0) return [];

  const start = new Date(Math.min(...dates));
  start.setDate(1);
  const now = new Date();

  // "No-history" assets (PPF/PF/NPS corpus) ramp linearly from the window start to today.
  const ppfNow = data.ppf.filter(p => inc(p.memberId)).reduce((s, p) => s + p.currentAmount, 0);
  const pfNow  = data.pf.filter(p => inc(p.memberId)).reduce((s, p) => s + p.currentAmount, 0);
  const npsNow = data.nps.filter(n => inc(n.memberId)).reduce((s, n) => s + n.currentCorpus, 0);
  const rampAssets = ppfNow + pfNow + npsNow;
  const startMs = start.getTime(), nowMs = now.getTime();
  const span = Math.max(1, nowMs - startMs);

  const points: NetWorthPoint[] = [];
  const cursor = new Date(start);
  while (cursor <= now) {
    const on = new Date(Math.min(cursor.getTime(), nowMs));
    let total = 0;

    for (const s of data.stocks) if (inc(s.memberId) && s.dateOfPurchase && new Date(s.dateOfPurchase) <= on) {
      const cost = s.quantity * s.purchasePrice, cur = s.quantity * s.currentPrice;
      const bt = new Date(s.dateOfPurchase).getTime();
      const frac = Math.min(1, Math.max(0, (on.getTime() - bt) / Math.max(1, nowMs - bt)));
      total += cost + (cur - cost) * frac;
    }
    for (const m of data.mfs) if (inc(m.memberId) && m.dateOfPurchase && new Date(m.dateOfPurchase) <= on) {
      const cost = m.quantity * m.purchasePrice, cur = m.quantity * m.currentPrice;
      const bt = new Date(m.dateOfPurchase).getTime();
      const frac = Math.min(1, Math.max(0, (on.getTime() - bt) / Math.max(1, nowMs - bt)));
      total += cost + (cur - cost) * frac;
    }
    for (const f of data.fds) if (inc(f.memberId) && f.dateOfInvestment && new Date(f.dateOfInvestment) <= on) {
      total += lerpValue(f.amountInvested, f.maturityAmount, f.dateOfInvestment, f.maturityDate, on);
    }
    for (const p of data.postInvestments) if (inc(p.memberId) && p.startDate && new Date(p.startDate) <= on) {
      total += lerpValue(p.principal, p.maturityAmount, p.startDate, p.maturityDate, on);
    }
    total += rampAssets * ((on.getTime() - startMs) / span);

    points.push({ month: monthStr(cursor), total: Math.round(total) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return points;
}

// ─── Diversification score ────────────────────────────────────────────────────
export interface Diversification {
  score: number;         // 0 (concentrated) .. 100 (well spread)
  effectiveClasses: number;
  topName: string;
  topPct: number;
  label: string;
}

export function diversification(alloc: { name: string; value: number }[]): Diversification {
  const items = alloc.filter(a => a.value > 0);
  const total = items.reduce((s, a) => s + a.value, 0);
  if (total <= 0 || items.length === 0)
    return { score: 0, effectiveClasses: 0, topName: '—', topPct: 0, label: 'No data' };

  const shares = items.map(a => a.value / total);
  const hhi = shares.reduce((s, x) => s + x * x, 0);
  const effective = 1 / hhi;                       // effective number of classes
  const n = items.length;
  // Normalise: score 0 when all in one class, 100 when perfectly even across n classes
  const even = 1 / n;
  const score = n > 1 ? Math.round(Math.max(0, Math.min(1, (1 - hhi) / (1 - even))) * 100) : 0;

  const top = items.reduce((a, b) => (b.value > a.value ? b : a));
  const topPct = (top.value / total) * 100;
  const label = score >= 70 ? 'Well diversified' : score >= 40 ? 'Moderately diversified' : 'Concentrated';
  return { score, effectiveClasses: Math.round(effective * 10) / 10, topName: top.name, topPct, label };
}

// ─── Maturity cash-flow ladder (FD + Post, by month) ──────────────────────────
export interface MaturityBucket { month: string; label: string; fd: number; post: number; total: number; }

export function maturityLadder(data: AppData, memberIds: string[], monthsAhead = 24): MaturityBucket[] {
  const inc = (id: string) => memberIds.includes(id);
  const map = new Map<string, MaturityBucket>();
  const now = new Date(); now.setDate(1); now.setHours(0, 0, 0, 0);
  const horizon = new Date(now); horizon.setMonth(horizon.getMonth() + monthsAhead);

  const bucketFor = (d: Date) => {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) {
      map.set(key, {
        month: key,
        label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        fd: 0, post: 0, total: 0,
      });
    }
    return map.get(key)!;
  };

  for (const f of data.fds) if (inc(f.memberId) && f.maturityDate) {
    const d = new Date(f.maturityDate);
    if (d >= now && d <= horizon) { const b = bucketFor(d); b.fd += f.maturityAmount; b.total += f.maturityAmount; }
  }
  for (const p of data.postInvestments) if (inc(p.memberId) && p.maturityDate) {
    const d = new Date(p.maturityDate);
    if (d >= now && d <= horizon) { const b = bucketFor(d); b.post += p.maturityAmount; b.total += p.maturityAmount; }
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

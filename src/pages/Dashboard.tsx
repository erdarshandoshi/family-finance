import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Landmark, TrendingUp, BarChart3, PiggyBank, Briefcase,
  AlertTriangle, IndianRupee, Wallet, ArrowUpRight, ArrowDownRight, Users, Building2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatCompact, formatDate, isMaturityThisMonth, isMatured, timeUntilDate, daysUntilMaturity } from '../utils/helpers';
import { ALL_MEMBERS_ID } from '../components/Layout/Header';
import KPICard from '../components/common/KPICard';
import NetWorthTrend from '../components/Dashboard/NetWorthTrend';
import MaturityLadder from '../components/Dashboard/MaturityLadder';
import GoalTracker from '../components/Dashboard/GoalTracker';
import { xirr, portfolioCashFlows } from '../utils/finance';
import type { PostScheme, AssetKey, Goals } from '../types';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Legend,
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const MEMBER_COLORS = ['#6366f1', '#ec4899', '#f59e0b'];

const SCHEME_META: Record<PostScheme, { label: string; bg: string; text: string; desc: string }> = {
  NSC:  { label: 'NSC',  bg: 'bg-indigo-500/10 border-indigo-500/20',  text: 'text-accent',  desc: 'National Savings Certificate' },
  KVP:  { label: 'KVP',  bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-success', desc: 'Kisan Vikas Patra' },
  MIS:  { label: 'MIS',  bg: 'bg-blue-500/10 border-blue-500/20',      text: 'text-blue-400',    desc: 'Monthly Income Scheme' },
  TD:   { label: 'TD',   bg: 'bg-amber-500/10 border-amber-500/20',    text: 'text-warn',   desc: 'Time Deposit' },
  SCSS: { label: 'SCSS', bg: 'bg-purple-500/10 border-purple-500/20',  text: 'text-purple-400',  desc: 'Senior Citizens Savings' },
  RD:   { label: 'RD',   bg: 'bg-pink-500/10 border-pink-500/20',      text: 'text-pink-400',    desc: 'Recurring Deposit' },
  SSY:  { label: 'SSY',  bg: 'bg-teal-500/10 border-teal-500/20',      text: 'text-teal-400',    desc: 'Sukanya Samriddhi Yojana' },
};

function fdUrgency(maturityDate: string) {
  if (isMatured(maturityDate))
    return { border: 'border-l-slate-600', badge: 'bg-surface2 text-muted', bar: 'bg-surface3' };
  const d = daysUntilMaturity(maturityDate);
  if (d <= 30) return { border: 'border-l-red-500',   badge: 'bg-red-500/10 text-danger',     bar: 'bg-red-500' };
  if (d <= 90) return { border: 'border-l-amber-500', badge: 'bg-amber-500/10 text-warn', bar: 'bg-amber-500' };
  return               { border: 'border-l-indigo-500', badge: 'bg-indigo-500/10 text-accent', bar: 'bg-indigo-500' };
}

function fdProgress(dateOfInvestment: string, maturityDate: string): number {
  const start = new Date(dateOfInvestment).getTime();
  const end   = new Date(maturityDate).getTime();
  const now   = Date.now();
  if (end <= start) return 100;
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

export default function Dashboard() {
  const { data, dispatch, activeMemberId } = useApp();
  const navigate = useNavigate();
  const fetchedRef = useRef(false);
  const snapRef = useRef(false);

  const isAll     = activeMemberId === ALL_MEMBERS_ID;
  const memberIds = isAll ? data.members.map(m => m.id) : [activeMemberId];
  const member    = data.members.find(m => m.id === activeMemberId);

  // Auto-refresh stock prices on dashboard load
  useEffect(() => {
    if (fetchedRef.current || data.stocks.length === 0) return;
    const today = new Date().toDateString();
    const lastFetch = localStorage.getItem('ff_prices_date');
    const hasZeroPrice = data.stocks.some(s => s.currentPrice === 0 && s.symbol);
    if (lastFetch === today && !hasZeroPrice) { fetchedRef.current = true; return; }
    fetchedRef.current = true;

    Promise.all(
      data.stocks.filter(s => s.symbol).map(async s => {
        try {
          const res  = await fetch(`/api/price?symbol=${encodeURIComponent(s.symbol)}`);
          const json = await res.json() as { price: number | null };
          if (json.price !== null && json.price !== s.currentPrice)
            dispatch({ type: 'UPDATE_STOCK', payload: { ...s, currentPrice: json.price } });
        } catch { /* ignore */ }
      })
    ).then(() => localStorage.setItem('ff_prices_date', today));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.stocks.length]);

  // Record one whole-family net-worth snapshot per calendar month (builds real history)
  useEffect(() => {
    if (snapRef.current) return;
    const ym = new Date().toISOString().slice(0, 7);
    if ((data.snapshots ?? []).some(s => s.date.slice(0, 7) === ym)) { snapRef.current = true; return; }
    const fd    = data.fds.reduce((s, f) => s + f.maturityAmount, 0);
    const stk   = data.stocks.reduce((s, st) => s + st.quantity * st.currentPrice, 0);
    const mf    = data.mfs.reduce((s, m) => s + m.quantity * m.currentPrice, 0);
    const ppf   = data.ppf.reduce((s, p) => s + p.currentAmount, 0);
    const pf    = data.pf.reduce((s, p) => s + p.currentAmount, 0);
    const post  = data.postInvestments.reduce((s, p) => s + p.maturityAmount, 0);
    const nps   = data.nps.reduce((s, n) => s + n.currentCorpus, 0);
    const total = fd + stk + mf + ppf + pf + post + nps;
    if (total <= 0) return;                      // wait until data has loaded
    snapRef.current = true;
    dispatch({ type: 'ADD_SNAPSHOT', payload: {
      date: new Date().toISOString().slice(0, 10), total, fd, stocks: stk, mf, ppf, pf, post, nps,
    } });
  }, [data, dispatch]);

  // ── Filtered data ───────────────────────────────────────────────────────
  const fds      = data.fds.filter(f => memberIds.includes(f.memberId));
  const stocks   = data.stocks.filter(s => memberIds.includes(s.memberId));
  const mfs      = data.mfs.filter(m => memberIds.includes(m.memberId));
  const ppfList  = data.ppf.filter(p => memberIds.includes(p.memberId));
  const pfList   = data.pf.filter(p => memberIds.includes(p.memberId));
  const postList = data.postInvestments.filter(p => memberIds.includes(p.memberId));

  // ── FD stats ────────────────────────────────────────────────────────────
  const fdInvested        = fds.reduce((s, f) => s + f.amountInvested, 0);
  const fdMaturity        = fds.reduce((s, f) => s + f.maturityAmount, 0);
  const maturingThisMonth = fds.filter(f => isMaturityThisMonth(f.maturityDate));

  // Active FDs sorted by maturity (nearest first), matured appended at end
  const activeFdsSorted = fds
    .filter(f => !isMatured(f.maturityDate))
    .sort((a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime());
  const maturedFds = fds
    .filter(f => isMatured(f.maturityDate))
    .sort((a, b) => new Date(b.maturityDate).getTime() - new Date(a.maturityDate).getTime());
  const allFdsSorted = [...activeFdsSorted, ...maturedFds];

  // ── Equity stats ────────────────────────────────────────────────────────
  const stockInvested = stocks.reduce((s, st) => s + st.quantity * st.purchasePrice, 0);
  const stockCurrent  = stocks.reduce((s, st) => s + st.quantity * st.currentPrice, 0);
  const stockPL       = stockCurrent - stockInvested;

  const dematBreakdown = ['KIFS', 'Zerodha'].map(account => {
    const as  = stocks.filter(s => (s.dematAccount ?? 'KIFS') === account);
    const inv = as.reduce((s, st) => s + st.quantity * st.purchasePrice, 0);
    const cur = as.reduce((s, st) => s + st.quantity * st.currentPrice, 0);
    return { account, count: as.length, invested: inv, current: cur, pl: cur - inv, plPct: inv > 0 ? ((cur - inv) / inv) * 100 : 0 };
  }).filter(d => d.count > 0);

  const mfInvested = mfs.reduce((s, m) => s + m.quantity * m.purchasePrice, 0);
  const mfCurrent  = mfs.reduce((s, m) => s + m.quantity * m.currentPrice, 0);
  const mfPL       = mfCurrent - mfInvested;

  const ppfAmount = ppfList.reduce((s, p) => s + p.currentAmount, 0);
  const pfAmount  = pfList.reduce((s, p) => s + p.currentAmount, 0);

  // ── Post investment stats ────────────────────────────────────────────────
  const postInvested = postList.reduce((s, p) => s + p.principal, 0);
  const postMaturity = postList.reduce((s, p) => s + p.maturityAmount, 0);
  const postInterest = postMaturity - postInvested;
  const sortedPost   = [...postList].sort((a, b) =>
    new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime()
  );

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalPortfolio = fdMaturity + stockCurrent + mfCurrent + ppfAmount + pfAmount + postMaturity;
  const totalPL        = stockPL + mfPL;
  const totalPLPct     = (stockInvested + mfInvested) > 0 ? (totalPL / (stockInvested + mfInvested)) * 100 : 0;

  // ── Asset allocation (includes Post) ────────────────────────────────────
  const allocData = [
    { name: 'Fixed Deposits', value: fdMaturity   },
    { name: 'Stocks',         value: stockCurrent },
    { name: 'Mutual Funds',   value: mfCurrent    },
    { name: 'PPF',            value: ppfAmount     },
    { name: 'PF/EPF',         value: pfAmount      },
    { name: 'Post Office',    value: postMaturity  },
  ].filter(d => d.value > 0);

  // Keyed allocation for diversification & goal tracking (current view)
  const allocByKey = ([
    { key: 'fd',     name: 'Fixed Deposits', value: fdMaturity  },
    { key: 'stocks', name: 'Stocks',         value: stockCurrent },
    { key: 'mf',     name: 'Mutual Funds',   value: mfCurrent   },
    { key: 'ppf',    name: 'PPF',            value: ppfAmount   },
    { key: 'pf',     name: 'EPF',            value: pfAmount    },
    { key: 'post',   name: 'Post Office',    value: postMaturity },
  ] as { key: AssetKey; name: string; value: number }[]).filter(d => d.value > 0);

  // Money-weighted return across the current view (equities, FD, Post, NPS)
  const portfolioXirr = xirr(portfolioCashFlows(data, memberIds));

  // ── Per-member breakdown (includes Post) ─────────────────────────────────
  const memberBreakdown = data.members.map((m, i) => {
    const mFds    = data.fds.filter(f => f.memberId === m.id);
    const mStocks = data.stocks.filter(s => s.memberId === m.id);
    const mMfs    = data.mfs.filter(mf => mf.memberId === m.id);
    const mPpf    = data.ppf.find(p => p.memberId === m.id);
    const mPf     = data.pf.find(p => p.memberId === m.id);
    const mPost   = data.postInvestments.filter(p => p.memberId === m.id);
    const fdInv   = mFds.reduce((s, f) => s + f.amountInvested, 0);
    const fdMat   = mFds.reduce((s, f) => s + f.maturityAmount, 0);
    const stVal   = mStocks.reduce((s, st) => s + st.quantity * st.currentPrice, 0);
    const mfVal   = mMfs.reduce((s, mf) => s + mf.quantity * mf.currentPrice, 0);
    const ppfVal  = mPpf?.currentAmount ?? 0;
    const pfVal   = mPf?.currentAmount ?? 0;
    const postInv = mPost.reduce((s, p) => s + p.principal, 0);
    const postMat = mPost.reduce((s, p) => s + p.maturityAmount, 0);
    return {
      name: m.name,
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      fdInvested:   fdInv,
      fdMaturity:   fdMat,
      Stocks:       stVal,
      'MF/SIP':     mfVal,
      PPF:          ppfVal,
      EPF:          pfVal,
      postInvested: postInv,
      postMaturity: postMat,
      total: fdMat + stVal + mfVal + ppfVal + pfVal + postMat,
    };
  });

  // ── Top movers ───────────────────────────────────────────────────────────
  const allEquity = [
    ...stocks.map(s => {
      const m = data.members.find(mem => mem.id === s.memberId);
      return { name: s.stockName, type: 'Stock', owner: m?.name ?? '',
        pl:  s.quantity * s.currentPrice - s.quantity * s.purchasePrice,
        pct: s.purchasePrice > 0 ? ((s.currentPrice - s.purchasePrice) / s.purchasePrice) * 100 : 0 };
    }),
    ...mfs.map(mf => {
      const m = data.members.find(mem => mem.id === mf.memberId);
      return { name: mf.schemeName || mf.companyName, type: 'MF', owner: m?.name ?? '',
        pl:  mf.quantity * mf.currentPrice - mf.quantity * mf.purchasePrice,
        pct: mf.purchasePrice > 0 ? ((mf.currentPrice - mf.purchasePrice) / mf.purchasePrice) * 100 : 0 };
    }),
  ];
  const topGainers = [...allEquity].sort((a, b) => b.pct - a.pct).slice(0, 3);
  const topLosers  = [...allEquity].sort((a, b) => a.pct - b.pct).filter(x => x.pct < 0).slice(0, 3);

  const isEmpty = totalPortfolio === 0;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-start justify-between gap-3">
        <div>
          {isAll ? (
            <>
              <div className="flex items-center gap-2">
                <Users size={20} className="text-accent" />
                <h2 className="text-2xl font-bold text-content">Family Portfolio</h2>
              </div>
              <p className="text-muted text-sm mt-1">
                Combined view — {data.members.map(m => m.name).join(', ')} ·{' '}
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-content">Welcome back, {member?.name}</h2>
              <p className="text-muted text-sm mt-1">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </>
          )}
        </div>
        {maturingThisMonth.length > 0 && (
          <button onClick={() => navigate('/fd')}
            className="flex-shrink-0 flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-warn px-3 py-2 rounded-xl text-sm font-medium hover:bg-amber-500/20 transition-colors">
            <AlertTriangle size={16} />
            <span className="hidden sm:inline">{maturingThisMonth.length} FD{maturingThisMonth.length > 1 ? 's' : ''} Maturing</span>
            <span className="sm:hidden">{maturingThisMonth.length} FDs</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          title={isAll ? 'Family Portfolio' : 'Total Portfolio'}
          value={formatCompact(totalPortfolio)}
          subtitle={isAll ? `${data.members.length} members combined` : 'All asset classes'}
          icon={isAll ? Users : Wallet}
          iconColor="text-accent"
          bgColor="bg-indigo-500/10"
        />
        <KPICard
          title="Total P&L"
          value={formatCompact(totalPL)}
          subtitle={`${totalPLPct >= 0 ? '+' : ''}${totalPLPct.toFixed(2)}% overall${portfolioXirr != null ? ` · XIRR ${portfolioXirr >= 0 ? '+' : ''}${portfolioXirr.toFixed(1)}%` : ''}`}
          icon={totalPL >= 0 ? TrendingUp : ArrowDownRight}
          iconColor={totalPL >= 0 ? 'text-success' : 'text-danger'}
          bgColor={totalPL >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}
          trend={totalPL !== 0 ? { value: `${Math.abs(totalPLPct).toFixed(2)}%`, positive: totalPL >= 0 } : undefined}
        />
        <KPICard
          title="Active FDs"
          value={String(fds.filter(f => !isMatured(f.maturityDate)).length)}
          subtitle={maturingThisMonth.length > 0 ? `${maturingThisMonth.length} maturing this month` : `${fds.length} total`}
          icon={Landmark}
          iconColor="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <KPICard
          title="Post Investments"
          value={formatCompact(postMaturity)}
          subtitle={postList.length > 0 ? `${postList.length} scheme${postList.length !== 1 ? 's' : ''} · +${formatCompact(postInterest)}` : 'No schemes added'}
          icon={Building2}
          iconColor="text-warn"
          bgColor="bg-amber-500/10"
        />
      </div>

      {isEmpty ? (
        <div className="text-center py-20 text-faint">
          <IndianRupee size={48} className="mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-semibold text-muted mb-2">No investments yet</h3>
          <p className="text-sm">Start by adding Fixed Deposits, Stocks, or Mutual Funds.</p>
        </div>
      ) : (
        <>
          {/* Net worth trend over time */}
          <NetWorthTrend data={data} memberIds={memberIds} currentTotal={totalPortfolio} />

          {/* Goals */}
          <GoalTracker
            goals={data.goals ?? {}}
            currentTotal={totalPortfolio}
            alloc={allocByKey}
            onSave={(g: Goals) => dispatch({ type: 'SET_GOALS', payload: g })}
          />

          {/* Per-member breakdown */}
          {isAll && (
            <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-accent" />
                <h3 className="text-content font-semibold text-sm">Per-Member Breakdown</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {memberBreakdown.map(mb => (
                  <div key={mb.name} className="bg-surface2 rounded-xl p-4 border border-edge">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mb.color }} />
                      <span className="text-content font-semibold text-sm">{mb.name}</span>
                    </div>
                    <p className="text-2xl font-bold text-content mb-3">{formatCurrency(mb.total)}</p>
                    <div className="space-y-1.5">
                      {/* FD rows */}
                      {(mb.fdInvested > 0 || mb.fdMaturity > 0) && (
                        <div className="rounded-lg bg-blue-500/5 border border-blue-500/10 px-2 py-1.5 space-y-1">
                          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Fixed Deposits</p>
                          {mb.fdInvested > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted">Invested</span>
                              <span className="font-medium text-muted">{formatCurrency(mb.fdInvested)}</span>
                            </div>
                          )}
                          {mb.fdMaturity > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted">Maturity</span>
                              <span className="font-medium text-blue-400">{formatCurrency(mb.fdMaturity)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Post rows */}
                      {(mb.postInvested > 0 || mb.postMaturity > 0) && (
                        <div className="rounded-lg bg-teal-500/5 border border-teal-500/10 px-2 py-1.5 space-y-1">
                          <p className="text-xs font-semibold text-teal-400 uppercase tracking-wide">Post Office</p>
                          {mb.postInvested > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted">Invested</span>
                              <span className="font-medium text-muted">{formatCurrency(mb.postInvested)}</span>
                            </div>
                          )}
                          {mb.postMaturity > 0 && (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted">Maturity</span>
                              <span className="font-medium text-teal-400">{formatCurrency(mb.postMaturity)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Other assets */}
                      {(
                        [
                          ['Stocks',  mb.Stocks,    'text-accent' ],
                          ['MF/SIP',  mb['MF/SIP'], 'text-success'],
                          ['PPF',     mb.PPF,       'text-warn'  ],
                          ['EPF',     mb.EPF,       'text-purple-400' ],
                        ] as [string, number, string][]
                      )
                        .filter(([, v]) => v > 0)
                        .map(([label, val, cls]) => (
                          <div key={label} className="flex justify-between text-xs">
                            <span className="text-muted">{label}</span>
                            <span className={`font-medium ${cls}`}>{formatCurrency(val)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Stacked bar comparison */}
              <div className="mt-5">
                <ResponsiveContainer width="100%" height={80}>
                  <BarChart
                    data={[Object.fromEntries([['name', 'Family'], ...memberBreakdown.map(mb => [mb.name, mb.total])])]}
                    layout="vertical"
                    barSize={28}
                  >
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={v => `₹${((v as number) / 100000).toFixed(0)}L`} />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      formatter={(v: unknown) => formatCurrency(v as number)}
                    />
                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12, color: '#94a3b8' }} />
                    {memberBreakdown.map(mb => (
                      <Bar key={mb.name} dataKey={mb.name} stackId="a" fill={mb.color} name={mb.name} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Asset Allocation — full width */}
          <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-content font-semibold text-sm">Asset Allocation</h3>
                <p className="text-faint text-xs mt-0.5">
                  {isAll ? 'Entire family · ' : ''}Distribution across {allocData.length} asset class{allocData.length !== 1 ? 'es' : ''}
                </p>
              </div>
              <p className="text-muted text-xs">{formatCurrency(totalPortfolio)} total</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-shrink-0">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={allocData} cx="50%" cy="50%" innerRadius={50} outerRadius={82} paddingAngle={3} dataKey="value">
                      {allocData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      formatter={(v: unknown) => formatCurrency(v as number)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {allocData.map((item, i) => {
                  const pct = totalPortfolio > 0 ? (item.value / totalPortfolio) * 100 : 0;
                  return (
                    <div key={item.name} className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-muted text-xs font-medium">{item.name}</span>
                          <span className="text-content text-xs font-bold flex-shrink-0">{pct.toFixed(1)}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-surface2 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                          </div>
                          <span className="text-faint text-xs flex-shrink-0">{formatCurrency(item.value)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Demat account breakdown */}
          {dematBreakdown.length > 0 && (
            <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-content font-semibold text-sm">Demat Account Breakdown</h3>
                  <p className="text-faint text-xs mt-0.5">
                    {stocks.length} holding{stocks.length !== 1 ? 's' : ''} across {dematBreakdown.length} account{dematBreakdown.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button onClick={() => navigate('/stocks')} className="text-xs text-accent hover:text-accent transition-colors">
                  View stocks →
                </button>
              </div>
              <div className={`grid gap-4 ${dematBreakdown.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
                {dematBreakdown.map(d => (
                  <div key={d.account} className="bg-surface2 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-content font-semibold text-sm">{d.account}</p>
                      <span className="text-xs text-faint bg-surface2 px-2 py-0.5 rounded-full">
                        {d.count} holding{d.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><p className="text-faint text-xs">Invested</p><p className="text-muted text-sm font-medium mt-0.5">{formatCurrency(d.invested)}</p></div>
                      <div><p className="text-faint text-xs">Current Value</p><p className="text-content text-sm font-medium mt-0.5">{formatCurrency(d.current)}</p></div>
                      <div><p className="text-faint text-xs">P&L</p><p className={`text-sm font-semibold mt-0.5 ${d.pl >= 0 ? 'text-success' : 'text-danger'}`}>{d.pl >= 0 ? '+' : ''}{formatCurrency(d.pl)}</p></div>
                      <div><p className="text-faint text-xs">Return</p><p className={`text-sm font-semibold mt-0.5 ${d.plPct >= 0 ? 'text-success' : 'text-danger'}`}>{d.plPct >= 0 ? '+' : ''}{d.plPct.toFixed(2)}%</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FD Overview (redesigned) + Top Performers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* ── FD Smart Timeline ───────────────────────────────────────────── */}
            <div className="bg-surface border border-edge rounded-2xl shadow-card p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-content font-semibold text-sm">FD Overview</h3>
                  <p className="text-faint text-xs mt-0.5">
                    {activeFdsSorted.length} active · {maturedFds.length} matured
                  </p>
                </div>
                <button onClick={() => navigate('/fd')} className="text-xs text-accent hover:text-accent transition-colors">
                  Manage →
                </button>
              </div>

              {fds.length === 0 ? (
                <p className="text-faint text-sm">No FDs added yet.</p>
              ) : (
                <>
                  {/* Summary strip */}
                  <div className="grid grid-cols-3 gap-2 bg-surface2 rounded-xl p-3">
                    <div className="text-center">
                      <p className="text-faint text-xs">Invested</p>
                      <p className="text-content text-sm font-bold mt-0.5">{formatCurrency(fdInvested)}</p>
                    </div>
                    <div className="text-center border-x border-edge">
                      <p className="text-faint text-xs">Maturity</p>
                      <p className="text-content text-sm font-bold mt-0.5">{formatCurrency(fdMaturity)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-faint text-xs">Interest</p>
                      <p className="text-success text-sm font-bold mt-0.5">+{formatCurrency(fdMaturity - fdInvested)}</p>
                    </div>
                  </div>

                  {/* Timeline list */}
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                    {allFdsSorted.map(fd => {
                      const urg     = fdUrgency(fd.maturityDate);
                      const pct     = fdProgress(fd.dateOfInvestment, fd.maturityDate);
                      const fdOwner = isAll ? data.members.find(m => m.id === fd.memberId) : null;
                      const matured = isMatured(fd.maturityDate);
                      return (
                        <div key={fd.id}
                          className={`border-l-2 ${urg.border} bg-surface2 rounded-r-lg pl-2.5 pr-2.5 py-2 space-y-1`}>
                          {/* Row 1: Bank + Owner | Rate | Badge */}
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-content text-xs font-semibold truncate">{fd.bankName}</span>
                              {fdOwner && <span className="text-faint text-xs flex-shrink-0">· {fdOwner.name}</span>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-faint text-xs">{fd.rateOfInterest}%</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${urg.badge}`}>
                                {matured ? 'Matured' : timeUntilDate(fd.maturityDate)}
                              </span>
                            </div>
                          </div>
                          {/* Row 2: Amounts + progress bar + date inline */}
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted flex-shrink-0">
                              {formatCompact(fd.amountInvested)}
                              <span className="text-faint mx-0.5">→</span>
                              <span className={matured ? 'text-muted' : 'text-success'}>
                                {formatCompact(fd.maturityAmount)}
                              </span>
                            </span>
                            <div className="flex-1 bg-surface2 rounded-full h-1">
                              <div className={`h-1 rounded-full ${urg.bar}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-faint flex-shrink-0">{formatDate(fd.maturityDate)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* ── Top Performers ─────────────────────────────────────────────── */}
            <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
              <h3 className="text-content font-semibold text-sm mb-4">Top Performers</h3>
              {allEquity.length === 0 ? (
                <p className="text-faint text-sm">No equity investments yet.</p>
              ) : (
                <div className="space-y-2">
                  {topGainers.map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight size={16} className="text-success" />
                        <div>
                          <p className="text-content text-sm font-medium">{item.name}</p>
                          <p className="text-faint text-xs">{item.type}{isAll && item.owner ? ` · ${item.owner}` : ''}</p>
                        </div>
                      </div>
                      <span className="text-success font-semibold text-sm">+{item.pct.toFixed(2)}%</span>
                    </div>
                  ))}
                  {topLosers.slice(0, 2).map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-red-500/5 border border-red-500/10 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ArrowDownRight size={16} className="text-danger" />
                        <div>
                          <p className="text-content text-sm font-medium">{item.name}</p>
                          <p className="text-faint text-xs">{item.type}{isAll && item.owner ? ` · ${item.owner}` : ''}</p>
                        </div>
                      </div>
                      <span className="text-danger font-semibold text-sm">{item.pct.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Maturity cash-flow ladder */}
          <MaturityLadder data={data} memberIds={memberIds} />

          {/* Post Investments block */}
          {postList.length > 0 && (
            <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-warn" />
                  <div>
                    <h3 className="text-content font-semibold text-sm">Post Office Investments</h3>
                    <p className="text-faint text-xs mt-0.5">
                      {postList.length} scheme{postList.length !== 1 ? 's' : ''} · {formatCurrency(postInvested)} invested · +{formatCurrency(postInterest)} interest
                    </p>
                  </div>
                </div>
                <button onClick={() => navigate('/post')} className="text-xs text-accent hover:text-accent transition-colors">
                  Manage →
                </button>
              </div>

              {/* Summary strip */}
              <div className="grid grid-cols-3 gap-2 bg-surface2 rounded-xl p-3 mb-4">
                <div className="text-center">
                  <p className="text-faint text-xs">Total Principal</p>
                  <p className="text-content text-sm font-bold mt-0.5">{formatCurrency(postInvested)}</p>
                </div>
                <div className="text-center border-x border-edge">
                  <p className="text-faint text-xs">Total Maturity</p>
                  <p className="text-content text-sm font-bold mt-0.5">{formatCurrency(postMaturity)}</p>
                </div>
                <div className="text-center">
                  <p className="text-faint text-xs">Net Interest</p>
                  <p className="text-success text-sm font-bold mt-0.5">+{formatCurrency(postInterest)}</p>
                </div>
              </div>

              {/* Cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {sortedPost.map(p => {
                  const meta    = SCHEME_META[p.scheme];
                  const matured = isMatured(p.maturityDate);
                  const owner   = isAll ? data.members.find(m => m.id === p.memberId) : null;
                  const pct     = fdProgress(p.startDate, p.maturityDate);
                  const interest = p.maturityAmount - p.principal;
                  return (
                    <div key={p.id} className={`rounded-xl border p-3 space-y-2 ${meta.bg}`}>
                      {/* Row 1: Badge | Name | Rate | Status */}
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${meta.bg} ${meta.text} border ${meta.bg.split(' ')[1]} flex-shrink-0`}>
                          {meta.label}
                        </span>
                        <span className="text-muted text-xs truncate flex-1">{meta.desc}</span>
                        {owner && <span className="text-faint text-xs flex-shrink-0">{owner.name}</span>}
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${matured ? 'bg-surface2 text-muted' : 'bg-emerald-500/10 text-success'}`}>
                          {matured ? 'Done' : timeUntilDate(p.maturityDate)}
                        </span>
                      </div>

                      {/* Row 2: Account + Rate */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-faint">A/c <span className="text-muted font-mono">{p.accountNumber}</span></span>
                        <span className={`font-semibold ${meta.text}`}>{p.interestRate}% p.a.</span>
                      </div>

                      {/* Row 3: Amounts single line */}
                      <div className="flex items-baseline gap-1 text-xs">
                        <span className="text-content font-semibold">{formatCompact(p.principal)}</span>
                        <span className="text-faint">→</span>
                        <span className="text-content font-semibold">{formatCompact(p.maturityAmount)}</span>
                        <span className="text-success text-xs ml-0.5">(+{formatCompact(interest)})</span>
                      </div>

                      {/* Row 4: Date range + progress */}
                      <div>
                        <div className="flex items-center justify-between text-xs text-faint mb-1">
                          <span>{formatDate(p.startDate)}</span>
                          <span>{formatDate(p.maturityDate)}</span>
                        </div>
                        <div className="bg-surface2 rounded-full h-1">
                          <div className={`h-1 rounded-full ${meta.text.replace('text-', 'bg-')}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'FD Invested',   value: formatCurrency(fdInvested),   sub: `${fds.length} FD${fds.length !== 1 ? 's' : ''}`,                                                            color: 'text-accent',  nav: '/fd',     icon: Landmark   },
              { label: 'Stock Value',   value: formatCurrency(stockCurrent), sub: stockPL >= 0 ? `+${formatCurrency(stockPL)}` : formatCurrency(stockPL),                                       color: stockPL >= 0 ? 'text-success' : 'text-danger',   nav: '/stocks', icon: TrendingUp },
              { label: 'MF/SIP Value',  value: formatCurrency(mfCurrent),   sub: mfPL >= 0 ? `+${formatCurrency(mfPL)}` : formatCurrency(mfPL),                                                 color: mfPL >= 0 ? 'text-success' : 'text-danger',   nav: '/mf',     icon: BarChart3  },
              { label: 'PPF Balance',   value: formatCurrency(ppfAmount),    sub: 'EEE tax-free',   color: 'text-warn',  nav: '/ppf', icon: PiggyBank  },
              { label: 'EPF Balance',   value: formatCurrency(pfAmount),     sub: 'Retirement',     color: 'text-purple-400', nav: '/pf',  icon: Briefcase  },
            ].map(item => (
              <button key={item.label} onClick={() => navigate(item.nav)}
                className="bg-surface border border-edge rounded-2xl shadow-card p-4 text-left hover:border-edge hover:bg-surface transition-all group">
                <item.icon size={18} className={`${item.color} mb-2 group-hover:scale-110 transition-transform`} />
                <p className="text-muted text-xs font-medium">{item.label}</p>
                <p className="text-content font-bold text-sm mt-0.5">{item.value}</p>
                <p className={`text-xs mt-0.5 ${item.color}`}>{item.sub}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

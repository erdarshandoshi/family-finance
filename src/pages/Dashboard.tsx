import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Landmark, TrendingUp, BarChart3, PiggyBank, Briefcase,
  AlertTriangle, IndianRupee, Target, Wallet, ArrowUpRight, ArrowDownRight, Users,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, isMaturityThisMonth, daysUntilMaturity, isMatured } from '../utils/helpers';
import { ALL_MEMBERS_ID } from '../components/Layout/Header';
import KPICard from '../components/common/KPICard';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Legend,
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const MEMBER_COLORS = ['#6366f1', '#ec4899', '#f59e0b'];

export default function Dashboard() {
  const { data, activeMemberId } = useApp();
  const navigate = useNavigate();

  const isAll = activeMemberId === ALL_MEMBERS_ID;

  // Resolve which member IDs to include
  const memberIds = isAll ? data.members.map(m => m.id) : [activeMemberId];
  const member = data.members.find(m => m.id === activeMemberId);

  // Filtered data
  const fds     = data.fds.filter(f => memberIds.includes(f.memberId));
  const stocks  = data.stocks.filter(s => memberIds.includes(s.memberId));
  const mfs     = data.mfs.filter(m => memberIds.includes(m.memberId));
  const ppfList = data.ppf.filter(p => memberIds.includes(p.memberId));
  const pfList  = data.pf.filter(p => memberIds.includes(p.memberId));

  // FD stats
  const fdInvested        = fds.reduce((s, f) => s + f.amountInvested, 0);
  const fdMaturity        = fds.reduce((s, f) => s + f.maturityAmount, 0);
  const maturingThisMonth = fds.filter(f => isMaturityThisMonth(f.maturityDate));
  const maturingSoon      = fds.filter(f => !isMatured(f.maturityDate) && daysUntilMaturity(f.maturityDate) <= 30 && !isMaturityThisMonth(f.maturityDate));

  // Equity stats
  const stockInvested = stocks.reduce((s, st) => s + st.quantity * st.purchasePrice, 0);
  const stockCurrent  = stocks.reduce((s, st) => s + st.quantity * st.currentPrice, 0);
  const stockPL       = stockCurrent - stockInvested;

  const mfInvested = mfs.reduce((s, m) => s + m.quantity * m.purchasePrice, 0);
  const mfCurrent  = mfs.reduce((s, m) => s + m.quantity * m.currentPrice, 0);
  const mfPL       = mfCurrent - mfInvested;

  // Retirement
  const ppfAmount = ppfList.reduce((s, p) => s + p.currentAmount, 0);
  const pfAmount  = pfList.reduce((s, p) => s + p.currentAmount, 0);

  // Totals
  const totalPortfolio = fdMaturity + stockCurrent + mfCurrent + ppfAmount + pfAmount;
  const totalPL        = stockPL + mfPL;
  const totalPLPct     = (stockInvested + mfInvested) > 0 ? (totalPL / (stockInvested + mfInvested)) * 100 : 0;

  // Asset allocation pie
  const allocData = [
    { name: 'Fixed Deposits', value: fdMaturity },
    { name: 'Stocks',         value: stockCurrent },
    { name: 'Mutual Funds',   value: mfCurrent },
    { name: 'PPF',            value: ppfAmount },
    { name: 'PF/EPF',         value: pfAmount },
  ].filter(d => d.value > 0);

  // Per-member breakdown (only for "All Family" view)
  const memberBreakdown = data.members.map((m, i) => {
    const mFds     = data.fds.filter(f => f.memberId === m.id);
    const mStocks  = data.stocks.filter(s => s.memberId === m.id);
    const mMfs     = data.mfs.filter(mf => mf.memberId === m.id);
    const mPpf     = data.ppf.find(p => p.memberId === m.id);
    const mPf      = data.pf.find(p => p.memberId === m.id);
    return {
      name: m.name,
      color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      FDs:    mFds.reduce((s, f) => s + f.maturityAmount, 0),
      Stocks: mStocks.reduce((s, st) => s + st.quantity * st.currentPrice, 0),
      'MF/SIP': mMfs.reduce((s, mf) => s + mf.quantity * mf.currentPrice, 0),
      PPF:    mPpf?.currentAmount ?? 0,
      EPF:    mPf?.currentAmount ?? 0,
      total:  mFds.reduce((s, f) => s + f.maturityAmount, 0)
            + mStocks.reduce((s, st) => s + st.quantity * st.currentPrice, 0)
            + mMfs.reduce((s, mf) => s + mf.quantity * mf.currentPrice, 0)
            + (mPpf?.currentAmount ?? 0)
            + (mPf?.currentAmount ?? 0),
    };
  });

  // Top movers across selected members
  const allEquity = [
    ...stocks.map(s => {
      const m = data.members.find(mem => mem.id === s.memberId);
      return {
        name: s.stockName, type: 'Stock', owner: m?.name ?? '',
        pl:  s.quantity * s.currentPrice - s.quantity * s.purchasePrice,
        pct: ((s.currentPrice - s.purchasePrice) / s.purchasePrice) * 100,
      };
    }),
    ...mfs.map(mf => {
      const m = data.members.find(mem => mem.id === mf.memberId);
      return {
        name: mf.schemeName || mf.companyName, type: 'MF', owner: m?.name ?? '',
        pl:  mf.quantity * mf.currentPrice - mf.quantity * mf.purchasePrice,
        pct: ((mf.currentPrice - mf.purchasePrice) / mf.purchasePrice) * 100,
      };
    }),
  ];
  const topGainers = [...allEquity].sort((a, b) => b.pct - a.pct).slice(0, 3);
  const topLosers  = [...allEquity].sort((a, b) => a.pct - b.pct).filter(x => x.pct < 0).slice(0, 3);

  const categoryBar = [
    { name: 'FDs',    value: fdMaturity },
    { name: 'Stocks', value: stockCurrent },
    { name: 'MF/SIP', value: mfCurrent },
    { name: 'PPF',    value: ppfAmount },
    { name: 'EPF',    value: pfAmount },
  ].filter(d => d.value > 0);

  const isEmpty = allocData.length === 0;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          {isAll ? (
            <>
              <div className="flex items-center gap-2">
                <Users size={20} className="text-indigo-400" />
                <h2 className="text-2xl font-bold text-white">Family Portfolio</h2>
              </div>
              <p className="text-slate-400 text-sm mt-1">
                Combined view — {data.members.map(m => m.name).join(', ')} ·{' '}
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-white">Welcome back, {member?.name}</h2>
              <p className="text-slate-400 text-sm mt-1">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </>
          )}
        </div>
        {maturingThisMonth.length > 0 && (
          <button
            onClick={() => navigate('/fd')}
            className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-500/20 transition-colors"
          >
            <AlertTriangle size={16} />
            {maturingThisMonth.length} FD{maturingThisMonth.length > 1 ? 's' : ''} Maturing This Month
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard
          title={isAll ? 'Family Portfolio' : 'Total Portfolio'}
          value={formatCurrency(totalPortfolio)}
          subtitle={isAll ? `${data.members.length} members combined` : 'All asset classes'}
          icon={isAll ? Users : Wallet}
          iconColor="text-indigo-400"
          bgColor="bg-indigo-500/10"
        />
        <KPICard
          title="Total P&L (Equity)"
          value={formatCurrency(totalPL)}
          subtitle={`${totalPLPct >= 0 ? '+' : ''}${totalPLPct.toFixed(2)}% overall`}
          icon={totalPL >= 0 ? TrendingUp : ArrowDownRight}
          iconColor={totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}
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
          title="Retirement Corpus"
          value={formatCurrency(ppfAmount + pfAmount)}
          subtitle="PPF + EPF combined"
          icon={Target}
          iconColor="text-purple-400"
          bgColor="bg-purple-500/10"
        />
      </div>

      {isEmpty ? (
        <div className="text-center py-20 text-slate-500">
          <IndianRupee size={48} className="mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-semibold text-slate-400 mb-2">No investments yet</h3>
          <p className="text-sm">Start by adding Fixed Deposits, Stocks, or Mutual Funds.</p>
        </div>
      ) : (
        <>
          {/* Per-member breakdown — only in All Family view */}
          {isAll && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-indigo-400" />
                <h3 className="text-white font-semibold text-sm">Per-Member Breakdown</h3>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${data.members.length}, 1fr)` }}>
                {memberBreakdown.map((mb, i) => (
                  <div key={mb.name} className="bg-slate-700/40 rounded-xl p-4 border border-slate-600/40">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mb.color }} />
                      <span className="text-white font-semibold text-sm">{mb.name}</span>
                    </div>
                    <p className="text-2xl font-bold text-white mb-3">{formatCurrency(mb.total)}</p>
                    <div className="space-y-1.5">
                      {([['FDs', mb.FDs, 'text-blue-400'], ['Stocks', mb.Stocks, 'text-indigo-400'], ['MF/SIP', mb['MF/SIP'], 'text-emerald-400'], ['PPF', mb.PPF, 'text-amber-400'], ['EPF', mb.EPF, 'text-purple-400']] as [string, number, string][])
                        .filter(([, v]) => v > 0)
                        .map(([label, val, cls]) => (
                          <div key={label} className="flex justify-between text-xs">
                            <span className="text-slate-400">{label}</span>
                            <span className={`font-medium ${cls}`}>{formatCurrency(val)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Stacked bar comparison */}
              <div className="mt-5">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={[{ name: 'Portfolio' }]} layout="vertical" barSize={32}>
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      formatter={(v: number) => formatCurrency(v)}
                    />
                    <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12, color: '#94a3b8' }} />
                    {memberBreakdown.map(mb => (
                      <Bar key={mb.name} dataKey={mb.name} stackId="a" fill={mb.color} radius={[0, 0, 0, 0]}
                        data={[{ [mb.name]: mb.total }]} name={mb.name} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Row 1: Pie + Category Bar */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold text-sm mb-1">Asset Allocation</h3>
              <p className="text-slate-500 text-xs mb-4">
                {isAll ? 'Entire family · ' : ''}Portfolio distribution
              </p>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={allocData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {allocData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      formatter={(v: number) => formatCurrency(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {allocData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-300 text-xs flex-1">{item.name}</span>
                      <span className="text-white text-xs font-semibold">
                        {totalPortfolio > 0 ? ((item.value / totalPortfolio) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold text-sm mb-1">Category Breakdown</h3>
              <p className="text-slate-500 text-xs mb-4">Current value by asset class</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={categoryBar} barSize={28}>
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {categoryBar.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 2: FD Watch + Top Movers */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold text-sm mb-4">FD Maturity Watch</h3>
              {maturingThisMonth.length === 0 && maturingSoon.length === 0 && fds.length === 0 ? (
                <p className="text-slate-500 text-sm">No active FDs.</p>
              ) : (
                <div className="space-y-2">
                  {maturingThisMonth.map(fd => {
                    const fdMember = isAll ? data.members.find(m => m.id === fd.memberId) : null;
                    return (
                      <div key={fd.id} className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                        <div>
                          <p className="text-white text-sm font-medium">
                            {fd.bankName}
                            {fdMember && <span className="text-amber-400/70 text-xs ml-1">· {fdMember.name}</span>}
                          </p>
                          <p className="text-amber-400 text-xs">Matures this month</p>
                        </div>
                        <p className="text-amber-400 font-bold">{formatCurrency(fd.maturityAmount)}</p>
                      </div>
                    );
                  })}
                  {maturingSoon.map(fd => {
                    const fdMember = isAll ? data.members.find(m => m.id === fd.memberId) : null;
                    return (
                      <div key={fd.id} className="flex items-center justify-between bg-slate-700/50 rounded-xl px-3 py-2.5">
                        <div>
                          <p className="text-white text-sm font-medium">
                            {fd.bankName}
                            {fdMember && <span className="text-slate-500 text-xs ml-1">· {fdMember.name}</span>}
                          </p>
                          <p className="text-slate-400 text-xs">{daysUntilMaturity(fd.maturityDate)} days left</p>
                        </div>
                        <p className="text-white font-semibold">{formatCurrency(fd.maturityAmount)}</p>
                      </div>
                    );
                  })}
                  {maturingThisMonth.length === 0 && maturingSoon.length === 0 &&
                    fds.filter(f => !isMatured(f.maturityDate)).slice(0, 4).map(fd => {
                      const fdMember = isAll ? data.members.find(m => m.id === fd.memberId) : null;
                      return (
                        <div key={fd.id} className="flex items-center justify-between bg-slate-700/30 rounded-xl px-3 py-2">
                          <div>
                            <p className="text-slate-300 text-sm font-medium">
                              {fd.bankName}
                              {fdMember && <span className="text-slate-500 text-xs ml-1">· {fdMember.name}</span>}
                            </p>
                            <p className="text-slate-500 text-xs">{daysUntilMaturity(fd.maturityDate)} days left</p>
                          </div>
                          <p className="text-slate-300 font-semibold text-sm">{formatCurrency(fd.maturityAmount)}</p>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
              <h3 className="text-white font-semibold text-sm mb-4">Top Performers</h3>
              {allEquity.length === 0 ? (
                <p className="text-slate-500 text-sm">No equity investments yet.</p>
              ) : (
                <div className="space-y-2">
                  {topGainers.map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight size={16} className="text-emerald-400" />
                        <div>
                          <p className="text-white text-sm font-medium">{item.name}</p>
                          <p className="text-slate-500 text-xs">
                            {item.type}{isAll && item.owner ? ` · ${item.owner}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="text-emerald-400 font-semibold text-sm">+{item.pct.toFixed(2)}%</span>
                    </div>
                  ))}
                  {topLosers.slice(0, 2).map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-red-500/5 border border-red-500/10 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ArrowDownRight size={16} className="text-red-400" />
                        <div>
                          <p className="text-white text-sm font-medium">{item.name}</p>
                          <p className="text-slate-500 text-xs">
                            {item.type}{isAll && item.owner ? ` · ${item.owner}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="text-red-400 font-semibold text-sm">{item.pct.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Quick stat tiles */}
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'FD Invested',  value: formatCurrency(fdInvested),  sub: `${fds.length} FD${fds.length !== 1 ? 's' : ''}`, color: 'text-indigo-400',  nav: '/fd',     icon: Landmark  },
              { label: 'Stock Value',  value: formatCurrency(stockCurrent), sub: stockPL >= 0 ? `+${formatCurrency(stockPL)}` : formatCurrency(stockPL), color: stockPL >= 0 ? 'text-emerald-400' : 'text-red-400', nav: '/stocks', icon: TrendingUp },
              { label: 'MF/SIP Value', value: formatCurrency(mfCurrent),   sub: mfPL >= 0 ? `+${formatCurrency(mfPL)}` : formatCurrency(mfPL),           color: mfPL >= 0 ? 'text-emerald-400' : 'text-red-400',   nav: '/mf',     icon: BarChart3  },
              { label: 'PPF Balance',  value: formatCurrency(ppfAmount),   sub: 'EEE tax-free', color: 'text-amber-400',  nav: '/ppf', icon: PiggyBank },
              { label: 'EPF Balance',  value: formatCurrency(pfAmount),    sub: 'Retirement',   color: 'text-purple-400', nav: '/pf',  icon: Briefcase },
            ].map(item => (
              <button key={item.label} onClick={() => navigate(item.nav)}
                className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 text-left hover:border-slate-600 hover:bg-slate-800 transition-all group">
                <item.icon size={18} className={`${item.color} mb-2 group-hover:scale-110 transition-transform`} />
                <p className="text-slate-400 text-xs font-medium">{item.label}</p>
                <p className="text-white font-bold text-sm mt-0.5">{item.value}</p>
                <p className={`text-xs mt-0.5 ${item.color}`}>{item.sub}</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

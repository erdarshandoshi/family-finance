import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';
import type { AppData } from '../../types';
import { estimatedNetWorthSeries } from '../../utils/finance';
import { useChartTheme, inrAxis } from '../../utils/chartTheme';
import { formatCurrency } from '../../utils/helpers';

interface Props {
  data: AppData;
  memberIds: string[];
  currentTotal: number;
}

type Range = '3M' | '6M' | '1Y' | '3Y' | 'All';
const RANGES: Range[] = ['3M', '6M', '1Y', '3Y', 'All'];

function monthsBack(n: number): string {
  const d = new Date(); d.setMonth(d.getMonth() - n); d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function NetWorthTrend({ data, memberIds, currentTotal }: Props) {
  const [range, setRange] = useState<Range>('1Y');
  const ct = useChartTheme();

  const points = useMemo(() => {
    const est = estimatedNetWorthSeries(data, memberIds);
    const byMonth = new Map<string, number>();
    for (const p of est) byMonth.set(p.month, p.total);

    // Overlay real snapshots (they take precedence for their month)
    for (const s of data.snapshots ?? []) {
      const key = `${s.date.slice(0, 7)}-01`;
      byMonth.set(key, s.total);
    }
    // Anchor the current month to today's exact total
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    if (currentTotal > 0) byMonth.set(curKey, currentTotal);

    return [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, value]) => ({
        month,
        value,
        label: new Date(month + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      }));
  }, [data, memberIds, currentTotal]);

  const cutoff = range === 'All' ? '0000'
    : range === '3M' ? monthsBack(3)
    : range === '6M' ? monthsBack(6)
    : range === '1Y' ? monthsBack(12)
    : monthsBack(36);
  const shown = points.filter(p => p.month >= cutoff);

  const first = shown[0]?.value ?? 0;
  const last = shown[shown.length - 1]?.value ?? 0;
  const change = last - first;
  const changePct = first > 0 ? (change / first) * 100 : 0;
  const up = change >= 0;
  const realCount = (data.snapshots ?? []).length;

  if (points.length < 2) return null;

  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <div>
          <h3 className="text-content font-semibold text-sm">Net Worth Trend</h3>
          <p className="text-faint text-xs mt-0.5">
            {formatCurrency(last)} now · <span className={up ? 'text-success' : 'text-danger'}>
              {up ? '+' : ''}{formatCurrency(change)} ({up ? '+' : ''}{changePct.toFixed(1)}%)
            </span> over range
          </p>
        </div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                range === r ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-surface border-edge text-muted hover:text-content'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={230}>
        <AreaChart data={shown} margin={{ left: 4, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={up ? ct.positive : ct.negative} stopOpacity={0.3} />
              <stop offset="100%" stopColor={up ? ct.positive : ct.negative} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: ct.axis, fontSize: 11 }} axisLine={false} tickLine={false}
            interval="preserveStartEnd" minTickGap={32} />
          <YAxis tick={{ fill: ct.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={52}
            tickFormatter={inrAxis} />
          <Tooltip contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItem} labelStyle={ct.tooltipLabel}
            formatter={(v: unknown) => [formatCurrency(v as number), 'Net worth']} />
          {first > 0 && <ReferenceLine y={first} stroke={ct.grid} strokeDasharray="4 4" />}
          <Area type="monotone" dataKey="value" stroke={up ? ct.positive : ct.negative} strokeWidth={2}
            fill="url(#nwGrad)" />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-1.5 mt-2 text-faint text-xs">
        {up ? <TrendingUp size={12} className="text-success" /> : <TrendingDown size={12} className="text-danger" />}
        <Info size={11} />
        <span>
          {realCount >= 2
            ? `${realCount} monthly snapshots recorded — trend gets more exact each month.`
            : 'Estimated from your holdings; becomes exact as monthly snapshots are recorded.'}
        </span>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CalendarClock } from 'lucide-react';
import type { AppData } from '../../types';
import { maturityLadder } from '../../utils/finance';
import { useChartTheme, inrAxis } from '../../utils/chartTheme';
import { formatCurrency } from '../../utils/helpers';

interface Props { data: AppData; memberIds: string[]; }

export default function MaturityLadder({ data, memberIds }: Props) {
  const ct = useChartTheme();
  const buckets = useMemo(() => maturityLadder(data, memberIds, 24), [data, memberIds]);
  if (buckets.length === 0) return null;

  const total = buckets.reduce((s, b) => s + b.total, 0);
  const next = buckets[0];

  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-accent" />
          <div>
            <h3 className="text-content font-semibold text-sm">Maturity Cash-Flow Ladder</h3>
            <p className="text-faint text-xs mt-0.5">
              {formatCurrency(total)} maturing over next 24 months · next: {next.label} ({formatCurrency(next.total)})
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ct.series[0] }} />FD</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: ct.series[3] }} />Post</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={buckets} margin={{ left: 4, right: 8 }} barSize={18}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: ct.axis, fontSize: 11 }} axisLine={false} tickLine={false}
            interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={{ fill: ct.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={48}
            tickFormatter={inrAxis} />
          <Tooltip contentStyle={ct.tooltipStyle} itemStyle={ct.tooltipItem} labelStyle={ct.tooltipLabel}
            cursor={{ fill: ct.grid, opacity: 0.3 }}
            formatter={(v: unknown, name: unknown) => [formatCurrency(v as number), name as string]} />
          <Bar dataKey="fd"   stackId="m" name="FD"   fill={ct.series[0]} radius={[0, 0, 0, 0]} />
          <Bar dataKey="post" stackId="m" name="Post" fill={ct.series[3]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

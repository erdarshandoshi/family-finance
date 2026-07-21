import { useMemo } from 'react';
import { PieChart as PieIcon } from 'lucide-react';
import { diversification } from '../../utils/finance';

interface Props { alloc: { name: string; value: number }[]; }

export default function DiversificationCard({ alloc }: Props) {
  const d = useMemo(() => diversification(alloc), [alloc]);
  const color = d.score >= 70 ? '#059669' : d.score >= 40 ? '#d97706' : '#dc2626';
  const r = 30, circ = 2 * Math.PI * r;

  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <PieIcon size={16} className="text-accent" />
        <h3 className="text-content font-semibold text-sm">Diversification</h3>
      </div>
      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
          <svg width={80} height={80} className="-rotate-90">
            <circle cx={40} cy={40} r={r} fill="none" stroke="rgb(var(--surface-3))" strokeWidth={8} />
            <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ - (circ * d.score) / 100} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-content font-bold text-lg leading-none">{d.score}</span>
            <span className="text-faint text-[10px]">/ 100</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="font-semibold text-sm" style={{ color }}>{d.label}</p>
          <p className="text-muted text-xs">
            Spread across <span className="text-content font-medium">{d.effectiveClasses}</span> effective asset classes.
          </p>
          <p className="text-muted text-xs">
            Largest: <span className="text-content font-medium">{d.topName}</span> at{' '}
            <span className={d.topPct > 60 ? 'text-warn font-medium' : 'text-content font-medium'}>{d.topPct.toFixed(0)}%</span>
            {d.topPct > 60 && ' — consider rebalancing.'}
          </p>
        </div>
      </div>
    </div>
  );
}

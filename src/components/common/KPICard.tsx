import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor: string;
  bgColor: string;
  trend?: { value: string; positive: boolean };
}

export default function KPICard({ title, value, subtitle, icon: Icon, iconColor, bgColor, trend }: KPICardProps) {
  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-5 hover:border-edge transition-all hover:bg-surface">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-muted text-sm font-medium truncate">{title}</p>
          <p className="text-content text-xl font-bold mt-1 leading-tight break-words">{value}</p>
          {subtitle && <p className="text-faint text-xs mt-1">{subtitle}</p>}
          {trend && (
            <div className={`inline-flex items-center gap-1 mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${
              trend.positive ? 'bg-emerald-500/10 text-success' : 'bg-red-500/10 text-danger'
            }`}>
              {trend.positive ? '▲' : '▼'} {trend.value}
            </div>
          )}
        </div>
        <div className={`${bgColor} p-3 rounded-xl flex-shrink-0 ml-3`}>
          <Icon size={22} className={iconColor} />
        </div>
      </div>
    </div>
  );
}

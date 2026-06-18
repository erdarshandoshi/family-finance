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
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 hover:border-slate-600 transition-all hover:bg-slate-800">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-slate-400 text-sm font-medium truncate">{title}</p>
          <p className="text-white text-2xl font-bold mt-1 truncate">{value}</p>
          {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
          {trend && (
            <div className={`inline-flex items-center gap-1 mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${
              trend.positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
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

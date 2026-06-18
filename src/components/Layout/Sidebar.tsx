import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Landmark,
  TrendingUp,
  BarChart3,
  PiggyBank,
  Briefcase,
  IndianRupee,
} from 'lucide-react';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/fd', label: 'Fixed Deposits', icon: Landmark },
  { to: '/stocks', label: 'Stocks', icon: TrendingUp },
  { to: '/mf', label: 'Mutual Funds & SIP', icon: BarChart3 },
  { to: '/ppf', label: 'PPF', icon: PiggyBank },
  { to: '/pf', label: 'Provident Fund', icon: Briefcase },
];

export default function Sidebar() {
  return (
    <aside className="w-64 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl">
            <IndianRupee size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">Family Finance</h1>
            <p className="text-slate-500 text-xs">Portfolio Manager</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <p className="text-slate-600 text-xs text-center">Data stored locally</p>
      </div>
    </aside>
  );
}

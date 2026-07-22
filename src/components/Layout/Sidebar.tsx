import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Landmark, TrendingUp, BarChart3,
  PiggyBank, Briefcase, IndianRupee, X, BarChart2,
  Shield, Package, Users, Building2, BookHeart, KeyRound,
  Inbox, FolderKey,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

const nav = [
  { to: '/',               label: 'Dashboard',        icon: LayoutDashboard },
  { to: '/fd',             label: 'Fixed Deposits',    icon: Landmark },
  { to: '/stocks',         label: 'Stocks',            icon: TrendingUp },
  { to: '/stocks/reports', label: 'Stocks & Reports',  icon: BarChart2 },
  { to: '/mf',             label: 'Mutual Funds & SIP',icon: BarChart3 },
  { to: '/inbox',          label: 'Review Inbox',      icon: Inbox },
  { to: '/folios',         label: 'Folio Registry',    icon: FolderKey },
  { to: '/ppf',            label: 'PPF',               icon: PiggyBank },
  { to: '/pf',             label: 'Provident Fund',    icon: Briefcase },
  { to: '/insurance',      label: 'Insurance',         icon: Shield },
  { to: '/post',           label: 'Post Investments',  icon: Package },
  { to: '/nps',            label: 'NPS',               icon: Building2 },
  { to: '/journal',        label: 'Baby Journal',      icon: BookHeart },
  { to: '/vault',          label: 'Password Vault',    icon: KeyRound },
  { to: '/access',         label: 'User Access',       icon: Users },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { data } = useApp();
  const pendingCount = data.pendingTransactions?.length ?? 0;

  return (
    <aside className={`
      fixed lg:relative inset-y-0 left-0 z-50
      w-64 flex-shrink-0 bg-surface border-r border-edge flex flex-col
      transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
    `}>
      {/* Header */}
      <div className="p-5 border-b border-edge flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl">
            <IndianRupee size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-content font-bold text-base leading-tight">Family Finance</h1>
            <p className="text-faint text-xs">Portfolio Manager</p>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 text-faint hover:text-content hover:bg-surface rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/' || to === '/stocks'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600/20 text-accent border border-indigo-600/30'
                  : 'text-muted hover:text-content hover:bg-surface'
              }`
            }
          >
            <Icon size={18} />
            <span className="flex-1">{label}</span>
            {to === '/inbox' && pendingCount > 0 && (
              <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-semibold">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-edge">
        <p className="text-faint text-xs text-center">Data synced to cloud</p>
      </div>
    </aside>
  );
}

import { NavLink } from 'react-router-dom';
import { LayoutDashboard, TrendingUp, BarChart3, KeyRound, Menu } from 'lucide-react';

interface BottomNavProps {
  onMore: () => void;
}

const items = [
  { to: '/',       label: 'Home',   icon: LayoutDashboard, end: true },
  { to: '/stocks', label: 'Stocks', icon: TrendingUp,      end: true },
  { to: '/mf',     label: 'Funds',  icon: BarChart3,       end: false },
  { to: '/vault',  label: 'Vault',  icon: KeyRound,        end: false },
];

// App-style bottom tab bar — mobile only. Brand indigo chrome, lifted clear of
// the device's home indicator via safe-area padding. "More" opens the sidebar.
export default function BottomNav({ onMore }: BottomNavProps) {
  const itemCls = (active: boolean) =>
    `flex-1 flex flex-col items-center justify-center gap-1 pt-2.5 pb-2 min-h-[58px] text-[11px] font-medium transition-colors ${
      active ? 'text-white' : 'text-white/65 hover:text-white'
    }`;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-gradient-to-r from-indigo-600 to-indigo-500 border-t border-white/10 shadow-[0_-4px_16px_rgba(0,0,0,0.18)] flex items-stretch"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => itemCls(isActive)}>
          {({ isActive }) => (
            <>
              <span className={`flex items-center justify-center w-9 h-7 rounded-lg transition-colors ${isActive ? 'bg-white/20' : ''}`}>
                <Icon size={20} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
      <button onClick={onMore} className={itemCls(false)}>
        <span className="flex items-center justify-center w-9 h-7 rounded-lg">
          <Menu size={20} />
        </span>
        More
      </button>
    </nav>
  );
}

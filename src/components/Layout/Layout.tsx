import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const { data, defaultMemberId, setActiveMemberId } = useApp();

  // Per-page default member tab: the Stocks pages (only Niyati holds stocks)
  // land on Niyati; every other page resets to the logged-in user's default.
  useEffect(() => {
    const isStocksSection = pathname === '/stocks' || pathname.startsWith('/stocks/');
    if (isStocksSection) {
      const niyati =
        data.members.find(m => m.name.trim().toLowerCase() === 'niyati') ??
        data.members.find(m => m.relation === 'wife');
      if (niyati) setActiveMemberId(niyati.id);
    } else {
      setActiveMemberId(defaultMemberId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(o => !o)} />
        {/* pb-20 on mobile keeps content clear of the bottom tab bar */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-28 lg:pb-6">
          <Outlet />
        </main>
      </div>

      <BottomNav onMore={() => setSidebarOpen(true)} />
    </div>
  );
}

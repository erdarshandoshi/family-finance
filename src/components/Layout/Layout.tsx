import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useApp } from '../../context/AppContext';
import { generateId } from '../../utils/helpers';
import type { PendingTransaction } from '../../types';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const { data, dispatch, defaultMemberId, setActiveMemberId } = useApp();

  // Drain Gmail-ingested SIPs: /api/ingest-sip writes to the isolated `sipInbox`
  // collection (via Admin SDK). Here we move each into the app's local pending queue
  // — which the Review Inbox already renders — then remove the transient server doc.
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'sipInbox'),
      snap => {
        snap.forEach(d => {
          const s = d.data();
          const payload: PendingTransaction = {
            id: generateId(),
            source: s.source === 'sms' ? 'sms' : 'gmail',
            externalId: s.externalId ?? `${s.folioNumber}|${s.installmentDate}|${s.amount}`,
            folioNumber: s.folioNumber,
            amc: s.amc,
            schemeName: s.schemeName,
            schemeCode: s.schemeCode ?? undefined,
            memberId: s.memberId ?? undefined,
            guardianMemberId: s.guardianMemberId ?? undefined,
            amount: s.amount,
            installmentDate: s.installmentDate,
            estimatedUnits: s.estimatedUnits ?? undefined,
            estimatedNav: s.estimatedNav ?? undefined,
            navDate: s.navDate ?? undefined,
            isSIP: s.isSIP ?? true,
            createdAt: s.createdAt ?? new Date().toISOString(),
            warnings: s.warnings ?? [],
            gmailAccount: s.gmailAccount ?? undefined,
          };
          dispatch({ type: 'ADD_PENDING', payload });          // reducer dedupes by fingerprint
          deleteDoc(doc(db, 'sipInbox', d.id)).catch(() => {}); // hand-off complete
        });
      },
      () => {/* sipInbox rules not set / offline — ignore quietly */},
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
import type { MutualFund } from '../../types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ymOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Month calendar of purchase dates — makes SIP debit days and the initial
 * top-up obvious at a glance. Tap a marked day to filter the list below it.
 */
export default function SIPCalendar({ mfs }: { mfs: MutualFund[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1); d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const ym = ymOf(cursor);
  const todayIso = new Date().toISOString().slice(0, 10);

  // Lots falling in the displayed month, grouped by day-of-month
  const { monthLots, byDay, monthTotal } = useMemo(() => {
    const lots = mfs
      .filter(m => (m.dateOfPurchase ?? '').startsWith(ym))
      .sort((a, b) => a.dateOfPurchase.localeCompare(b.dateOfPurchase));
    const map = new Map<number, MutualFund[]>();
    for (const l of lots) {
      const day = Number(l.dateOfPurchase.slice(8, 10));
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(l);
    }
    const total = lots.reduce((s, l) => s + l.quantity * l.purchasePrice, 0);
    return { monthLots: lots, byDay: map, monthTotal: total };
  }, [mfs, ym]);

  const firstWeekday = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const shiftMonth = (delta: number) => {
    setSelectedDay(null);
    setCursor(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const visible = selectedDay
    ? monthLots.filter(l => l.dateOfPurchase === selectedDay)
    : monthLots;

  const monthLabel = cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Month navigator */}
      <div className="bg-surface border border-edge rounded-2xl shadow-card p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month"
            className="p-2 rounded-lg text-muted hover:text-content hover:bg-surface2 transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-content font-semibold text-sm">{monthLabel}</p>
            <p className="text-faint text-xs mt-0.5">
              {monthLots.length === 0
                ? 'No purchases'
                : `${monthLots.length} purchase${monthLots.length !== 1 ? 's' : ''} · ${formatCurrency(monthTotal)}`}
            </p>
          </div>
          <button onClick={() => shiftMonth(1)} aria-label="Next month"
            className="p-2 rounded-lg text-muted hover:text-content hover:bg-surface2 transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="text-center text-faint text-xs font-medium py-1">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const iso = `${ym}-${String(day).padStart(2, '0')}`;
            const lots = byDay.get(day);
            const hasInitial = lots?.some(l => l.isInitialPayment);
            const isToday = iso === todayIso;
            const isSelected = selectedDay === iso;

            return (
              <button
                key={day}
                disabled={!lots}
                onClick={() => setSelectedDay(isSelected ? null : iso)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                  isSelected ? 'bg-indigo-600 text-white'
                  : lots ? 'bg-indigo-500/10 text-content hover:bg-indigo-500/20'
                  : 'text-faint'
                } ${isToday && !isSelected ? 'ring-1 ring-inset ring-indigo-500/60' : ''}`}
              >
                <span className={lots ? 'font-semibold' : ''}>{day}</span>
                {lots && (
                  <span className="flex items-center gap-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-white' : hasInitial ? 'bg-amber-400' : 'bg-indigo-400'
                    }`} />
                    {lots.length > 1 && (
                      <span className={`text-[9px] ${isSelected ? 'text-white' : 'text-faint'}`}>{lots.length}</span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-edge">
          <span className="flex items-center gap-1.5 text-faint text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> Instalment
          </span>
          <span className="flex items-center gap-1.5 text-faint text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Initial payment
          </span>
        </div>
      </div>

      {/* Day / month detail */}
      {monthLots.length === 0 ? (
        <div className="text-center py-10 text-faint">
          <CalendarDays size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nothing purchased in {monthLabel}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs font-semibold uppercase tracking-wide">
              {selectedDay
                ? new Date(selectedDay).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                : monthLabel}
            </p>
            {selectedDay && (
              <button onClick={() => setSelectedDay(null)}
                className="text-accent text-xs hover:underline">Show whole month</button>
            )}
          </div>

          {visible.map(l => {
            const invested = l.quantity * l.purchasePrice;
            return (
              <div key={l.id} className="bg-surface border border-edge rounded-xl p-3 flex items-start gap-3">
                {/* Date chip */}
                <div className="flex-shrink-0 w-11 rounded-lg bg-surface2 py-1.5 text-center">
                  <p className="text-content text-sm font-bold leading-none">{Number(l.dateOfPurchase.slice(8, 10))}</p>
                  <p className="text-faint text-xs mt-0.5">
                    {new Date(l.dateOfPurchase).toLocaleDateString('en-IN', { month: 'short' })}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-content text-xs font-medium leading-snug line-clamp-2">
                      {l.schemeName || l.companyName || '—'}
                    </p>
                    <p className="text-content text-sm font-semibold flex-shrink-0">{formatCurrency(invested)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {l.isInitialPayment ? (
                      <span className="bg-amber-500/15 text-warn px-1.5 py-0.5 rounded text-xs font-medium">Initial</span>
                    ) : (
                      <span className={`px-1.5 py-0.5 rounded text-xs ${l.isSIP ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                        {l.isSIP ? 'SIP' : 'Lump'}
                      </span>
                    )}
                    <span className="text-faint text-xs">
                      {l.quantity.toFixed(3)} units @ ₹{l.purchasePrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

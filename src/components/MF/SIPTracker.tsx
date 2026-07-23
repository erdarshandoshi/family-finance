import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, AlertTriangle, Repeat, CalendarClock } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/helpers';
import type { MutualFund, FamilyMember } from '../../types';
import type { MFGroup } from '../../utils/mfUtils';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_FULL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ordinal = (d: number) => {
  const s = ['th', 'st', 'nd', 'rd'][(d % 100 - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][d % 100] ?? 'th';
  return `${d}${s}`;
};

/** SIPs run for years — let the schedule be browsed well beyond the data we hold. */
const LAST_YEAR = 2045;

interface MonthCell {
  month: number;
  lots: MutualFund[];
  invested: number;
  hasInitial: boolean;
  missed: boolean;      // inside the active run but nothing landed
  future: boolean;
  projected: boolean;   // no instalment yet, but one is expected on the usual day
}

/**
 * Per-fund SIP contribution tracker: a year of month cells ticked where an instalment
 * landed, so the rhythm — and any missed debit — is obvious at a glance.
 */
export default function SIPTracker({ groups, members }: { groups: MFGroup[]; members: FamilyMember[] }) {
  const sipGroups = groups.filter(g => g.isSIP);

  if (sipGroups.length === 0) {
    return (
      <div className="text-center py-16 text-faint">
        <Repeat size={40} className="mx-auto mb-3 opacity-30" />
        <p>No SIPs yet. Add a fund as a SIP to track its instalments here.</p>
      </div>
    );
  }

  // Portfolio-level summary
  const thisMonth = new Date().toISOString().slice(0, 7);
  const dueThisMonth = sipGroups.filter(g => g.lots.some(l => l.dateOfPurchase?.startsWith(thisMonth)));
  const monthlyOutflow = sipGroups.reduce((sum, g) => {
    const recurring = g.lots.filter(l => !l.isInitialPayment);
    const latest = [...recurring].sort((a, b) => b.dateOfPurchase.localeCompare(a.dateOfPurchase))[0];
    return sum + (latest ? latest.quantity * latest.purchasePrice : 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Active SIPs', value: String(sipGroups.length) },
          { label: 'Approx. monthly', value: formatCurrency(monthlyOutflow) },
          { label: 'Debited this month', value: `${dueThisMonth.length}/${sipGroups.length}` },
        ].map(s => (
          <div key={s.label} className="bg-surface border border-edge rounded-2xl shadow-card p-3 text-center">
            <p className="text-faint text-xs">{s.label}</p>
            <p className="text-content font-bold text-sm mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {sipGroups.map(g => <FundTrack key={g.key} group={g} members={members} />)}
    </div>
  );
}

function FundTrack({ group, members }: { group: MFGroup; members: FamilyMember[] }) {
  const lots = useMemo(
    () => [...group.lots].sort((a, b) => a.dateOfPurchase.localeCompare(b.dateOfPurchase)),
    [group.lots],
  );

  // Years that hold instalments — used for the quick-jump chips
  const dataYears = useMemo(
    () => [...new Set(lots.map(l => Number(l.dateOfPurchase.slice(0, 4))))].sort(),
    [lots],
  );
  const thisYear = new Date().getFullYear();
  const firstYear = dataYears[0] ?? thisYear;
  const [year, setYear] = useState(() => dataYears[dataYears.length - 1] ?? thisYear);
  const [openMonth, setOpenMonth] = useState<number | null>(null);

  const now = new Date();
  const memberName = (id?: string) => members.find(m => m.id === id)?.name;

  // The day the SIP usually lands on — the most common day across recurring lots
  const sipDay = useMemo(() => {
    const counts = new Map<number, number>();
    lots.filter(l => !l.isInitialPayment).forEach(l => {
      const d = Number(l.dateOfPurchase.slice(8, 10));
      counts.set(d, (counts.get(d) ?? 0) + 1);
    });
    let best: number | null = null, bestN = 0;
    counts.forEach((n, d) => { if (n > bestN) { bestN = n; best = d; } });
    return best;
  }, [lots]);

  const cells: MonthCell[] = useMemo(() => {
    const inYear = lots.filter(l => l.dateOfPurchase.startsWith(String(year)));
    const monthsWith = new Set(inYear.map(l => Number(l.dateOfPurchase.slice(5, 7)) - 1));
    const firstIdx = monthsWith.size ? Math.min(...monthsWith) : -1;
    // The run stays "active" to today (or year end for past years)
    const lastActive = year < now.getFullYear() ? 11
      : year > now.getFullYear() ? -1
      : now.getMonth();

    // Once a rhythm is established, every later month is expected until the SIP stops
    const started = lots.length > 0 ? new Date(lots[0].dateOfPurchase) : null;

    return Array.from({ length: 12 }, (_, m) => {
      const monthLots = inYear.filter(l => Number(l.dateOfPurchase.slice(5, 7)) - 1 === m);
      const future = year > now.getFullYear() || (year === now.getFullYear() && m > now.getMonth());
      const afterStart = !!started
        && (year > started.getFullYear() || (year === started.getFullYear() && m >= started.getMonth()));
      return {
        month: m,
        lots: monthLots,
        invested: monthLots.reduce((s, l) => s + l.quantity * l.purchasePrice, 0),
        hasInitial: monthLots.some(l => l.isInitialPayment),
        missed: monthLots.length === 0 && firstIdx !== -1 && m > firstIdx && m <= lastActive,
        future,
        projected: monthLots.length === 0 && future && afterStart && sipDay != null,
      };
    });
  }, [lots, year, now, sipDay]);

  const yearLots = lots.filter(l => l.dateOfPurchase.startsWith(String(year)));
  const done = cells.filter(c => c.lots.length > 0).length;
  const missedCount = cells.filter(c => c.missed).length;
  const latest = lots[lots.length - 1];

  // Project the next debit from the usual day
  const nextDue = useMemo(() => {
    if (!sipDay || !latest) return null;
    const d = new Date(latest.dateOfPurchase);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(sipDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d > now ? d : null;
  }, [sipDay, latest, now]);

  const open = openMonth != null ? cells[openMonth] : null;

  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
      {/* Fund header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-content font-semibold text-sm leading-snug">{group.schemeName || group.companyName}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap text-xs">
            {memberName(group.memberId) && <span className="text-accent">{memberName(group.memberId)}</span>}
            {group.guardianMemberId && (
              <span className="text-faint">· Held by {memberName(group.guardianMemberId) ?? '—'}</span>
            )}
            {sipDay && (
              <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-full">
                {ordinal(sipDay)} monthly
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-content font-bold text-sm">{lots.length}</p>
          <p className="text-faint text-xs">instalments</p>
        </div>
      </div>

      {/* Year strip — browsable all the way to 2045, not just years with data */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setYear(y => Math.max(firstYear, y - 1))}
            disabled={year <= firstYear}
            className="p-1 rounded text-muted hover:text-content disabled:opacity-25 transition-colors"
            aria-label="Previous year"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-content text-sm font-semibold tabular-nums w-11 text-center">{year}</span>
          <button
            onClick={() => setYear(y => Math.min(LAST_YEAR, y + 1))}
            disabled={year >= LAST_YEAR}
            className="p-1 rounded text-muted hover:text-content disabled:opacity-25 transition-colors"
            aria-label="Next year"
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <p className="text-faint text-xs">
          {done} paid{missedCount > 0 && <span className="text-warn"> · {missedCount} missed</span>}
          {done === 0 && cells.some(c => c.projected) && <span className="text-muted">scheduled</span>}
        </p>
      </div>

      {/* Quick jump between years that actually hold instalments */}
      {dataYears.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 -mx-1 px-1">
          {dataYears.map(y => (
            <button key={y} onClick={() => { setYear(y); setOpenMonth(null); }}
              className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                y === year ? 'bg-indigo-600 text-white' : 'bg-surface2 text-muted hover:text-content'
              }`}>
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Month ticks — 2 rows on mobile, one on desktop */}
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
        {cells.map(c => {
          const paid = c.lots.length > 0;
          const selected = openMonth === c.month;
          return (
            <button
              key={c.month}
              disabled={!paid}
              onClick={() => setOpenMonth(selected ? null : c.month)}
              title={paid ? `${MONTH_FULL[c.month]} — ${formatCurrency(c.invested)}` : MONTH_FULL[c.month]}
              className={`rounded-lg py-1.5 flex flex-col items-center gap-0.5 transition-colors ${
                selected ? 'bg-indigo-600 text-white'
                : paid ? (c.hasInitial ? 'bg-amber-500/15 text-warn' : 'bg-emerald-500/15 text-success')
                : c.missed ? 'bg-red-500/10 text-danger'
                : c.projected ? 'border border-dashed border-edge text-faint'
                : c.future ? 'bg-surface2 text-faint opacity-50'
                : 'bg-surface2 text-faint'
              }`}
            >
              <span className="text-xs font-medium">{MONTHS[c.month]}</span>
              {paid
                ? <Check size={13} strokeWidth={3} />
                : c.missed
                  ? <AlertTriangle size={11} />
                  : c.projected && sipDay
                    ? <span className="text-[9px] leading-none tabular-nums">{sipDay}</span>
                    : <span className="w-1 h-1 rounded-full bg-current opacity-40" />}
            </button>
          );
        })}
      </div>

      {/* Tapped month detail */}
      {open && open.lots.length > 0 && (
        <div className="bg-surface2 rounded-xl p-3 space-y-1.5">
          <p className="text-faint text-xs font-semibold uppercase tracking-wide">
            {MONTH_FULL[open.month]} {year}
          </p>
          {open.lots.map(l => (
            <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted">
                {formatDate(l.dateOfPurchase)}
                {l.isInitialPayment && (
                  <span className="ml-1.5 bg-amber-500/15 text-warn px-1.5 py-0.5 rounded">Initial</span>
                )}
              </span>
              <span className="text-content font-medium">
                {formatCurrency(l.quantity * l.purchasePrice)}
                <span className="text-faint ml-1.5">{l.quantity.toFixed(3)} @ ₹{l.purchasePrice.toFixed(2)}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Legend — only where it earns its space */}
      {cells.some(c => c.projected || c.missed) && (
        <div className="flex items-center gap-3 flex-wrap text-xs text-faint">
          <span className="flex items-center gap-1"><Check size={10} strokeWidth={3} className="text-success" /> paid</span>
          {cells.some(c => c.missed) && (
            <span className="flex items-center gap-1"><AlertTriangle size={10} className="text-danger" /> missed</span>
          )}
          {cells.some(c => c.projected) && (
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded border border-dashed border-edge" /> scheduled {sipDay ? ordinal(sipDay) : ''}
            </span>
          )}
        </div>
      )}

      {/* Footer totals */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-edge text-xs">
        <span className="text-faint">
          {year}: <span className="text-content font-medium">{formatCurrency(yearLots.reduce((s, l) => s + l.quantity * l.purchasePrice, 0))}</span>
        </span>
        {nextDue
          ? <span className="text-muted flex items-center gap-1"><CalendarClock size={12} /> next {formatDate(nextDue.toISOString().slice(0, 10))}</span>
          : latest && <span className="text-faint">last {formatDate(latest.dateOfPurchase)}</span>}
      </div>
    </div>
  );
}

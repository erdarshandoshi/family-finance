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

interface MonthCell {
  month: number;
  lots: MutualFund[];
  invested: number;
  hasInitial: boolean;
  missed: boolean;      // inside the active run but nothing landed
  future: boolean;
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

  const years = useMemo(
    () => [...new Set(lots.map(l => Number(l.dateOfPurchase.slice(0, 4))))].sort(),
    [lots],
  );
  const [year, setYear] = useState(() => years[years.length - 1] ?? new Date().getFullYear());
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

    return Array.from({ length: 12 }, (_, m) => {
      const monthLots = inYear.filter(l => Number(l.dateOfPurchase.slice(5, 7)) - 1 === m);
      const future = year > now.getFullYear() || (year === now.getFullYear() && m > now.getMonth());
      return {
        month: m,
        lots: monthLots,
        invested: monthLots.reduce((s, l) => s + l.quantity * l.purchasePrice, 0),
        hasInitial: monthLots.some(l => l.isInitialPayment),
        missed: monthLots.length === 0 && firstIdx !== -1 && m > firstIdx && m <= lastActive,
        future,
      };
    });
  }, [lots, year, now]);

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

      {/* Year strip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setYear(y => y - 1)}
            disabled={year <= years[0]}
            className="p-1 rounded text-muted hover:text-content disabled:opacity-25 transition-colors"
            aria-label="Previous year"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-content text-sm font-semibold tabular-nums">{year}</span>
          <button
            onClick={() => setYear(y => y + 1)}
            disabled={year >= years[years.length - 1]}
            className="p-1 rounded text-muted hover:text-content disabled:opacity-25 transition-colors"
            aria-label="Next year"
          >
            <ChevronRight size={15} />
          </button>
        </div>
        <p className="text-faint text-xs">
          {done} paid{missedCount > 0 && <span className="text-warn"> · {missedCount} missed</span>}
        </p>
      </div>

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
                : c.future ? 'bg-surface2 text-faint opacity-50'
                : 'bg-surface2 text-faint'
              }`}
            >
              <span className="text-xs font-medium">{MONTHS[c.month]}</span>
              {paid
                ? <Check size={13} strokeWidth={3} />
                : c.missed
                  ? <AlertTriangle size={11} />
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

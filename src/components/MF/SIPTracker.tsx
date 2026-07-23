import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Repeat, CalendarClock } from 'lucide-react';
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
  hasRegular: boolean;   // a month can hold both — the initial payment and an instalment
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
  const [mode, setMode] = useState<'year' | 'all'>('year');

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

      {/* One year in detail, or every year at a glance */}
      <div className="flex items-center gap-1 bg-surface2 rounded-xl p-1 w-fit">
        {([['year', 'Year'], ['all', `All years → ${LAST_YEAR}`]] as const).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              mode === m ? 'bg-indigo-600 text-white' : 'text-muted hover:text-content'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {sipGroups.map(g => <FundTrack key={g.key} group={g} members={members} mode={mode} />)}
    </div>
  );
}

function FundTrack({ group, members, mode }: {
  group: MFGroup; members: FamilyMember[]; mode: 'year' | 'all';
}) {
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

  const computeCells = useCallback((y: number): MonthCell[] => {
    const inYear = lots.filter(l => l.dateOfPurchase.startsWith(String(y)));
    const monthsWith = new Set(inYear.map(l => Number(l.dateOfPurchase.slice(5, 7)) - 1));
    const firstIdx = monthsWith.size ? Math.min(...monthsWith) : -1;
    // The run stays "active" to today (or year end for past years)
    const lastActive = y < now.getFullYear() ? 11
      : y > now.getFullYear() ? -1
      : now.getMonth();

    // Once a rhythm is established, every later month is expected until the SIP stops
    const started = lots.length > 0 ? new Date(lots[0].dateOfPurchase) : null;

    return Array.from({ length: 12 }, (_, m) => {
      const monthLots = inYear.filter(l => Number(l.dateOfPurchase.slice(5, 7)) - 1 === m);
      const future = y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth());
      const afterStart = !!started
        && (y > started.getFullYear() || (y === started.getFullYear() && m >= started.getMonth()));
      return {
        month: m,
        lots: monthLots,
        invested: monthLots.reduce((s, l) => s + l.quantity * l.purchasePrice, 0),
        hasInitial: monthLots.some(l => l.isInitialPayment),
        hasRegular: monthLots.some(l => !l.isInitialPayment),
        missed: monthLots.length === 0 && firstIdx !== -1 && m > firstIdx && m <= lastActive,
        future,
        projected: monthLots.length === 0 && future && afterStart && sipDay != null,
      };
    });
    // `now` is stable enough for a render pass
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, sipDay]);

  const cells = useMemo(() => computeCells(year), [computeCells, year]);

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

      {mode === 'all' ? (
        <AllYears
          firstYear={firstYear} computeCells={computeCells} sipDay={sipDay}
          onPickYear={y => setYear(y)}
        />
      ) : (
      <>
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
            <button key={y} onClick={() => setYear(y)}
              className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                y === year ? 'bg-indigo-600 text-white' : 'bg-surface2 text-muted hover:text-content'
              }`}>
              {y}
            </button>
          ))}
        </div>
      )}

      {/* Instalments in the selected year — the grid lives in the All years view */}
      {done === 0 ? (
        <p className="text-faint text-xs py-2">
          No instalments in {year}.
          {cells.some(c => c.projected) && (
            <> {cells.filter(c => c.projected).length} scheduled on the {sipDay ? ordinal(sipDay) : ''}.</>
          )}
        </p>
      ) : (
        <div className="bg-surface2 rounded-xl p-3 space-y-2">
          {cells.filter(c => c.lots.length > 0).map(c => (
            <div key={c.month} className="space-y-1">
              <p className="text-faint text-xs font-semibold uppercase tracking-wide">
                {MONTH_FULL[c.month]} {year}
              </p>
              {c.lots.map(l => (
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
          ))}
        </div>
      )}
      </>
      )}

      {/* Footer totals */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-edge text-xs">
        <span className="text-faint">
          {mode === 'all'
            ? <>Total: <span className="text-content font-medium">{formatCurrency(lots.reduce((s, l) => s + l.quantity * l.purchasePrice, 0))}</span></>
            : <>{year}: <span className="text-content font-medium">{formatCurrency(yearLots.reduce((s, l) => s + l.quantity * l.purchasePrice, 0))}</span></>}
        </span>
        {nextDue
          ? <span className="text-muted flex items-center gap-1"><CalendarClock size={12} /> next {formatDate(nextDue.toISOString().slice(0, 10))}</span>
          : latest && <span className="text-faint">last {formatDate(latest.dateOfPurchase)}</span>}
      </div>
    </div>
  );
}

/**
 * Every year from the first instalment to 2045 as one row each — the whole run of a SIP
 * without paging. Tap a year to open it in the detailed view.
 */
function AllYears({ firstYear, computeCells, sipDay, onPickYear }: {
  firstYear: number;
  computeCells: (y: number) => MonthCell[];
  sipDay: number | null;
  onPickYear: (y: number) => void;
}) {
  const rows = useMemo(() => {
    const out: { year: number; cells: MonthCell[] }[] = [];
    for (let y = firstYear; y <= LAST_YEAR; y++) out.push({ year: y, cells: computeCells(y) });
    return out;
  }, [firstYear, computeCells]);

  // A month holding both the initial payment and an instalment is split, rather than
  // letting one colour hide the other.
  const BOTH = 'linear-gradient(135deg, rgb(251 191 36) 50%, rgb(52 211 153) 50%)';
  const dot = (c: MonthCell) =>
    c.hasInitial && c.hasRegular ? ''
    : c.hasInitial ? 'bg-amber-400'
    : c.hasRegular ? 'bg-emerald-400'
    : c.missed ? 'bg-red-400'
    : c.projected ? 'bg-transparent border border-dashed border-edge'
    : 'bg-surface3';

  // The day(s) money actually moved, shown inside the cell. Where a month holds both an
  // initial payment and an instalment, the instalment day is the meaningful one.
  const dayLabel = (c: MonthCell): string | null => {
    if (c.lots.length === 0) return null;
    const regular = c.lots.filter(l => !l.isInitialPayment);
    const pick = (regular.length ? regular : c.lots)[0];
    return String(Number(pick.dateOfPurchase.slice(8, 10)));
  };

  return (
    <div className="space-y-2">
      {/* Month header */}
      <div className="grid grid-cols-[2.25rem_1fr] gap-2 items-center">
        <span />
        <div className="grid grid-cols-12 gap-1">
          {MONTHS.map((m, i) => (
            <span key={i} className="text-faint text-[10px] text-center leading-none">{m}</span>
          ))}
        </div>
      </div>

      {/* One row per year — scrolls rather than paging */}
      <div className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
        {rows.map(({ year: y, cells }) => {
          const paid = cells.filter(c => c.lots.length > 0).length;
          const total = cells.reduce((s, c) => s + c.invested, 0);
          return (
            <button key={y} onClick={() => onPickYear(y)}
              title={paid ? `${y} — ${paid} paid · ${formatCurrency(total)}` : `${y} — scheduled`}
              className="w-full grid grid-cols-[2.25rem_1fr] gap-2 items-center rounded-lg py-0.5 hover:bg-surface2 transition-colors">
              <span className={`text-[11px] tabular-nums text-left ${paid ? 'text-content font-medium' : 'text-faint'}`}>{y}</span>
              <div className="grid grid-cols-12 gap-1">
                {cells.map(c => {
                  const day = dayLabel(c);
                  return (
                    <span key={c.month}
                      title={day ? `${day} ${MONTH_FULL[c.month]} ${y} — ${formatCurrency(c.invested)}` : undefined}
                      className={`h-4 rounded-sm flex items-center justify-center text-[9px] font-bold leading-none tabular-nums text-slate-900/80 ${dot(c)}`}
                      style={c.hasInitial && c.hasRegular ? { background: BOTH } : undefined}>
                      {day}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs text-faint pt-1">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> paid</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> initial</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: BOTH }} /> both</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> missed</span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-edge" /> scheduled {sipDay ? ordinal(sipDay) : ''}
        </span>
      </div>
    </div>
  );
}

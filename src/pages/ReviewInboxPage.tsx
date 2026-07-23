import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox, ClipboardPaste, Loader2, Check, X, AlertTriangle, Calculator, Mail } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, generateId } from '../utils/helpers';
import { parseSipEmail, folioMappingMatches, isMaskedFolio } from '../utils/sipParser';
import { resolveSchemeCode, navOnDate } from '../utils/mfNav';
import type { MutualFund, PendingTransaction } from '../types';

export default function ReviewInboxPage() {
  const { data, dispatch } = useApp();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = data.pendingTransactions ?? [];
  const mappings = data.folioMappings ?? [];

  const handleParse = async () => {
    setError(null);
    const parsed = parseSipEmail(raw);
    if (!parsed) {
      setError('Could not read a SIP installment from that text. Check that folio, date, scheme and amount are present.');
      return;
    }
    setBusy(true);

    // Attribute via the folio registry
    const mapping = mappings.find(m => folioMappingMatches(m, parsed.folioNumber));
    const warnings: string[] = [];
    let schemeCode = mapping?.schemeCode;
    if (!schemeCode) {
      const resolved = await resolveSchemeCode(parsed.schemeRaw);
      schemeCode = resolved?.schemeCode;
    }
    if (!mapping) warnings.push('No folio mapping — set beneficiary/guardian below.');

    // Units come straight from an allotment email; otherwise estimate from NAV.
    let units = parsed.units;
    let nav = parsed.nav;
    let navDate = parsed.navDate;
    let unitsEstimated = false;
    if ((units == null || nav == null) && schemeCode) {
      const point = await navOnDate(schemeCode, parsed.installmentDate);
      if (point) {
        nav = point.nav;
        navDate = point.date;
        unitsEstimated = true;
        units = Math.round((parsed.amount / point.nav) * 1000) / 1000;
        warnings.push(`Units estimated from NAV ₹${point.nav} on ${formatDate(point.date)}.`);
      }
    }
    if (units == null || nav == null) warnings.push('Units/NAV unresolved — enter manually or add a scheme code.');

    // The RTA's "request received" and "processed" mails share a reference but differ in
    // amount, so key on the reference when present.
    const fingerprint = parsed.reference
      ? `ref:${parsed.reference}`
      : `${parsed.folioNumber}|${parsed.installmentDate}|${parsed.amount}`;
    if (pending.some(p => p.externalId === fingerprint
      || `${p.folioNumber}|${p.installmentDate}|${p.amount}` === fingerprint)) {
      setBusy(false);
      setError('This installment is already in the inbox (same folio, date and amount).');
      return;
    }

    const txn: PendingTransaction = {
      id: generateId(),
      source: 'paste',
      externalId: fingerprint,
      folioNumber: mapping?.folioNumber || parsed.folioNumber,   // prefer the full folio
      amc: mapping?.amc || parsed.amc,
      schemeName: mapping?.schemeName || parsed.schemeRaw,
      schemeCode,
      memberId: mapping?.memberId,
      guardianMemberId: mapping?.guardianMemberId,
      amount: parsed.amount,
      installmentDate: parsed.installmentDate,
      estimatedUnits: units,
      estimatedNav: nav,
      navDate,
      unitsEstimated,
      isSIP: mapping?.isSIP ?? true,
      createdAt: new Date().toISOString(),
      rawText: raw,
      warnings,
    };
    dispatch({ type: 'ADD_PENDING', payload: txn });
    setRaw('');
    setBusy(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-content">Review Inbox</h2>
        <p className="text-muted text-sm mt-1">
          Paste a SIP debit/allotment email — it's parsed into a transaction you confirm before it hits your holdings.
          Attribution comes from the <Link to="/folios" className="text-accent hover:underline">Folio Registry</Link>.
        </p>
      </div>

      {/* Paste box */}
      <div className="bg-surface border border-edge rounded-2xl shadow-card p-5 space-y-3">
        <div className="flex items-center gap-2 text-content font-semibold text-sm">
          <ClipboardPaste size={16} className="text-accent" /> Paste SIP email
        </div>
        <textarea
          value={raw}
          onChange={e => setRaw(e.target.value)}
          rows={6}
          placeholder="Paste the full email body here (subject optional)…"
          className="w-full bg-surface2 border border-edge rounded-xl px-3 py-2.5 text-sm text-content placeholder:text-faint focus:outline-none focus:border-indigo-500 font-mono"
        />
        {error && (
          <p className="text-danger text-xs flex items-center gap-1.5"><AlertTriangle size={13} /> {error}</p>
        )}
        <div className="flex justify-end">
          <button onClick={handleParse} disabled={busy || !raw.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
            {busy ? 'Parsing…' : 'Parse & stage'}
          </button>
        </div>
      </div>

      {/* Pending list */}
      <div>
        <h3 className="text-content font-semibold text-sm mb-3 flex items-center gap-2">
          <Inbox size={16} className="text-accent" />
          Pending ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <div className="text-center py-12 text-faint">
            <Inbox size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nothing to review. Parsed installments appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(p => <PendingCard key={p.id} txn={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pending transaction card ────────────────────────────────────────────────────
function PendingCard({ txn }: { txn: PendingTransaction }) {
  const { data, dispatch } = useApp();
  const [memberId, setMemberId] = useState(txn.memberId ?? '');
  const [guardianId, setGuardianId] = useState(txn.guardianMemberId ?? '');
  const [units, setUnits] = useState<string>(txn.estimatedUnits != null ? String(txn.estimatedUnits) : '');
  const [nav, setNav] = useState<string>(txn.estimatedNav != null ? String(txn.estimatedNav) : '');
  // AMCs often mask the folio (XXXXXXXX4331) — editable so it can be corrected before
  // the mapping is saved against it.
  const [folio, setFolio] = useState(txn.folioNumber);
  const [isInitial, setIsInitial] = useState(false);

  const existingFolio = (data.folioMappings ?? [])
    .find(m => folioMappingMatches(m, folio) || folioMappingMatches(m, txn.folioNumber));
  const [saveFolio, setSaveFolio] = useState(!existingFolio);

  // Ticking "save mapping" will also store the emailed (masked) folio as an alias
  const willRememberMask = isMaskedFolio(txn.folioNumber)
    && txn.folioNumber.trim().toLowerCase() !== folio.trim().toLowerCase();

  const unitsNum = parseFloat(units);
  const navNum = parseFloat(nav);
  const canConfirm = !!memberId && !!folio.trim()
    && Number.isFinite(unitsNum) && unitsNum > 0
    && Number.isFinite(navNum) && navNum > 0;

  const confirm = () => {
    if (!canConfirm) return;
    const lot: MutualFund = {
      id: generateId(),
      memberId,
      guardianMemberId: guardianId || undefined,
      companyName: txn.amc,
      schemeName: txn.schemeName,
      isSIP: txn.isSIP,
      quantity: unitsNum,
      purchasePrice: navNum,
      dateOfPurchase: txn.installmentDate,
      currentPrice: navNum,     // refreshed live by the MF NAV updater
      schemeCode: txn.schemeCode,
      folioNumber: folio.trim(),
      isInitialPayment: isInitial || undefined,
    };
    dispatch({ type: 'ADD_MF', payload: lot });

    if (saveFolio && txn.schemeCode) {
      // Remember the masked form the AMC sends, so next month's email resolves to this
      // folio exactly — no re-correcting.
      const aliases = new Set((existingFolio?.folioAliases ?? []).filter(Boolean));
      const emailed = txn.folioNumber.trim();
      if (isMaskedFolio(emailed) && emailed.toLowerCase() !== folio.trim().toLowerCase()) {
        aliases.add(emailed);
      }
      dispatch({ type: 'UPSERT_FOLIO', payload: {
        id: existingFolio?.id ?? generateId(),   // reuse the row so it updates, not duplicates
        folioNumber: folio.trim(),
        folioAliases: aliases.size ? [...aliases] : undefined,
        amc: txn.amc,
        schemeName: txn.schemeName,
        schemeCode: txn.schemeCode,
        memberId,
        guardianMemberId: guardianId || undefined,
        isSIP: txn.isSIP,
        sipAmount: txn.amount,
      } });
    }
    dispatch({ type: 'DELETE_PENDING', payload: txn.id });
  };

  const inputCls = 'w-full bg-surface2 border border-edge rounded-lg px-2.5 py-1.5 text-sm text-content focus:outline-none focus:border-indigo-500';
  const labelCls = 'block text-xs text-faint mb-1';
  const estValue = Number.isFinite(unitsNum) && Number.isFinite(navNum) ? unitsNum * navNum : 0;

  return (
    <div className="bg-surface border border-edge rounded-2xl shadow-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-content font-semibold text-sm leading-snug">{txn.schemeName}</p>
          <p className="text-faint text-xs mt-0.5">
            {txn.amc} · Folio <span className="font-mono text-muted">{folio || '—'}</span>
            {txn.schemeCode && <> · code {txn.schemeCode}</>}
          </p>
          <p className="text-faint text-xs mt-1 flex items-center gap-1.5">
            <Mail size={11} className="flex-shrink-0" />
            {txn.gmailAccount
              ? <>Received in <span className="text-muted">{txn.gmailAccount.split('@')[0]}</span></>
              : txn.source === 'paste' ? 'Added manually'
              : txn.source === 'sms' ? 'From SMS'
              : 'Received via Gmail'}
            {txn.receivedAt && <span className="text-faint"> · {formatDate(txn.receivedAt)}</span>}
          </p>
        </div>
        <span className="flex-shrink-0 text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full">
          {txn.isSIP ? 'SIP' : 'Lump'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-surface2 rounded-xl p-2.5 text-center">
        <div><p className="text-faint text-xs">Amount</p><p className="text-content text-sm font-semibold">{formatCurrency(txn.amount)}</p></div>
        <div><p className="text-faint text-xs">Txn / Value date</p><p className="text-content text-sm font-semibold">{formatDate(txn.installmentDate)}</p></div>
        <div><p className="text-faint text-xs">{txn.unitsEstimated ? 'Est. Value' : 'Value'}</p><p className="text-content text-sm font-semibold">{estValue ? formatCurrency(estValue) : '—'}</p></div>
        <div><p className="text-faint text-xs">NAV date</p><p className="text-content text-sm font-semibold">{txn.navDate ? formatDate(txn.navDate) : '—'}</p></div>
      </div>

      {txn.warnings && txn.warnings.length > 0 && (
        <div className="space-y-1">
          {txn.warnings.map((w, i) => (
            <p key={i} className="text-warn text-xs flex items-start gap-1.5"><AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {w}</p>
          ))}
        </div>
      )}

      {/* Folio (editable — often masked by the AMC) + payment kind */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Folio Number *</label>
          <input className={`${inputCls} font-mono`} value={folio}
            onChange={e => setFolio(e.target.value)} placeholder="Full folio number" />
          {isMaskedFolio(folio) && (
            <p className="text-warn text-xs mt-1 flex items-start gap-1">
              <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
              Masked by the AMC — replace with the full number before saving the mapping.
            </p>
          )}
        </div>
        <div className="sm:pt-5">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={isInitial} onChange={e => setIsInitial(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded accent-amber-500 flex-shrink-0" />
            <span>
              <span className="text-content text-sm">Initial / first payment</span>
              <span className="block text-faint text-xs mt-0.5">
                Tick for the one-off payment made when the SIP was registered.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Beneficiary *</label>
          <select className={inputCls} value={memberId} onChange={e => setMemberId(e.target.value)}>
            <option value="">— Select —</option>
            {data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Guardian</label>
          <select className={inputCls} value={guardianId} onChange={e => setGuardianId(e.target.value)}>
            <option value="">— None —</option>
            {data.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Units *</label>
          <input type="number" step="0.001" className={inputCls} value={units} onChange={e => setUnits(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>NAV (₹) *</label>
          <input type="number" step="0.0001" className={inputCls} value={nav} onChange={e => setNav(e.target.value)} />
        </div>
      </div>

      {txn.schemeCode && (
        <label className="flex items-start gap-2 text-xs text-muted cursor-pointer">
          <input type="checkbox" checked={saveFolio} onChange={e => setSaveFolio(e.target.checked)}
            className="w-3.5 h-3.5 mt-0.5 rounded accent-indigo-600 flex-shrink-0" />
          <span>
            {existingFolio
              ? 'Update the saved folio mapping with these details'
              : 'Also save this folio → member mapping for next time'}
            {willRememberMask && (
              <span className="block text-faint mt-0.5">
                Also remembers <span className="font-mono">{txn.folioNumber}</span> so future emails
                resolve to this folio without correcting it again.
              </span>
            )}
          </span>
        </label>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={() => dispatch({ type: 'DELETE_PENDING', payload: txn.id })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted hover:text-danger transition-colors">
          <X size={14} /> Reject
        </button>
        <button onClick={confirm} disabled={!canConfirm}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-xl text-sm font-medium transition-colors">
          <Check size={14} /> Confirm & add
        </button>
      </div>
    </div>
  );
}

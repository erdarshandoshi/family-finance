import { useState } from 'react';
import {
  FileText, Mail, FileLock2, Landmark, CheckCircle2,
  ChevronDown, Braces,
} from 'lucide-react';

// A living catalogue of every email/PDF format the ingestion pipeline understands.
// Kept in sync with api/ingest-sip.js (extractFields), api/_pdf.js and api/_nps.js.

type ParserKind = 'email' | 'pdf' | 'nps';

interface Parser {
  id: string;
  name: string;
  kind: ParserKind;
  amcs: string;                 // which AMCs / RTAs send this shape
  subjectHints: string[];       // subject phrases the Gmail forwarder keys on
  layout: string;               // how the body/PDF is structured
  fields: string;               // what gets extracted
  notes?: string;
  status: 'live' | 'new';
}

const PARSERS: Parser[] = [
  {
    id: 'hdfc-cams-debit',
    name: 'HDFC / CAMS debit alert',
    kind: 'email',
    amcs: 'HDFC MF, other CAMS-serviced AMCs',
    subjectHints: ['Systematic Investment'],
    layout: '“Label : value” pairs, one per line.',
    fields: 'Folio, scheme, instalment date, amount. Units/NAV looked up from mfapi if absent.',
    status: 'live',
  },
  {
    id: 'sbi-cams-confirm',
    name: 'SBI / CAMS purchase confirmation',
    kind: 'email',
    amcs: 'SBI MF, CAMS-serviced AMCs',
    subjectHints: ['transaction confirmation'],
    layout: 'Prose sentences (“…purchase in <scheme> for value date…”).',
    fields: 'Folio, scheme, value date (used as NAV date), amount, units, NAV.',
    notes: 'Value Date is treated as the NAV date, per SBI’s wording.',
    status: 'live',
  },
  {
    id: 'kfin-quant-table',
    name: 'KFintech / Quant transaction table',
    kind: 'email',
    amcs: 'Quant MF, KFintech-serviced AMCs',
    subjectHints: ['SIP transaction', 'New Purchase', 'units allotted'],
    layout: 'Tab-separated “Label<TAB>value” rows (Gmail may flatten to single spaces).',
    fields: 'Folio, scheme, NAV date, amount, units, NAV, transaction reference.',
    notes: 'Quant’s “Your SIP transaction … is processed” subject was added Aug 2026.',
    status: 'new',
  },
  {
    id: 'invesco-kfin-pdf',
    name: 'Invesco / KFintech (figures in PDF)',
    kind: 'pdf',
    amcs: 'Invesco MF, some KFintech AMCs',
    subjectHints: ['SIP Confirmation'],
    layout: 'Email carries only scheme + date; every figure lives in a password-protected SOA PDF.',
    fields: 'Identity (folio/scheme/date) from the email; amount, units, NAV read from the PDF.',
    notes: 'PDF password = first holder’s PAN (upper-case). Units/NAV orientation validated against the published NAV.',
    status: 'live',
  },
  {
    id: 'nps-kfin',
    name: 'NPS — KFin CRA statement',
    kind: 'nps',
    amcs: 'NPS (KFin CRA)',
    subjectHints: ['your NPS account'],
    layout: 'Header-row / value-row table inside a password-protected PDF (“…of your NPS account”).',
    fields: 'PRAN, corpus, total invested, fund manager, allocations (E/C/G/A), period, as-on date.',
    notes: 'Figures validated by the statement’s own identity: Holdings = Contribution − Withdrawal + Gain.',
    status: 'live',
  },
  {
    id: 'nps-protean',
    name: 'NPS — Protean CRA statement',
    kind: 'nps',
    amcs: 'NPS (Protean CRA)',
    subjectHints: ['your NPS account'],
    layout: 'PDF with “…for your NPS account”, “April 01, 2026 to July 29, 2026”, Statement Generation Date.',
    fields: 'PRAN, corpus, total invested, fund manager, allocations, period, as-on date.',
    notes: 'Same NPS shape as KFin; differs only in date wording and headers.',
    status: 'live',
  },
];

const KIND_META: Record<ParserKind, { label: string; icon: typeof Mail; tint: string }> = {
  email: { label: 'Email body', icon: Mail, tint: 'text-sky-400 bg-sky-500/10 border-sky-500/25' },
  pdf: { label: 'Email + PDF', icon: FileLock2, tint: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
  nps: { label: 'NPS PDF', icon: Landmark, tint: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
};

function ParserCard({ p }: { p: Parser }) {
  const [open, setOpen] = useState(false);
  const meta = KIND_META[p.kind];
  const Icon = meta.icon;

  return (
    <div className="bg-surface border border-edge rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface2 transition-colors"
      >
        <div className={`p-2 rounded-xl border flex-shrink-0 ${meta.tint}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-content font-semibold text-sm">{p.name}</h3>
            {p.status === 'new' && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-300 bg-indigo-600/20 border border-indigo-600/30 rounded-full px-1.5 py-0.5">
                New
              </span>
            )}
          </div>
          <p className="text-muted text-xs mt-0.5 truncate">{p.amcs}</p>
        </div>
        <span className={`hidden sm:inline text-[11px] font-medium rounded-full border px-2 py-0.5 ${meta.tint}`}>
          {meta.label}
        </span>
        <ChevronDown
          size={16}
          className={`text-faint flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-edge">
          <Row label="Subject match">
            <div className="flex flex-wrap gap-1.5">
              {p.subjectHints.map(h => (
                <code key={h} className="text-[11px] text-content bg-surface3 rounded-md px-1.5 py-0.5">
                  “{h}”
                </code>
              ))}
            </div>
          </Row>
          <Row label="Layout">{p.layout}</Row>
          <Row label="Extracts">{p.fields}</Row>
          {p.notes && <Row label="Notes">{p.notes}</Row>}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <span className="text-faint text-xs font-medium sm:w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-muted text-xs leading-relaxed">{children}</span>
    </div>
  );
}

export default function ParsersPage() {
  const counts = {
    total: PARSERS.length,
    email: PARSERS.filter(p => p.kind === 'email').length,
    pdf: PARSERS.filter(p => p.kind === 'pdf').length,
    nps: PARSERS.filter(p => p.kind === 'nps').length,
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Braces className="text-accent" size={22} />
          <h1 className="text-content font-bold text-xl">Supported Parsers</h1>
        </div>
        <p className="text-muted text-sm mt-1">
          Every email and statement format the SIP/NPS ingestion pipeline can read. New AMC
          formats are added here as they’re supported.
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: counts.total, icon: FileText },
          { label: 'Email', value: counts.email, icon: Mail },
          { label: 'PDF', value: counts.pdf, icon: FileLock2 },
          { label: 'NPS', value: counts.nps, icon: Landmark },
        ].map(t => (
          <div key={t.label} className="bg-surface border border-edge rounded-2xl p-3 text-center">
            <t.icon size={16} className="text-faint mx-auto mb-1" />
            <div className="text-content font-bold text-lg leading-none">{t.value}</div>
            <div className="text-faint text-[11px] mt-1">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {PARSERS.map(p => <ParserCard key={p.id} p={p} />)}
      </div>

      <div className="bg-surface2 border border-edge rounded-2xl p-4 flex gap-3">
        <CheckCircle2 size={18} className="text-success flex-shrink-0 mt-0.5" />
        <p className="text-muted text-xs leading-relaxed">
          Not seeing a transaction in the Review Inbox? First check the Gmail forwarder actually
          matched it — the subject must contain one of the phrases above. The parser itself reads
          folio, scheme, date, amount, and (where present) units &amp; NAV; anything missing is
          filled from mfapi or flagged for manual entry during review.
        </p>
      </div>
    </div>
  );
}

// Parses SIP / purchase emails from AMCs and RTAs (CAMS, KFintech) into structured fields.
//
// Formats seen in the wild differ a lot, so extraction is field-by-field with fallbacks
// rather than one all-or-nothing template:
//   • "Label : value"      — HDFC/CAMS debit alerts
//   • "Label<TAB>value"    — KFintech/Quant transaction tables (no colon at all)
//   • prose sentences      — SBI/CAMS purchase confirmations

export interface ParsedSip {
  amc: string;
  folioNumber: string;        // may be masked, e.g. "XXXXXXXX4331"
  installmentDate: string;    // ISO yyyy-mm-dd
  schemeRaw: string;
  plan?: string;
  option?: string;
  amount: number;
  units?: number;
  nav?: number;
  navDate?: string;
  reference?: string;         // RTA transaction reference — same across request/processed mails
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

// Accepts "18-JUL-2026", "02/07/2026" (dd/mm), "18-07-2026", "2026-07-18"
export function parseSipDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toUpperCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`;
  }

  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;

  return null;
}

// Strict: the whole value must be numeric, so a date like "02/07/2026" is never
// mistaken for the number 2.
function toNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).replace(/[₹\s]/g, '').replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// All "label → value" pairs matching any of `labels`, in label order. A row separator is
// the first colon, or a tab / run of spaces. Matching on the label starting the line keeps
// prose (which may contain the same words) from being picked up.
function fieldMatches(text: string, labels: string[]): string[] {
  const out: string[] = [];
  const lines = text.split(/\r?\n/);
  for (const label of labels) {
    const target = label.toLowerCase();
    for (const line of lines) {
      let left: string, right: string;
      const c = line.indexOf(':');
      if (c !== -1) {
        left = line.slice(0, c); right = line.slice(c + 1);
      } else {
        const m = line.match(/^(.*?)(?:\t+|\s{2,})(.+)$/);
        if (!m) continue;
        left = m[1]; right = m[2];
      }
      left = left.trim().toLowerCase().replace(/\s+/g, ' ');
      right = right.trim();
      if (right && left.startsWith(target)) out.push(right);
    }
  }
  return out;
}

const fieldValue = (t: string, l: string[]): string | null => fieldMatches(t, l)[0] ?? null;

// First labelled value that is actually numeric — lets "NAV Date" sit above
// "NAV (Rs. per unit)" without hijacking the NAV lookup.
function fieldNumber(t: string, l: string[]): number | null {
  for (const v of fieldMatches(t, l)) {
    const n = toNumber(v);
    if (n != null) return n;
  }
  return null;
}

const AMC_FILLER = /^(for|from|is|the|to|your|of|in|at|and|dear|greetings|processed|sincerely|regards)$/i;

// Matched per line so a subject like "…is processed" can't bleed into the brand name.
function detectAmc(text: string, schemeRaw: string): string {
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/([A-Za-z][A-Za-z&.]*(?:\s+[A-Za-z][A-Za-z&.]*){0,3})\s*-?\s*Mutual\s+Fund/i);
    if (!m) continue;
    const words = m[1].split(/\s+/).filter(w => !AMC_FILLER.test(w));
    if (words.length) return `${words.join(' ')} Mutual Fund`;
  }
  const brand = (schemeRaw ?? '').trim().split(/\s+/)[0] ?? '';
  return brand ? `${brand.charAt(0).toUpperCase()}${brand.slice(1)} Mutual Fund` : 'Mutual Fund';
}

function detectPlan(s: string): string | undefined {
  if (/\bdirect\b/i.test(s)) return 'Direct';
  if (/\bregular\b/i.test(s)) return 'Regular';
  return undefined;
}

function detectOption(s: string): string | undefined {
  if (/\bgrowth\b/i.test(s)) return 'Growth';
  if (/\b(idcw|dividend)\b/i.test(s)) return 'IDCW';
  return undefined;
}

/** True when a folio is partly masked, e.g. "XXXXXXXX4331". */
export function isMaskedFolio(folio: string): boolean {
  return /[x*]/i.test(folio);
}

/**
 * Compare a stored (full) folio against one parsed from an email, which may be masked.
 * Masked folios fall back to comparing the visible trailing digits.
 */
export function folioMatches(stored: string, parsed: string): boolean {
  const a = (stored ?? '').replace(/\s/g, '').toLowerCase();
  const b = (parsed ?? '').replace(/\s/g, '').toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (!isMaskedFolio(a) && !isMaskedFolio(b)) return false;

  const tail = (s: string) => (s.match(/\d+$/) ?? [''])[0];
  const ta = tail(a), tb = tail(b);
  if (ta.length < 4 || tb.length < 4) return false;      // too little to be sure
  const n = Math.min(ta.length, tb.length);
  return ta.slice(-n) === tb.slice(-n);
}

export function parseSipEmail(text: string): ParsedSip | null {
  if (!text || !text.trim()) return null;
  const flat = text.replace(/\s+/g, ' ');

  // ── Folio (may be masked) ──────────────────────────────────────────────────
  let folio = fieldValue(text, ['Folio Number', 'Folio No', 'Folio']);
  if (!folio) {
    const m = flat.match(/Folio\s*(?:Number|No\.?)?\s*(?:\/\s*DP\s*ID\.?)?\s*(?:Folio\s*)?([x*\d][\w/-]*)/i);
    folio = m?.[1] ?? null;
  }
  folio = folio?.replace(/[.,;]+$/, '').trim() ?? null;

  // ── Scheme ─────────────────────────────────────────────────────────────────
  let schemeRaw = fieldValue(text, ['Scheme Details', 'Scheme Name', 'SIP registered under', 'Scheme']);
  if (!schemeRaw) {
    const m = flat.match(/(?:purchase|investment|subscription)\s+(?:in|under)\s+(.+?)\s+(?:for\s+(?:value\s+date|Rs)|on\s+\d)/i);
    schemeRaw = m?.[1]?.trim() ?? null;
  }

  // ── Dates ──────────────────────────────────────────────────────────────────
  const navDateRaw = fieldValue(text, ['NAV Date', 'Value Date']);
  let dateRaw = navDateRaw
    ?? fieldValue(text, ['Transaction Date', 'Installment Date', 'Instalment Date', 'Date of Transaction', 'SIP Date']);
  if (!dateRaw) {
    const m = flat.match(/(?:value\s+date|nav\s+date|dated|on)\s*:?\s*(\d{1,2}[-/][A-Za-z]{3,}[-/]\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);
    dateRaw = m?.[1] ?? null;
  }
  const installmentDate = dateRaw ? parseSipDate(dateRaw) : null;

  // ── Amount ─────────────────────────────────────────────────────────────────
  let amount = fieldNumber(text, ['Installment Amount', 'Instalment Amount', 'Amount', 'SIP Amount']);
  if (amount == null) {
    const m = flat.match(/(?:for|of)\s+Rs\.?\s*([\d,]+(?:\.\d+)?)/i);
    amount = toNumber(m?.[1]);
  }

  if (!folio || !schemeRaw || !installmentDate || amount == null) return null;

  // ── Units / NAV (present only once the purchase is processed) ──────────────
  let units = fieldNumber(text, ['Units (Nos', 'Units Allotted', 'Allotted Units', 'No. of Units', 'Units']);
  if (units == null) {
    const m = flat.match(/([\d,]+(?:\.\d+)?)\s*units?\b/i);
    units = toNumber(m?.[1]);
  }

  let nav = fieldNumber(text, ['NAV (Rs', 'NAV per unit', 'Allotment NAV', 'Purchase Price', 'NAV', 'Price']);
  if (nav == null) {
    const m = flat.match(/at\s+NAV\s+of\s+(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)/i);
    nav = toNumber(m?.[1]);
  }

  // Derive whichever of units/NAV is missing — both come from the email, so exact.
  if (units == null && nav != null && nav > 0) units = Math.round((amount / nav) * 1000) / 1000;

  // The stated NAV belongs to the NAV/value date; otherwise to the transaction date.
  const navDate = nav != null && nav > 0
    ? (navDateRaw ? parseSipDate(navDateRaw) ?? installmentDate : installmentDate)
    : undefined;

  return {
    amc: detectAmc(text, schemeRaw),
    folioNumber: folio,
    installmentDate,
    schemeRaw: schemeRaw.replace(/\s+/g, ' ').trim(),
    plan: detectPlan(schemeRaw),
    option: detectOption(schemeRaw),
    amount,
    units: units != null && units > 0 ? units : undefined,
    nav: nav != null && nav > 0 ? nav : undefined,
    navDate,
    reference: fieldValue(text, ['Transaction Reference Number', 'Transaction Reference', 'Reference Number']) ?? undefined,
  };
}

// Parses SIP transaction emails/SMS (CAMS/KFintech style) into structured fields.
// Handles the common "Label : value" table layout used by AMC debit alerts, and
// opportunistically extracts units + NAV when an allotment confirmation includes them.

export interface ParsedSip {
  amc: string;
  folioNumber: string;
  installmentDate: string;    // ISO yyyy-mm-dd
  schemeRaw: string;          // full scheme string as printed
  plan?: string;              // Direct | Regular
  option?: string;            // Growth | IDCW
  amount: number;
  units?: number;             // present only in allotment confirmations
  nav?: number;               // present only in allotment confirmations
  navDate?: string;           // ISO date the stated NAV belongs to (the "value date")
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

// Accepts "18-JUL-2026", "18/07/2026", "18-07-2026", "2026-07-18"
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

// Pull the value after a label. Works line-by-line so a label only matches an actual
// "Label ... : value" table row — never a prose sentence that happens to contain the
// word and end in a colon (e.g. "…the installment amount … mentioned below:").
function fieldValue(text: string, labels: string[]): string | null {
  const lines = text.split(/\r?\n/);
  for (const label of labels) {
    const target = label.toLowerCase();
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const left = line.slice(0, idx).trim().toLowerCase().replace(/\s+/g, ' ');
      const right = line.slice(idx + 1).trim();
      if (right && left.startsWith(target)) return right;
    }
  }
  return null;
}

function toNumber(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function detectAmc(text: string, schemeRaw: string): string {
  // Prefer an explicit "<AMC> Mutual Fund" mention, else the scheme's leading brand word.
  const m = text.match(/([A-Za-z][A-Za-z&.\s]{1,40}?)\s*-?\s*Mutual Fund/i);
  if (m) return `${m[1].trim().replace(/\s+/g, ' ')} Mutual Fund`;
  const brand = schemeRaw.split(/[-–]/)[0]?.trim();
  return brand ? `${brand} Mutual Fund` : 'Mutual Fund';
}

function detectPlan(schemeRaw: string): string | undefined {
  if (/\bdirect\b/i.test(schemeRaw)) return 'Direct';
  if (/\bregular\b/i.test(schemeRaw)) return 'Regular';
  return undefined;
}

function detectOption(schemeRaw: string): string | undefined {
  if (/\bgrowth\b/i.test(schemeRaw)) return 'Growth';
  if (/\b(idcw|dividend)\b/i.test(schemeRaw)) return 'IDCW';
  return undefined;
}

export function parseSipEmail(text: string): ParsedSip | null {
  if (!text || !text.trim()) return null;
  // Two shapes in the wild: a "Label : value" table (HDFC/CAMS debit alerts) and a
  // prose confirmation sentence (SBI/CAMS purchase confirmations).
  return parseLabelled(text) ?? parseProse(text);
}

// ─── Strategy 1: "Label : value" table ────────────────────────────────────────
function parseLabelled(text: string): ParsedSip | null {
  const folio = fieldValue(text, ['Folio Number', 'Folio No', 'Folio']);
  const dateRaw = fieldValue(text, ['Installment Date', 'Instalment Date', 'Transaction Date', 'Date of Transaction', 'SIP Date']);
  const schemeRaw = fieldValue(text, ['SIP registered under', 'Scheme Name', 'Scheme']);
  const amountRaw = fieldValue(text, ['Installment Amount', 'Instalment Amount', 'Amount', 'SIP Amount']);
  const unitsRaw = fieldValue(text, ['Units Allotted', 'Units', 'No. of Units', 'Allotted Units']);
  const navRaw = fieldValue(text, ['NAV', 'Purchase Price', 'Price', 'Allotment NAV']);

  const installmentDate = dateRaw ? parseSipDate(dateRaw) : null;
  const amount = toNumber(amountRaw);

  // Minimum viable record: folio + date + scheme + amount
  if (!folio || !installmentDate || !schemeRaw || amount == null) return null;

  const units = toNumber(unitsRaw);
  const nav = toNumber(navRaw);

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
  };
}

// ─── Strategy 2: prose confirmation sentence ──────────────────────────────────
// e.g. "…processed your purchase in <SCHEME> for value date 20-Jul-2026 for
//       Rs. 4,999.75 at NAV of 53.5565 in Folio No / DP ID. Folio 50426350."
function parseProse(text: string): ParsedSip | null {
  const flat = text.replace(/\s+/g, ' ');   // collapse newlines so sentences match

  const schemeM = flat.match(/(?:purchase|investment|subscription)\s+in\s+(.+?)\s+for\s+(?:value\s+date|dated|Rs)/i);
  const dateM   = flat.match(/(?:value\s+date|dated|date)\s*:?\s*(\d{1,2}[-/][A-Za-z]{3,}[-/]\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);
  const amountM = flat.match(/(?:for|of)\s+Rs\.?\s*([\d,]+(?:\.\d+)?)/i);
  const navM    = flat.match(/at\s+NAV\s+of\s+(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)/i);
  // "Folio No / DP ID. Folio 50426350" — skip the label words, take the numeric id
  const folioM  = flat.match(/Folio(?:\s*No\.?)?(?:\s*\/\s*DP\s*ID\.?)?\s*(?:Folio\s*)?(\d[\w/-]*)/i);
  const unitsM  = flat.match(/([\d,]+(?:\.\d+)?)\s*units?\b/i);

  const folio = folioM?.[1];
  const schemeRaw = schemeM?.[1]?.trim();
  const installmentDate = dateM ? parseSipDate(dateM[1]) : null;
  const amount = toNumber(amountM?.[1] ?? null);
  if (!folio || !schemeRaw || !installmentDate || amount == null) return null;

  const nav = toNumber(navM?.[1] ?? null);
  let units = toNumber(unitsM?.[1] ?? null);
  // NAV came from the email itself, so amount ÷ NAV is exact — not an estimate.
  if (units == null && nav != null && nav > 0) units = Math.round((amount / nav) * 1000) / 1000;

  return {
    amc: detectAmc(text, schemeRaw),
    folioNumber: folio,
    installmentDate,
    schemeRaw,
    plan: detectPlan(schemeRaw),
    option: detectOption(schemeRaw),
    amount,
    units: units != null && units > 0 ? units : undefined,
    nav: nav != null && nav > 0 ? nav : undefined,
    // The "value date" is the date whose NAV was applied — i.e. the NAV date.
    navDate: nav != null && nav > 0 ? installmentDate : undefined,
  };
}

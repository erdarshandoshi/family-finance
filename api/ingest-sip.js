// Ingest a SIP debit/allotment email (forwarded by the Gmail Apps Script) and stage it
// in the isolated `sipInbox` Firestore collection for in-app review.
//
// SAFETY: this endpoint NEVER writes to `users/shared-family`. It only reads the folio
// registry from there (read-only) and creates/overwrites its own docs in `sipInbox`,
// keyed by a folio+date+amount fingerprint so re-sends are idempotent (no duplicates).
//
// Required env vars (set in Vercel):
//   INGEST_SECRET            — shared secret; the Apps Script sends it as `x-ingest-secret`
//   FIREBASE_SERVICE_ACCOUNT — the service-account JSON (single line) for the Admin SDK

// Modular subpath imports — firebase-admin v12+ does not expose the legacy
// namespaced API (admin.apps / admin.credential) through an ESM default import.
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ─── Firebase Admin (singleton) ─────────────────────────────────────────────────
function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
    let svc;
    try { svc = JSON.parse(raw); }
    catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON (paste the whole file contents)'); }
    // Env vars often carry the private key with literal \n instead of real newlines
    if (typeof svc.private_key === 'string') svc.private_key = svc.private_key.replace(/\\n/g, '\n');
    initializeApp({ credential: cert(svc) });
  }
  return getFirestore();
}

// ─── Email parsing (ported from src/utils/sipParser.ts) ──────────────────────────
const MONTHS = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };

function parseSipDate(raw) {
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})$/);
  if (m) { const mon = MONTHS[m[2].slice(0,3).toUpperCase()]; if (mon) return `${m[3]}-${mon}-${m[1].padStart(2,'0')}`; }
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return null;
}

function fieldValue(text, labels) {
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

function toNumber(raw) {
  if (!raw) return null;
  const n = parseFloat(String(raw).replace(/[₹,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function detectAmc(text, schemeRaw) {
  const m = text.match(/([A-Za-z][A-Za-z&.\s]{1,40}?)\s*-?\s*Mutual Fund/i);
  if (m) return `${m[1].trim().replace(/\s+/g, ' ')} Mutual Fund`;
  const brand = schemeRaw.split(/[-–]/)[0]?.trim();
  return brand ? `${brand} Mutual Fund` : 'Mutual Fund';
}

export function parseSipEmail(text) {
  if (!text || !text.trim()) return null;
  // Two shapes: a "Label : value" table (HDFC/CAMS debit alerts) and a prose
  // confirmation sentence (SBI/CAMS purchase confirmations).
  return parseLabelled(text) ?? parseProse(text);
}

// Strategy 1 — "Label : value" table
function parseLabelled(text) {
  const folio = fieldValue(text, ['Folio Number','Folio No','Folio']);
  const dateRaw = fieldValue(text, ['Installment Date','Instalment Date','Transaction Date','Date of Transaction','SIP Date']);
  const schemeRaw = fieldValue(text, ['SIP registered under','Scheme Name','Scheme']);
  const amountRaw = fieldValue(text, ['Installment Amount','Instalment Amount','Amount','SIP Amount']);
  const unitsRaw = fieldValue(text, ['Units Allotted','Units','No. of Units','Allotted Units']);
  const navRaw = fieldValue(text, ['NAV','Purchase Price','Price','Allotment NAV']);

  const installmentDate = dateRaw ? parseSipDate(dateRaw) : null;
  const amount = toNumber(amountRaw);
  if (!folio || !installmentDate || !schemeRaw || amount == null) return null;

  const units = toNumber(unitsRaw);
  const nav = toNumber(navRaw);
  return {
    amc: detectAmc(text, schemeRaw),
    folioNumber: folio,
    installmentDate,
    schemeRaw: schemeRaw.replace(/\s+/g, ' ').trim(),
    amount,
    units: units != null && units > 0 ? units : undefined,
    nav: nav != null && nav > 0 ? nav : undefined,
  };
}

// Strategy 2 — prose confirmation sentence
// e.g. "…processed your purchase in <SCHEME> for value date 20-Jul-2026 for
//       Rs. 4,999.75 at NAV of 53.5565 in Folio No / DP ID. Folio 50426350."
function parseProse(text) {
  const flat = text.replace(/\s+/g, ' ');

  const schemeM = flat.match(/(?:purchase|investment|subscription)\s+in\s+(.+?)\s+for\s+(?:value\s+date|dated|Rs)/i);
  const dateM   = flat.match(/(?:value\s+date|dated|date)\s*:?\s*(\d{1,2}[-/][A-Za-z]{3,}[-/]\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);
  const amountM = flat.match(/(?:for|of)\s+Rs\.?\s*([\d,]+(?:\.\d+)?)/i);
  const navM    = flat.match(/at\s+NAV\s+of\s+(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)/i);
  const folioM  = flat.match(/Folio(?:\s*No\.?)?(?:\s*\/\s*DP\s*ID\.?)?\s*(?:Folio\s*)?(\d[\w/-]*)/i);
  const unitsM  = flat.match(/([\d,]+(?:\.\d+)?)\s*units?\b/i);

  const folio = folioM && folioM[1];
  const schemeRaw = schemeM && schemeM[1].trim();
  const installmentDate = dateM ? parseSipDate(dateM[1]) : null;
  const amount = toNumber(amountM && amountM[1]);
  if (!folio || !schemeRaw || !installmentDate || amount == null) return null;

  const nav = toNumber(navM && navM[1]);
  let units = toNumber(unitsM && unitsM[1]);
  // NAV came from the email itself, so amount ÷ NAV is exact — not an estimate.
  if (units == null && nav != null && nav > 0) units = Math.round((amount / nav) * 1000) / 1000;

  return {
    amc: detectAmc(text, schemeRaw),
    folioNumber: folio,
    installmentDate,
    schemeRaw,
    amount,
    units: units != null && units > 0 ? units : undefined,
    nav: nav != null && nav > 0 ? nav : undefined,
  };
}

// ─── mfapi.in NAV estimation (ported from src/utils/mfNav.ts) ─────────────────────
function mfapiDateToIso(d) {
  const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function scoreMatch(raw, candidate) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const r = norm(raw), c = norm(candidate);
  let score = 0;
  if (/\bdirect\b/.test(r) === /\bdirect\b/.test(c)) score += 5; else score -= 5;
  if (/\b(idcw|dividend)\b/.test(r) === /\b(idcw|dividend)\b/.test(c)) score += 5; else score -= 5;
  const stop = new Set(['fund','plan','option','the','scheme','growth','direct','regular','idcw','dividend']);
  const rTokens = r.split(' ').filter(t => t.length > 2 && !stop.has(t));
  const cTokens = new Set(c.split(' '));
  for (const t of rTokens) if (cTokens.has(t)) score += 2;
  return score;
}

async function resolveSchemeCode(schemeRaw) {
  const base = schemeRaw.replace(/\b(direct|regular|plan|growth|idcw|dividend|option|reinvestment|payout)\b/gi, ' ')
    .replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
  try {
    const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(base || schemeRaw)}`);
    if (!res.ok) return null;
    const list = await res.json();
    let best = null, bestScore = -Infinity;
    for (const s of (list || [])) {
      const sc = scoreMatch(schemeRaw, s.schemeName);
      if (sc > bestScore) { bestScore = sc; best = { schemeCode: String(s.schemeCode), schemeName: s.schemeName }; }
    }
    return bestScore > 0 ? best : null;
  } catch { return null; }
}

async function navOnDate(schemeCode, isoDate) {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 'SUCCESS' || !Array.isArray(json.data)) return null;
    const target = new Date(isoDate).getTime();
    let after = null, before = null;
    for (const row of json.data) {
      const iso = mfapiDateToIso(row.date);
      const nav = parseFloat(row.nav);
      if (!iso || !Number.isFinite(nav) || nav <= 0) continue;
      const t = new Date(iso).getTime();
      if (t >= target) { if (!after || t < new Date(after.date).getTime()) after = { nav, date: iso }; }
      else { if (!before || t > new Date(before.date).getTime()) before = { nav, date: iso }; }
    }
    return after ?? before;
  } catch { return null; }
}

// ─── Handler ─────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.INGEST_SECRET || req.headers['x-ingest-secret'] !== process.env.INGEST_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const text = [body?.subject, body?.body].filter(Boolean).join('\n');

  const parsed = parseSipEmail(text);
  if (!parsed) return res.status(422).json({ error: 'Could not parse a SIP installment from the email' });

  let db;
  try { db = getDb(); } catch (e) {
    return res.status(500).json({ error: 'Firebase Admin not configured', detail: String(e.message || e) });
  }

  // Read-only: resolve attribution from the folio registry in shared-family
  const warnings = [];
  let mapping = null;
  try {
    const snap = await db.doc('users/shared-family').get();
    const mappings = (snap.exists && snap.data()?.folioMappings) || [];
    mapping = mappings.find(m => String(m.folioNumber).trim() === parsed.folioNumber.trim()) || null;
  } catch { warnings.push('Could not read folio registry.'); }
  if (!mapping) warnings.push('No folio mapping — set beneficiary/guardian in review.');

  // Units: from the email if present, else estimate from NAV
  let schemeCode = mapping?.schemeCode;
  if (!schemeCode) { const r = await resolveSchemeCode(parsed.schemeRaw); schemeCode = r?.schemeCode; }
  let units = parsed.units, nav = parsed.nav, navDate;
  if ((units == null || nav == null) && schemeCode) {
    const point = await navOnDate(schemeCode, parsed.installmentDate);
    if (point) { nav = point.nav; navDate = point.date; units = Math.round((parsed.amount / point.nav) * 1000) / 1000; warnings.push(`Units estimated from NAV ₹${point.nav} on ${point.date}.`); }
  }
  if (units == null || nav == null) warnings.push('Units/NAV unresolved — enter manually in review.');

  const fingerprint = `${parsed.folioNumber}|${parsed.installmentDate}|${parsed.amount}`;
  const docId = fingerprint.replace(/[^a-zA-Z0-9]/g, '_');
  const record = {
    source: body?.source || 'gmail',
    externalId: body?.gmailMessageId || fingerprint,
    folioNumber: parsed.folioNumber,
    amc: mapping?.amc || parsed.amc,
    schemeName: mapping?.schemeName || parsed.schemeRaw,
    schemeCode: schemeCode || null,
    memberId: mapping?.memberId || null,
    guardianMemberId: mapping?.guardianMemberId || null,
    amount: parsed.amount,
    installmentDate: parsed.installmentDate,
    estimatedUnits: units ?? null,
    estimatedNav: nav ?? null,
    navDate: navDate || null,
    isSIP: mapping?.isSIP ?? true,
    createdAt: new Date().toISOString(),
    warnings,
    gmailAccount: body?.account || null,
  };

  try {
    // Idempotent: same installment overwrites the same doc — never duplicates.
    await db.collection('sipInbox').doc(docId).set(record, { merge: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to stage transaction', detail: String(e.message || e) });
  }

  return res.status(200).json({ ok: true, staged: docId, record });
}

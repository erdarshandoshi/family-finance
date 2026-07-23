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

// ─── Email parsing (mirrors src/utils/sipParser.ts) ──────────────────────────────
// Field-by-field with fallbacks, because AMC/RTA formats differ:
//   • "Label : value"   — HDFC/CAMS debit alerts
//   • "Label<TAB>value" — KFintech/Quant transaction tables (no colon at all)
//   • prose sentences   — SBI/CAMS purchase confirmations
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

// Strict: the whole value must be numeric, so "02/07/2026" is never read as 2.
function toNumber(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[₹\s]/g, '').replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Row separator is the first colon, or a tab / run of spaces. Requiring the label to
// start the line keeps prose containing the same words from matching.
function fieldMatches(text, labels) {
  const out = [];
  // Whitespace-normalised, so the separator can be a colon, a tab, or a single space —
  // Gmail renders KFintech tables as plain "Label value" on one line.
  const norms = text.split(/\r?\n/).map(l => l.trim().replace(/\s+/g, ' '));
  for (const label of labels) {
    const target = label.toLowerCase();
    for (let i = 0; i < norms.length; i++) {
      const norm = norms[i];
      if (!norm.toLowerCase().startsWith(target)) continue;

      let v = norm.slice(label.length).replace(/^[\s:|]+/, '').trim();
      if (!v) {
        if (norm.length > 40) continue;   // a long bare line is prose, not a label
        // Some clients flatten tables to "label\nvalue" — use the next non-empty line
        for (let j = i + 1; j < norms.length && j <= i + 3; j++) {
          if (norms[j]) { v = norms[j]; break; }
        }
      }
      if (v) out.push(v);
    }
  }
  return out;
}

function fieldValue(text, labels) {
  const all = fieldMatches(text, labels);
  return all.length ? all[0] : null;
}

const DATE_LIKE = /\d{1,2}[-/][A-Za-z0-9]{2,}[-/]\d{2,4}/;

// First labelled value that yields a number. Searching for a label prefix can leave the
// rest of the label attached ("Units (Nos" → ".) Allotted 81.479"), so fall back to the
// trailing number — but never pull one out of a date, so "NAV Date 02/07/2026" can't
// masquerade as the NAV.
function fieldNumber(text, labels) {
  for (const v of fieldMatches(text, labels)) {
    const direct = toNumber(v);
    if (direct != null) return direct;
    if (DATE_LIKE.test(v)) continue;
    const nums = v.match(/-?\d[\d,]*(?:\.\d+)?/g);
    if (nums && nums.length) {
      const n = toNumber(nums[nums.length - 1]);
      if (n != null) return n;
    }
  }
  return null;
}

const AMC_FILLER = /^(for|from|is|the|to|your|of|in|at|and|dear|greetings|processed|sincerely|regards)$/i;

// Matched per line so a subject like "…is processed" can't bleed into the brand name.
function detectAmc(text, schemeRaw) {
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/([A-Za-z][A-Za-z&.]*(?:\s+[A-Za-z][A-Za-z&.]*){0,3})\s*-?\s*Mutual\s+Fund/i);
    if (!m) continue;
    const words = m[1].split(/\s+/).filter(w => !AMC_FILLER.test(w));
    if (words.length) return `${words.join(' ')} Mutual Fund`;
  }
  const brand = String(schemeRaw || '').trim().split(/\s+/)[0] || '';
  return brand ? `${brand.charAt(0).toUpperCase()}${brand.slice(1)} Mutual Fund` : 'Mutual Fund';
}

// Cancellations, rejections and failures carry a folio, date and amount too, so they
// would otherwise parse as a purchase and add a holding for a SIP that was stopped.
const NEGATIVE_SUBJECT = /\b(cancell?ation|cancell?ed|ceas(?:e|ed)|discontinu\w*|reject\w*|fail\w*|revers\w*|refund\w*|stopp?ed|unsuccessful)\b/i;
const NEGATIVE_PHRASE = /\b(?:cancellation of|has been cancell?ed|request for cancellation|could not be processed|not been processed|transaction (?:failed|rejected))\b/i;

export function isNonPurchaseNotice(text) {
  const s = String(text || '');
  const firstLine = s.split(/\r?\n/)[0] || '';
  return NEGATIVE_SUBJECT.test(firstLine) || NEGATIVE_PHRASE.test(s);
}

/** A record whose units and NAV were stated in the email, not derived from a NAV lookup. */
function isProcessedRecord(r) {
  return !!r && r.unitsEstimated === false && r.estimatedUnits != null && r.estimatedNav != null;
}

/**
 * An RTA sends a "request received" mail (amount only) and a later "processed" mail
 * (exact units/NAV, and an amount net of stamp duty) under one reference. They share a
 * doc, so guard against the request's figures landing on top of the processed ones.
 */
export function shouldKeepExisting(prev, incoming) {
  return isProcessedRecord(prev) && !isProcessedRecord(incoming);
}

// Aliases are exact — once a masked form has been corrected once, it resolves
// deterministically instead of relying on the trailing-digit heuristic.
export function folioMappingMatches(mapping, parsed) {
  if (folioMatches(mapping.folioNumber, parsed)) return true;
  const p = String(parsed || '').replace(/\s/g, '').toLowerCase();
  return (mapping.folioAliases || [])
    .some(a => String(a || '').replace(/\s/g, '').toLowerCase() === p);
}

export function isMaskedFolio(folio) {
  return /[x*]/i.test(String(folio || ''));
}

// Stored folios are full; emailed ones may be masked ("XXXXXXXX4331"), so fall back
// to comparing the visible trailing digits.
export function folioMatches(stored, parsed) {
  const a = String(stored || '').replace(/\s/g, '').toLowerCase();
  const b = String(parsed || '').replace(/\s/g, '').toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (!isMaskedFolio(a) && !isMaskedFolio(b)) return false;
  const tail = s => (s.match(/\d+$/) || [''])[0];
  const ta = tail(a), tb = tail(b);
  if (ta.length < 4 || tb.length < 4) return false;
  const n = Math.min(ta.length, tb.length);
  return ta.slice(-n) === tb.slice(-n);
}

function extractFields(text) {
  const flat = String(text || '').replace(/\s+/g, ' ');

  let folio = fieldValue(text, ['Folio Number', 'Folio No', 'Folio']);
  if (!folio) {
    const m = flat.match(/Folio\s*(?:Number|No\.?)?\s*(?:\/\s*DP\s*ID\.?)?\s*(?:Folio\s*)?([x*\d][\w/-]*)/i);
    folio = m ? m[1] : null;
  }
  if (folio) folio = folio.replace(/[.,;]+$/, '').trim();

  let schemeRaw = fieldValue(text, ['Scheme Details', 'Scheme Name', 'SIP registered under', 'Scheme']);
  if (!schemeRaw) {
    const m = flat.match(/(?:purchase|investment|subscription)\s+(?:in|under)\s+(.+?)\s+(?:for\s+(?:value\s+date|Rs)|on\s+\d)/i);
    schemeRaw = m ? m[1].trim() : null;
  }

  const navDateRaw = fieldValue(text, ['NAV Date', 'Value Date']);
  let dateRaw = navDateRaw
    || fieldValue(text, ['Transaction Date', 'Installment Date', 'Instalment Date', 'Date of Transaction', 'SIP Date']);
  if (!dateRaw) {
    const m = flat.match(/(?:value\s+date|nav\s+date|dated|on)\s*:?\s*(\d{1,2}[-/][A-Za-z]{3,}[-/]\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{4})/i);
    dateRaw = m ? m[1] : null;
  }
  const installmentDate = dateRaw ? parseSipDate(dateRaw) : null;

  let amount = fieldNumber(text, ['Installment Amount', 'Instalment Amount', 'Amount', 'SIP Amount']);
  if (amount == null) {
    const m = flat.match(/(?:for|of)\s+Rs\.?\s*([\d,]+(?:\.\d+)?)/i);
    amount = toNumber(m && m[1]);
  }

  const missing = [];
  if (!folio) missing.push('folio');
  if (!schemeRaw) missing.push('scheme');
  if (!installmentDate) missing.push('date');
  if (amount == null) missing.push('amount');

  let units = fieldNumber(text, ['Units (Nos', 'Units Allotted', 'Allotted Units', 'No. of Units', 'Units']);
  if (units == null) {
    const m = flat.match(/([\d,]+(?:\.\d+)?)\s*units?\b/i);
    units = toNumber(m && m[1]);
  }

  let nav = fieldNumber(text, ['NAV (Rs', 'NAV per unit', 'Allotment NAV', 'Purchase Price', 'NAV', 'Price']);
  if (nav == null) {
    const m = flat.match(/at\s+NAV\s+of\s+(?:Rs\.?\s*)?([\d,]+(?:\.\d+)?)/i);
    nav = toNumber(m && m[1]);
  }

  if (units == null && nav != null && nav > 0) units = Math.round((amount / nav) * 1000) / 1000;

  const navDate = nav != null && nav > 0
    ? (navDateRaw ? (parseSipDate(navDateRaw) || installmentDate) : installmentDate)
    : undefined;

  return {
    missing,
    amc: detectAmc(text, schemeRaw || ''),
    folioNumber: folio,
    installmentDate,
    schemeRaw: schemeRaw ? schemeRaw.replace(/\s+/g, ' ').trim() : null,
    amount,
    units: units != null && units > 0 ? units : undefined,
    nav: nav != null && nav > 0 ? nav : undefined,
    navDate,
    reference: fieldValue(text, ['Transaction Reference Number', 'Transaction Reference', 'Reference Number']) || undefined,
  };
}

export function parseSipEmail(text) {
  if (!text || !text.trim()) return null;
  if (isNonPurchaseNotice(text)) return null;   // never read a cancellation as a purchase
  const f = extractFields(text);
  if (f.missing.length) return null;
  delete f.missing;
  return f;
}

// What the parser could and couldn't find. Returned in the 422 so a failure is
// diagnosable straight from the Apps Script log instead of by guesswork.
export function describeParse(text) {
  const f = extractFields(String(text || ''));
  return {
    missing: f.missing,
    found: {
      folio: f.folioNumber || null,
      scheme: f.schemeRaw || null,
      date: f.installmentDate || null,
      amount: f.amount == null ? null : f.amount,
      units: f.units == null ? null : f.units,
      nav: f.nav == null ? null : f.nav,
      reference: f.reference || null,
    },
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

  // Never turn a cancellation/rejection into a holding
  if (isNonPurchaseNotice(text)) {
    return res.status(422).json({
      error: 'Ignored — not a purchase (cancellation/rejection/failure notice)',
      subject: body?.subject || null,
    });
  }

  const parsed = parseSipEmail(text);
  if (!parsed) {
    const diag = describeParse(text);
    return res.status(422).json({
      error: 'Could not parse a SIP installment from the email',
      missing: diag.missing,
      found: diag.found,
      subject: body?.subject || null,
      preview: String(text).replace(/\s+/g, ' ').slice(0, 300),
    });
  }

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
    mapping = mappings.find(m => folioMappingMatches(m, parsed.folioNumber)) || null;
  } catch { warnings.push('Could not read folio registry.'); }
  if (!mapping) warnings.push('No folio mapping — set beneficiary/guardian in review.');

  // Units: from the email if present, else estimate from NAV
  let schemeCode = mapping?.schemeCode;
  if (!schemeCode) { const r = await resolveSchemeCode(parsed.schemeRaw); schemeCode = r?.schemeCode; }
  let units = parsed.units, nav = parsed.nav, navDate = parsed.navDate;
  let unitsEstimated = false;
  if ((units == null || nav == null) && schemeCode) {
    const point = await navOnDate(schemeCode, parsed.installmentDate);
    if (point) {
      nav = point.nav; navDate = point.date; unitsEstimated = true;
      units = Math.round((parsed.amount / point.nav) * 1000) / 1000;
      warnings.push(`Units estimated from NAV ₹${point.nav} on ${point.date}.`);
    }
  }
  if (units == null || nav == null) warnings.push('Units/NAV unresolved — enter manually in review.');

  // An RTA sends a "request received" mail and a later "processed" mail for the same
  // purchase, with different amounts (stamp duty) but the SAME reference — so key on the
  // reference when present, and fall back to folio+date+amount otherwise.
  const fingerprint = parsed.reference
    ? `ref:${parsed.reference}`
    : `${parsed.folioNumber}|${parsed.installmentDate}|${parsed.amount}`;
  const docId = fingerprint.replace(/[^a-zA-Z0-9]/g, '_');
  const record = {
    source: body?.source || 'gmail',
    externalId: fingerprint,
    // Prefer the registry's full folio over a masked one from the email
    folioNumber: mapping?.folioNumber || parsed.folioNumber,
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
    unitsEstimated,
    isSIP: mapping?.isSIP ?? true,
    createdAt: new Date().toISOString(),
    receivedAt: body?.date || null,
    warnings,
    gmailAccount: body?.account || null,
  };

  try {
    // Idempotent: same installment reuses the same doc — never duplicates.
    const ref = db.collection('sipInbox').doc(docId);
    const snap = await ref.get();
    const prev = snap.exists ? snap.data() : null;

    if (shouldKeepExisting(prev, record)) {
      // Already staged from the "processed" mail — keep its exact units/NAV/amount and
      // only fill in anything that record was missing.
      const fill = {};
      for (const k of ['memberId', 'guardianMemberId', 'schemeCode', 'gmailAccount', 'receivedAt']) {
        if ((prev[k] === undefined || prev[k] === null || prev[k] === '') && record[k] != null) fill[k] = record[k];
      }
      if (Object.keys(fill).length) await ref.set(fill, { merge: true });
      return res.status(200).json({
        ok: true, staged: docId, keptProcessed: true,
        record: Object.assign({}, prev, fill),
      });
    }

    await ref.set(record, { merge: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to stage transaction', detail: String(e.message || e) });
  }

  return res.status(200).json({ ok: true, staged: docId, record });
}

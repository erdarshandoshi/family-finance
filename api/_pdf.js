// Read password-protected account-statement PDFs (Invesco/KFintech and friends) and pull
// the SIP transaction out of them. Not a route — Vercel ignores api/ files starting with _.
//
// Env: STATEMENT_PDF_PASSWORDS — comma-separated passwords to try (AMCs use the primary
// holder's PAN, so one per holder). Server-side only; never sent to the browser.

import { createRequire } from 'node:module';
import path from 'node:path';

// pdf.js ships a legacy build for Node; the modern one expects browser globals.
async function loadPdfjs() {
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return mod.default ?? mod;
}

/**
 * Statements are typeset in the PDF standard fonts, which pdf.js loads from disk. Without
 * this it warns and can mis-extract glyphs — exactly the text we depend on.
 */
function standardFontDir() {
  try {
    const require = createRequire(import.meta.url);
    const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
    // pdf.js insists on a forward-slash trailing separator, on Windows too
    return path.join(root, 'standard_fonts').replace(/\\/g, '/') + '/';
  } catch {
    return undefined;
  }
}

export function configuredPasswords() {
  return String(process.env.STATEMENT_PDF_PASSWORDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Text of a PDF, one line per visual row.
 *
 * getTextContent() returns positioned fragments, not lines — joining them naively
 * destroys the table structure a statement is made of. Group by baseline Y instead so
 * each row stays on its own line.
 */
export async function extractPdfText(base64, passwords = configuredPasswords()) {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(Buffer.from(String(base64), 'base64'));

  const attempts = [...passwords, ''];     // '' covers an unprotected statement
  let lastErr = null;

  for (const password of attempts) {
    let doc;
    try {
      doc = await pdfjs.getDocument({
        data: data.slice(),                // getDocument transfers the buffer
        password,
        isEvalSupported: false,
        useSystemFonts: false,
        disableFontFace: true,
        standardFontDataUrl: standardFontDir(),
      }).promise;
    } catch (e) {
      lastErr = e;
      // Wrong/needed password → try the next one; anything else is fatal
      if (e?.name === 'PasswordException') continue;
      throw new Error(`Could not open the PDF: ${e?.message || e}`);
    }

    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      const rows = [];                     // { y, items: [{ x, str }] }
      for (const it of content.items) {
        const str = (it.str ?? '').trim();
        if (!str) continue;
        const x = it.transform[4], y = it.transform[5];
        const row = rows.find(r => Math.abs(r.y - y) <= 2.5);   // same visual line
        if (row) row.items.push({ x, str });
        else rows.push({ y, items: [{ x, str }] });
      }

      rows.sort((a, b) => b.y - a.y);      // PDF origin is bottom-left
      for (const r of rows) {
        r.items.sort((a, b) => a.x - b.x);
        lines.push(r.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim());
      }
    }

    return { text: lines.join('\n'), pages: doc.numPages, unlocked: true, usedPassword: !!password };
  }

  const needed = lastErr?.name === 'PasswordException';
  throw new Error(needed
    ? 'PDF is password protected and none of the configured passwords worked (set STATEMENT_PDF_PASSWORDS).'
    : `Could not open the PDF: ${lastErr?.message || lastErr}`);
}

// ─── Statement row parsing ───────────────────────────────────────────────────────

const MONTHS = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };

/** Every date in a line, as ISO. Handles 23-Jul-2026, 23/07/2026, 2026-07-23. */
function datesIn(line) {
  const out = [];
  const re = /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})|(\d{1,2})[-/](\d{1,2})[-/](\d{4})/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1]) out.push(`${m[1]}-${m[2]}-${m[3]}`);
    else if (m[4]) {
      const mon = MONTHS[m[5].slice(0, 3).toLowerCase()];
      if (mon) out.push(`${m[6]}-${mon}-${String(m[4]).padStart(2, '0')}`);
    } else if (m[7]) out.push(`${m[9]}-${String(m[8]).padStart(2,'0')}-${String(m[7]).padStart(2,'0')}`);
  }
  return out;
}

/** Numeric tokens, ignoring anything that was part of a date. */
function numbersIn(line) {
  const stripped = line.replace(
    /(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})|(\d{1,2})[-/](\d{1,2})[-/](\d{4})/g, ' ');
  return (stripped.match(/-?\d[\d,]*(?:\.\d+)?/g) || [])
    .map(s => parseFloat(s.replace(/,/g, '')))
    .filter(n => Number.isFinite(n));
}

/**
 * Pick amount / units / NAV out of a row's numbers using the one relationship that must
 * hold: amount = units × NAV. Far sturdier than assuming a column order, which differs
 * between AMCs and breaks silently when it's wrong.
 */
export function tripleFrom(nums) {
  let best = null;
  for (const amount of nums) {
    if (amount < 100) continue;                       // an instalment, not a unit count
    for (const units of nums) {
      if (units <= 0 || units === amount) continue;
      for (const nav of nums) {
        if (nav <= 0 || nav === amount || nav === units) continue;
        if (nav > 1e6) continue;
        const tolerance = Math.max(1, amount * 0.005);   // rounding + stamp duty
        if (Math.abs(amount - units * nav) > tolerance) continue;
        if (!best || amount > best.amount) best = { amount, units, nav };
      }
    }
  }
  return best;
}

/**
 * amount = units × NAV is symmetric, so a row alone can't say which factor is which —
 * column order differs between AMCs. Settle it against the scheme's real NAV for that day.
 * Returns the triple unchanged when there's no hint or it's already the closer fit.
 */
export function orientTriple(t, navHint) {
  if (!t || !Number.isFinite(navHint) || navHint <= 0) return t;
  const asIs = Math.abs(t.nav - navHint);
  const swapped = Math.abs(t.units - navHint);
  return swapped < asIs ? { ...t, units: t.nav, nav: t.units, swapped: true } : t;
}

/** True when the two factors are close enough that the wrong one could be picked. */
export function isAmbiguous(t) {
  if (!t) return false;
  const ratio = t.units > t.nav ? t.units / t.nav : t.nav / t.units;
  return ratio < 10;          // an order of magnitude apart is unambiguous enough
}

const PURCHASE_ROW = /(sip|purchase|instal?ment|investment|subscription)/i;
const SKIP_ROW = /(redemption|redeem|switch\s*out|reversal|rejected|cancell?)/i;

/**
 * The SIP transaction in a statement. Prefers the row matching `preferDate` (the date the
 * email quoted); otherwise the latest purchase row.
 */
export function parseStatement(text, preferDate) {
  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (SKIP_ROW.test(line)) continue;
    const dates = datesIn(line);
    if (!dates.length) continue;
    const t = tripleFrom(numbersIn(line));
    if (!t) continue;
    rows.push({ date: dates[0], ...t, line: line.slice(0, 200), isPurchase: PURCHASE_ROW.test(line) });
  }
  if (!rows.length) return null;

  const exact = preferDate && rows.find(r => r.date === preferDate);
  if (exact) return exact;

  const purchases = rows.filter(r => r.isPurchase);
  const pool = purchases.length ? purchases : rows;
  return pool.reduce((a, b) => (b.date > a.date ? b : a));
}

export const _internal = { datesIn, numbersIn };

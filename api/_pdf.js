// Read password-protected account-statement PDFs (Invesco/KFintech and friends) and pull
// the SIP transaction out of them. Not a route — Vercel ignores api/ files starting with _.
//
// Env: STATEMENT_PDF_PASSWORDS — comma-separated passwords to try (AMCs use the primary
// holder's PAN, so one per holder). Server-side only; never sent to the browser.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

/**
 * pdf.js polyfills DOMMatrix/Path2D/ImageData on import — but only when it decides it's in
 * Node, and on a serverless runtime that ships a `navigator` global it skips them, so text
 * extraction dies with "DOMMatrix is not defined". Install them ourselves first (`??=`, so
 * a real browser/Node global always wins). Only a 2D DOMMatrix is needed for text.
 */
function installPdfGlobals() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    class DOMMatrix {
      constructor(init) {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        if (Array.isArray(init) || init instanceof Float64Array || init instanceof Float32Array) {
          const n = Array.from(init);
          if (n.length === 6) [this.a, this.b, this.c, this.d, this.e, this.f] = n;
          else if (n.length === 16) { this.a = n[0]; this.b = n[1]; this.c = n[4]; this.d = n[5]; this.e = n[12]; this.f = n[13]; }
        }
      }
      get m11() { return this.a; } get m12() { return this.b; }
      get m21() { return this.c; } get m22() { return this.d; }
      get m41() { return this.e; } get m42() { return this.f; }
      get m13() { return 0; } get m14() { return 0; } get m23() { return 0; } get m24() { return 0; }
      get m31() { return 0; } get m32() { return 0; } get m33() { return 1; } get m34() { return 0; }
      get m43() { return 0; } get m44() { return 1; }
      get is2D() { return true; }
      get isIdentity() { return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0; }
      multiply(o) {
        const r = new DOMMatrix();
        r.a = this.a * o.a + this.c * o.b;
        r.b = this.b * o.a + this.d * o.b;
        r.c = this.a * o.c + this.c * o.d;
        r.d = this.b * o.c + this.d * o.d;
        r.e = this.a * o.e + this.c * o.f + this.e;
        r.f = this.b * o.e + this.d * o.f + this.f;
        return r;
      }
      multiplySelf(o) { return Object.assign(this, this.multiply(o)); }
      preMultiplySelf(o) { return Object.assign(this, o.multiply(this)); }
      translate(tx = 0, ty = 0) { return this.multiply(new DOMMatrix([1, 0, 0, 1, tx, ty])); }
      translateSelf(tx = 0, ty = 0) { return this.multiplySelf(new DOMMatrix([1, 0, 0, 1, tx, ty])); }
      scale(sx = 1, sy) { return this.multiply(new DOMMatrix([sx, 0, 0, sy ?? sx, 0, 0])); }
      scaleSelf(sx = 1, sy) { return this.multiplySelf(new DOMMatrix([sx, 0, 0, sy ?? sx, 0, 0])); }
      rotate(deg = 0) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return this.multiply(new DOMMatrix([c, s, -s, c, 0, 0])); }
      rotateSelf(deg = 0) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return this.multiplySelf(new DOMMatrix([c, s, -s, c, 0, 0])); }
      inverse() {
        const det = this.a * this.d - this.b * this.c, r = new DOMMatrix();
        if (!det) { r.a = r.b = r.c = r.d = r.e = r.f = NaN; return r; }
        r.a = this.d / det; r.b = -this.b / det; r.c = -this.c / det; r.d = this.a / det;
        r.e = (this.c * this.f - this.d * this.e) / det; r.f = (this.b * this.e - this.a * this.f) / det;
        return r;
      }
      invertSelf() { return Object.assign(this, this.inverse()); }
      transformPoint(p = { x: 0, y: 0 }) {
        return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f, z: 0, w: 1 };
      }
      toFloat32Array() { return new Float32Array([this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1]); }
      toFloat64Array() { return new Float64Array([this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1]); }
      toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`; }
    }
    DOMMatrix.__ffPolyfill = true;
    globalThis.DOMMatrix = DOMMatrix;
  }
  // Only constructed, never drawn, during text extraction — stubs are enough.
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D { addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} rect() {} arc() {} };
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {
      constructor(w, h) { this.width = w | 0; this.height = h | 0; this.data = new Uint8ClampedArray((this.width) * (this.height) * 4); }
    };
  }
}

// pdf.js ships a legacy build for Node; the modern one expects browser globals.
async function loadPdfjs() {
  installPdfGlobals();
  const mod = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = mod.default ?? mod;
  // Point pdf.js at its worker explicitly. The bundler doesn't trace the dynamic import
  // it uses to find it, so on the serverless runtime it can't be located otherwise.
  try {
    const require = createRequire(import.meta.url);
    // The ESM loader needs a file:// URL, not a raw path (a bare Windows/Vercel path fails)
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
  } catch { /* fall back to pdf.js's own resolution */ }
  return pdfjs;
}

/**
 * Statements are typeset in the PDF standard fonts, which pdf.js loads from disk. Without
 * this it warns and can mis-extract glyphs — exactly the text we depend on.
 */
function standardFontDir() {
  try {
    const require = createRequire(import.meta.url);
    const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
    const dir = path.join(root, 'standard_fonts');
    // Serverless bundlers trace static imports, not paths built at runtime, so these
    // font files may not be deployed. Pointing pdf.js at a missing directory fails
    // harder than not setting it at all.
    if (!fs.existsSync(dir)) return undefined;
    // pdf.js insists on a forward-slash trailing separator, on Windows too
    return dir.replace(/\\/g, '/') + '/';
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

/**
 * The NAV the statement itself declares, e.g. "NAV as on 24/07/2026(Rs. )51.67".
 * Preferred over a network lookup for orienting a row: it's the same document, so it
 * can't disagree with it.
 */
export function navHintFromText(text) {
  const flat = String(text).replace(/\s+/g, ' ');
  const m = flat.match(/NAV\s+as\s+on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s*\(?\s*Rs\.?\s*\)?\s*([\d,]+(?:\.\d+)?)/i)
    || flat.match(/(?:last\s+declared|applicable)\s+NAV[^\d]{0,20}([\d,]+\.\d+)/i);
  const n = m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const PURCHASE_ROW = /(sip|purchase|instal?ment|investment|subscription)/i;
// Registration/summary rows repeat the instalment amount and dates without being a
// transaction, so they must never be mistaken for one.
const SKIP_ROW = /(redemption|redeem|switch\s*out|reversal|rejected|cancell?|registration|opening\s+balance|closing|portfolio\s+summary)/i;

/**
 * The SIP transaction in a statement. Prefers the row matching `preferDate` (the date the
 * email quoted); otherwise the latest purchase row.
 */
export function parseStatement(text, preferDate) {
  const navHint = navHintFromText(text);

  const rows = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (SKIP_ROW.test(line)) continue;
    const dates = datesIn(line);
    if (!dates.length) continue;
    const t = tripleFrom(numbersIn(line));
    if (!t) continue;
    // A row may carry both a transaction date and a NAV date; keep both for matching.
    rows.push({ date: dates[0], dates, ...t, line: line.slice(0, 200), isPurchase: PURCHASE_ROW.test(line) });
  }
  if (!rows.length) return null;

  const finish = r => {
    const oriented = orientTriple(r, navHint);
    return { ...oriented, navHint, ambiguous: navHint ? false : isAmbiguous(r) };
  };

  if (preferDate) {
    // Units are allotted at the next business day's NAV, so the row's date often trails
    // the instalment date the email quotes — match on any date the row carries, then
    // widen to the nearest few days rather than silently falling back to "latest".
    const onDate = rows.filter(r => r.dates.includes(preferDate));
    if (onDate.length) return finish(onDate[onDate.length - 1]);

    const target = new Date(preferDate).getTime();
    const near = rows
      .map(r => ({ r, gap: Math.min(...r.dates.map(d => Math.abs(new Date(d).getTime() - target))) }))
      .filter(x => x.gap <= 5 * 86400000)
      .sort((a, b) => a.gap - b.gap || (b.r.isPurchase ? 1 : 0) - (a.r.isPurchase ? 1 : 0));
    if (near.length) return finish(near[0].r);
  }

  const purchases = rows.filter(r => r.isPurchase);
  const pool = purchases.length ? purchases : rows;
  return finish(pool.reduce((a, b) => (b.date > a.date ? b : a)));
}

export const _internal = { datesIn, numbersIn };

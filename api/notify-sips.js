// Daily reminder: push a notification N days before each SIP's expected debit.
// Triggered by the Vercel cron in vercel.json. Add ?dry=1 to see what would be sent
// without sending anything.
//
// Env: FIREBASE_SERVICE_ACCOUNT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//      CRON_SECRET (Vercel sends it as `Authorization: Bearer …` when set)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
    const svc = JSON.parse(raw);
    if (typeof svc.private_key === 'string') svc.private_key = svc.private_key.replace(/\\n/g, '\n');
    initializeApp({ credential: cert(svc) });
  }
  return getFirestore();
}

// ─── Dates, in IST — the server runs in UTC but SIP dates are Indian calendar dates ──
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

function istParts(offsetDays = 0) {
  const d = new Date(Date.now() + IST_OFFSET_MS + offsetDays * 86400000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
}

const pad = n => String(n).padStart(2, '0');
const isoOf = p => `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// ─── SIP grouping — mirrors src/utils/mfUtils.ts ─────────────────────────────────
export function groupSips(mfs) {
  const map = new Map();
  for (const mf of mfs) {
    if (!mf?.isSIP) continue;
    const key = mf.schemeCode
      ? `${mf.schemeCode}__${mf.memberId}`
      : `${mf.companyName}__${mf.schemeName}__${mf.memberId}`;
    if (!map.has(key)) map.set(key, { schemeName: mf.schemeName || mf.companyName, memberId: mf.memberId, lots: [] });
    map.get(key).lots.push(mf);
  }
  return [...map.values()];
}

/** The day of the month a SIP usually lands on — the most common across recurring lots. */
export function sipDayOf(lots) {
  const counts = new Map();
  for (const l of lots) {
    if (l.isInitialPayment) continue;
    const d = Number(String(l.dateOfPurchase).slice(8, 10));
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best = null, bestN = 0;
  counts.forEach((n, d) => { if (n > bestN) { bestN = n; best = d; } });
  return best;
}

/**
 * SIPs whose expected debit falls exactly `leadDays` from today, skipping any that
 * already have an instalment recorded in that month.
 */
export function dueOn(groups, leadDays) {
  const target = istParts(leadDays);
  const targetIso = isoOf(target);
  const ym = targetIso.slice(0, 7);

  return groups.flatMap(g => {
    const day = sipDayOf(g.lots);
    if (day == null) return [];                                   // no rhythm established yet
    // A 31st SIP lands on the 30th in a 30-day month
    const expected = Math.min(day, daysInMonth(target.y, target.m));
    if (expected !== target.d) return [];
    if (g.lots.some(l => String(l.dateOfPurchase).startsWith(ym))) return [];  // already debited

    const recurring = g.lots.filter(l => !l.isInitialPayment)
      .sort((a, b) => String(b.dateOfPurchase).localeCompare(String(a.dateOfPurchase)));
    const latest = recurring[0] ?? g.lots[0];
    const amount = latest ? Math.round(latest.quantity * latest.purchasePrice) : 0;
    return [{ schemeName: g.schemeName, amount, date: targetIso }];
  });
}

const inr = n => '₹' + Number(n).toLocaleString('en-IN');

// Human lead-time label, so 7/14/30 read as weeks/months rather than "in 30 days".
export function whenLabel(d) {
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === 30) return 'in 1 month';
  if (d === 60) return 'in 2 months';
  if (d === 7) return 'in 1 week';
  if (d === 14) return 'in 2 weeks';
  if (d === 21) return 'in 3 weeks';
  return `in ${d} days`;
}

const KINDS = {
  sip:  { one: 'SIP debit',              many: 'SIP debits',              url: '/mf' },
  fd:   { one: 'FD matures',             many: 'FDs mature',              url: '/fd' },
  post: { one: 'Post Office matures',    many: 'Post Office schemes mature', url: '/post' },
};

export function buildMsg(kind, due, leadDays, dateKey) {
  const k = KINDS[kind];
  const total = due.reduce((s, d) => s + d.amount, 0);
  const when = whenLabel(leadDays);
  const title = due.length === 1
    ? `${k.one} ${when} — ${inr(due[0].amount)}`
    : `${due.length} ${k.many} ${when} — ${inr(total)}`;
  const body = due.map(d => `${d.name} · ${inr(d.amount)}`).join('\n');
  return { title, body, url: k.url, tag: `${kind}-${dateKey}` };
}

// Kept for the existing test; SIP items expose schemeName, others expose name.
export function buildMessage(due, leadDays) {
  return buildMsg('sip', due.map(d => ({ name: d.schemeName ?? d.name, amount: d.amount })), leadDays,
    due[0]?.date ?? isoOf(istParts(leadDays)));
}

// FD / Post: maturities landing exactly `leadDays` from today.
export function dueMaturities(items, leadDays, nameOf, amountOf) {
  const targetIso = isoOf(istParts(leadDays));
  return (items || [])
    .filter(it => it?.maturityDate && String(it.maturityDate).slice(0, 10) === targetIso)
    .map(it => ({ name: nameOf(it) || '—', amount: Math.round(Number(amountOf(it)) || 0), date: targetIso }));
}

// Preferences for a subscription. Legacy rows (flat leadDays, no prefs) keep their old
// SIP-only behaviour so nobody is surprised by FD/Post pushes they never opted into.
function prefsOf(sub) {
  if (sub.prefs) return sub.prefs;
  const lead = Number.isFinite(Number(sub.leadDays)) ? Number(sub.leadDays) : 2;
  return {
    sip:  { enabled: true,  leadDays: lead },
    fd:   { enabled: false, leadDays: 7 },
    post: { enabled: false, leadDays: 7 },
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dry = String(req.query?.dry || '') === '1';
  // Real reminders only fire on their own day, so ?test=1 proves the whole chain — private
  // key, subject, service worker, device — without waiting for one to fall due.
  const test = String(req.query?.test || '') === '1';

  let db;
  try { db = getDb(); } catch (e) {
    return res.status(500).json({ error: 'Firebase Admin not configured', detail: String(e.message || e) });
  }

  let data = {};
  try {
    const snap = await db.doc('users/shared-family').get();
    data = (snap.exists && snap.data()) || {};
  } catch (e) {
    return res.status(500).json({ error: 'Could not read holdings', detail: String(e.message || e) });
  }
  const groups = groupSips(data.mfs || []);
  const fds = data.fds || [];
  const posts = data.postInvestments || [];

  let subs = [];
  try {
    const snap = await db.collection('pushSubscriptions').get();
    snap.forEach(d => subs.push({ id: d.id, ...d.data() }));
  } catch (e) {
    return res.status(500).json({ error: 'Could not read subscriptions', detail: String(e.message || e) });
  }

  // The browser needs the public key under a VITE_ prefix; accept either name here so
  // it only has to be set once (two copies could drift apart and break encryption).
  const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  const { VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!dry) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(500).json({ error: 'VAPID keys are not configured' });
    }
    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:noreply@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }

  const report = [];
  let sent = 0, cleaned = 0;

  for (const sub of subs) {
    const prefs = prefsOf(sub);

    // One notification per category that has something due
    const payloads = [];
    if (test) {
      payloads.push({ title: 'Test — reminders are working', body: 'Your notifications are set up correctly.', url: '/notifications', tag: 'test' });
    } else {
      if (prefs.sip?.enabled) {
        const due = dueOn(groups, prefs.sip.leadDays);
        if (due.length) payloads.push(buildMsg('sip', due.map(d => ({ name: d.schemeName, amount: d.amount })), prefs.sip.leadDays, due[0].date));
      }
      if (prefs.fd?.enabled) {
        const due = dueMaturities(fds, prefs.fd.leadDays, f => f.bankName, f => f.maturityAmount);
        if (due.length) payloads.push(buildMsg('fd', due, prefs.fd.leadDays, due[0].date));
      }
      if (prefs.post?.enabled) {
        const due = dueMaturities(posts, prefs.post.leadDays, p => p.scheme, p => p.maturityAmount);
        if (due.length) payloads.push(buildMsg('post', due, prefs.post.leadDays, due[0].date));
      }
    }

    report.push({ id: sub.id, prefs, notifications: payloads.map(p => p.title) });
    if (dry || payloads.length === 0) continue;

    for (const payload of payloads) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
        sent++;
      } catch (e) {
        // 404/410 mean the browser threw the subscription away — drop it and stop
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await db.collection('pushSubscriptions').doc(sub.id).delete().catch(() => {});
          cleaned++;
          break;
        }
        report.push({ id: sub.id, error: String(e?.statusCode || e?.message || e) });
      }
    }
  }

  return res.status(200).json({
    ok: true, dry, test, today: isoOf(istParts(0)),
    sipGroups: groups.length, fds: fds.length, postSchemes: posts.length,
    subscriptions: subs.length, sent, cleaned, report,
  });
}

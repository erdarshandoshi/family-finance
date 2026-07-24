// Store / remove a Web Push subscription. Written with the Admin SDK so the browser
// never needs write access to Firestore (no security-rule changes required).
//
// POST   { subscription, email, leadDays, userAgent }  → upsert
// POST   { subscription, leadDays, partial: true }     → update lead time only
// DELETE { endpoint }                                  → remove

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'node:crypto';

function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT env var is not set');
    let svc;
    try { svc = JSON.parse(raw); }
    catch { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); }
    if (typeof svc.private_key === 'string') svc.private_key = svc.private_key.replace(/\\n/g, '\n');
    initializeApp({ credential: cert(svc) });
  }
  return getFirestore();
}

/** Endpoints are long URLs — hash them into a stable, Firestore-safe document id. */
export function endpointId(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 40);
}

export default async function handler(req, res) {
  let db;
  try { db = getDb(); } catch (e) {
    return res.status(500).json({ error: 'Firebase Admin not configured', detail: String(e.message || e) });
  }

  // Read this device's stored prefs (page load populates the toggles from here)
  if (req.method === 'GET') {
    const endpoint = req.query?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    try {
      const snap = await db.collection('pushSubscriptions').doc(endpointId(endpoint)).get();
      return res.status(200).json({ ok: true, prefs: (snap.exists && snap.data()?.prefs) || null });
    } catch (e) {
      return res.status(500).json({ error: 'Could not read subscription', detail: String(e.message || e) });
    }
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  if (req.method === 'DELETE') {
    const endpoint = body?.endpoint;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    try {
      await db.collection('pushSubscriptions').doc(endpointId(endpoint)).delete();
      return res.status(200).json({ ok: true, removed: true });
    } catch (e) {
      return res.status(500).json({ error: 'Could not remove subscription', detail: String(e.message || e) });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sub = body?.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ error: 'A complete push subscription is required' });
  }

  const clampLead = n => Math.max(0, Math.min(60, Number(n) || 0));
  const cleanPrefs = p => {
    if (!p || typeof p !== 'object') return undefined;
    const out = {};
    for (const k of ['sip', 'fd', 'post']) {
      if (p[k]) out[k] = { enabled: !!p[k].enabled, leadDays: clampLead(p[k].leadDays) };
    }
    return Object.keys(out).length ? out : undefined;
  };
  const prefs = cleanPrefs(body?.prefs);
  const id = endpointId(sub.endpoint);

  const record = body?.partial
    ? { updatedAt: new Date().toISOString() }
    : {
        endpoint: sub.endpoint,
        keys: sub.keys,
        email: body?.email || null,
        userAgent: body?.userAgent || null,
        updatedAt: new Date().toISOString(),
      };
  if (prefs) record.prefs = prefs;   // never write undefined — Admin SDK rejects it

  try {
    await db.collection('pushSubscriptions').doc(id).set(record, { merge: true });
    return res.status(200).json({ ok: true, id, prefs: prefs || null });
  } catch (e) {
    return res.status(500).json({ error: 'Could not save subscription', detail: String(e.message || e) });
  }
}

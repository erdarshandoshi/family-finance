# Push reminders — setup

A notification before money moves: **SIP debits**, **FD maturities** and **Post Office
maturities**. Each category has its own on/off and lead time (1 day … 1 month), set on the
**Notifications** page and stored per device.

```
Vercel cron (daily 09:00 IST) ──▶ /api/notify-sips
        │  reads holdings + push subscriptions (Admin SDK)
        │  finds SIPs due exactly N days out
        ▼
   Web Push ──▶ service worker (/sw.js) ──▶ notification on your phone
```

The debit day is derived from your existing instalments — nothing extra to enter. A SIP
is skipped if it has already been debited that month, and funds with only an initial
payment are ignored until a recurring rhythm exists.

---

## ⚠️ iPhone: install to the Home Screen first

Apple only exposes web push to **installed** PWAs (iOS 16.4+). In a Safari tab it will
not work, and the app will tell you so instead of failing silently.

**Safari → Share → Add to Home Screen → open it from the Home Screen icon.**

Android/Chrome works in a normal browser tab.

## 1. Generate VAPID keys (you do this — one is a private key)

```bash
npx web-push generate-vapid-keys
```

Prints a public and a private key. Don't paste them into chat.

## 2. Add Vercel environment variables

Settings → Environment Variables (Production), then **redeploy**:

| Name | Value |
|------|-------|
| `VITE_VAPID_PUBLIC_KEY` | the **public** key (shipped to the browser — that's fine) |
| `VAPID_PRIVATE_KEY` | the **private** key — server only |
| `VAPID_SUBJECT` | `mailto:er.darshandoshi@gmail.com` |
| `CRON_SECRET` | a long random string; Vercel sends it as `Authorization: Bearer …` |

The public key is only set once: the server falls back to `VITE_VAPID_PUBLIC_KEY`. (A
separate `VAPID_PUBLIC_KEY` still works if you prefer it, but two copies can drift apart
and break encryption.)

Generate `CRON_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`VITE_` variables are baked in at build time, so the redeploy is required.

## 3. The cron is already configured

`vercel.json` runs the job daily at **03:30 UTC = 09:00 IST**:

```json
"crons": [{ "path": "/api/notify-sips", "schedule": "30 3 * * *" }]
```

Vercel crons run in UTC. On the Hobby plan a cron fires once a day, which is exactly what
this needs. Adjust the hour if you'd rather be told at a different time.

## 4. Turn it on

Open the **Notifications** page (sidebar) → **Turn on**, then allow notifications. Toggle
each category — SIP debits, FD maturity, Post Office maturity — and pick its lead time
(1 day / 3 days / 1 week / 2 weeks / 1 month). Stored per device, so your phone and laptop
can differ.

---

## Testing without waiting for the cron

Dry run — reports what *would* be sent, sends nothing:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<your-domain>/api/notify-sips?dry=1"
```

Look at `report[]`: each subscription's `leadDays`, how many SIPs are `due`, and the
notification `title`/`body`. Drop `?dry=1` to actually send.

If nothing is due, that's usually correct — a SIP only fires on the exact lead day, and
not at all if it has already been debited this month.

**Prove delivery today.** A dry run never touches the VAPID keys, and a real send only
happens when a SIP falls due, so this sends a test notification to every subscribed
device right now — the only way to confirm the private key, subject, service worker and
phone all work before relying on it:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<your-domain>/api/notify-sips?test=1"
```

Expect `"sent": 1` and a notification on the phone. `"subscriptions": 0` means no device
has enrolled yet — turn reminders on in the app first.

## Notes

- **No Firestore rule changes.** Subscriptions are written by the server via the Admin
  SDK, so the browser never needs write access.
- **Dead subscriptions clean themselves up** — a `404`/`410` from the push service means
  the browser discarded it, and the record is deleted.
- **The service worker caches nothing** deliberately; it only handles push. A stale app
  shell would be worse than a network round-trip.
- **Turning it off** removes the subscription from Firestore and unsubscribes the browser.

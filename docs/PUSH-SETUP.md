# SIP push reminders — setup

A notification a few days before each SIP is debited, so the balance is ready.

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
| `VAPID_PUBLIC_KEY` | the same public key (used by the server) |
| `VAPID_PRIVATE_KEY` | the **private** key — server only |
| `VAPID_SUBJECT` | `mailto:er.darshandoshi@gmail.com` |
| `CRON_SECRET` | a long random string; Vercel sends it as `Authorization: Bearer …` |

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

**Mutual Funds & SIP → SIP Tracker → SIP reminders → Turn on**, then allow notifications.
Pick a lead time (1/2/3/5/7 days — default 2). It's stored per device, so your phone and
laptop can differ.

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

## Notes

- **No Firestore rule changes.** Subscriptions are written by the server via the Admin
  SDK, so the browser never needs write access.
- **Dead subscriptions clean themselves up** — a `404`/`410` from the push service means
  the browser discarded it, and the record is deleted.
- **The service worker caches nothing** deliberately; it only handles push. A stale app
  shell would be worse than a network round-trip.
- **Turning it off** removes the subscription from Firestore and unsubscribes the browser.

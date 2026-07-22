# Phase 4 — Automated SIP ingestion from Gmail

This wires your Gmail SIP emails straight into the app's **Review Inbox**. You still
tap **Confirm** before anything becomes a holding — the automation only stages items.

```
Gmail (SIP emails) ──▶ Apps Script (per account, timed)
                         │  POST /api/ingest-sip  (x-ingest-secret)
                         ▼
        Vercel function (Admin SDK) ──▶ Firestore `sipInbox` collection  ← isolated, append-only
                         ▼
        App drains sipInbox ──▶ Review Inbox ──▶ you Confirm ──▶ MF holding
```

**Safety:** the server writes **only** to `sipInbox` (never to `shared-family`), keyed by a
`folio|date|amount` fingerprint so re-sends are idempotent. Confirming an item is the only
thing that writes a holding, and that happens client-side exactly as manual entry does.

---

## 1. Create a Firebase service account (you do this — it's a credential)

1. Firebase Console → your project (**family-finance-132be**) → ⚙️ **Project settings** → **Service accounts**.
2. Click **Generate new private key** → confirm → a JSON file downloads. Keep it secret.

## 2. Add Vercel environment variables

Vercel → project → **Settings → Environment Variables** (Production):

| Name | Value |
|------|-------|
| `INGEST_SECRET` | a long random string you invent (e.g. from a password manager) |
| `FIREBASE_SERVICE_ACCOUNT` | the **entire JSON** from step 1, pasted as one value |

Redeploy after adding them.

## 3. Add the Firestore security rule for `sipInbox`

The app needs to **read** and **delete** items in `sipInbox` (the server writes them via the
Admin SDK, which bypasses rules). Add this block inside `match /databases/{database}/documents`:

```
match /sipInbox/{docId} {
  allow read, delete: if true;   // match your existing access model
  allow write: if false;         // only the Admin SDK (server) writes here
}
```

Publish the rules.

## 4. Install the Gmail Apps Script (once per Gmail account)

For **each** Gmail login that receives SIP emails:

1. Go to <https://script.google.com> → **New project**.
2. Paste the script from [`gmail-sip-forwarder.gs`](./gmail-sip-forwarder.gs).
3. Set `INGEST_URL` to `https://<your-vercel-domain>/api/ingest-sip` and `INGEST_SECRET`
   to the same secret as step 2.
4. Adjust `SEARCH_QUERY` if needed (defaults target CAMS/KFintech SIP mails).
5. Run `forwardSipEmails` once → approve the Gmail permission prompt.
6. **Triggers** (⏰ left rail) → **Add Trigger** → `forwardSipEmails`, *Time-driven*,
   *Minutes timer*, *Every 15 minutes*.

That's it. New SIP emails will appear in the app's **Review Inbox** within ~15 minutes,
pre-filled with folio, amount, date, scheme code, and estimated units — ready for one-tap confirm.

---

### Notes
- **No confirmation email needed** — units are estimated from the realization-date NAV
  (mfapi.in) and corrected later by the monthly CAS import (Phase 6).
- **Attribution** comes from the **Folio Registry** — add a folio there once and every future
  SIP for it is auto-tagged to the right member + guardian.
- **iPhone SMS (optional, Phase 5)** can POST to the same `/api/ingest-sip` with
  `{ "source": "sms", "body": "<message text>" }` and the same `x-ingest-secret` header.

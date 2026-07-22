/**
 * Gmail → Family Finance SIP forwarder.
 *
 * Install one copy per Gmail account (script.google.com). Set the two constants below,
 * run forwardSipEmails once to grant permission, then add a 15-minute time trigger.
 *
 * It finds recent SIP emails, POSTs each to /api/ingest-sip, and labels processed
 * threads so they are never sent twice.
 */

// ── Config ───────────────────────────────────────────────────────────────────────
const INGEST_URL    = 'https://YOUR-VERCEL-DOMAIN/api/ingest-sip';
const INGEST_SECRET = 'PASTE-THE-SAME-SECRET-AS-VERCEL';

// Gmail search for SIP mails. Tune senders/subjects to what you actually receive.
const SEARCH_QUERY  = 'newer_than:3d (from:(camsonline.com OR kfintech.com OR mailer OR wealth) ' +
                      'subject:(SIP OR "Systematic Investment" OR installment OR instalment OR "units allotted" OR allotment))';

const PROCESSED_LABEL = 'FF-SIP-Sent';
const MAX_THREADS     = 25;

// ── Main ─────────────────────────────────────────────────────────────────────────
function forwardSipEmails() {
  const label = getOrCreateLabel_(PROCESSED_LABEL);
  const account = Session.getActiveUser().getEmail();
  const threads = GmailApp.search(SEARCH_QUERY + ' -label:' + PROCESSED_LABEL, 0, MAX_THREADS);

  threads.forEach(function (thread) {
    const messages = thread.getMessages();
    let anySent = false;

    messages.forEach(function (msg) {
      const payload = {
        account: account,
        source: 'gmail',
        gmailMessageId: msg.getId(),
        subject: msg.getSubject(),
        body: msg.getPlainBody(),
        date: msg.getDate().toISOString(),
      };
      try {
        const res = UrlFetchApp.fetch(INGEST_URL, {
          method: 'post',
          contentType: 'application/json',
          headers: { 'x-ingest-secret': INGEST_SECRET },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true,
        });
        const code = res.getResponseCode();
        // 200 = staged, 422 = not a SIP email (fine to mark done and move on)
        if (code === 200 || code === 422) anySent = true;
        else Logger.log('ingest failed %s: %s', code, res.getContentText());
      } catch (e) {
        Logger.log('POST error: ' + e);
      }
    });

    if (anySent) thread.addLabel(label);
  });
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

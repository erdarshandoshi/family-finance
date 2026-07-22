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
  // getActiveUser() can be blank on consumer Gmail under a trigger — fall back to
  // the effective (script-owner) account so the app can show which inbox it came from.
  const account = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  const threads = GmailApp.search(SEARCH_QUERY + ' -label:' + PROCESSED_LABEL, 0, MAX_THREADS);

  let staged = 0, skipped = 0, failed = 0, labelled = 0;

  Logger.log('Scanning %s new thread(s) for %s', threads.length, account || '(this account)');
  if (threads.length === 0) {
    Logger.log('No new SIP emails matched. Query: %s', SEARCH_QUERY);
    return;
  }

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

        if (code === 200) {
          staged++; anySent = true;
          Logger.log('STAGED  %s', describeStaged_(res.getContentText()));
        } else if (code === 422) {
          // Matched the search but isn't a SIP installment — harmless, mark done.
          skipped++; anySent = true;
          Logger.log('SKIPPED not a SIP email: "%s"', msg.getSubject());
        } else {
          failed++;
          Logger.log('FAILED  HTTP %s: %s', code, res.getContentText());
        }
      } catch (e) {
        failed++;
        Logger.log('FAILED  POST error: %s', e);
      }
    });

    if (anySent) { thread.addLabel(label); labelled++; }
  });

  Logger.log('Done — %s staged, %s skipped, %s failed, %s thread(s) labelled "%s".',
             staged, skipped, failed, labelled, PROCESSED_LABEL);
  if (staged > 0) Logger.log('Open the app’s Review Inbox to confirm.');
}

/** Turn the endpoint's JSON response into a readable one-line summary. */
function describeStaged_(responseText) {
  try {
    const r = JSON.parse(responseText).record;
    return Utilities.formatString('%s | folio %s | Rs.%s on %s | %s units @ Rs.%s',
      r.schemeName, r.folioNumber, r.amount, r.installmentDate,
      r.estimatedUnits == null ? '?' : r.estimatedUnits,
      r.estimatedNav == null ? '?' : r.estimatedNav);
  } catch (e) {
    return responseText;
  }
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

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

// Gmail search for SIP mails. Subject-only on purpose: sender domains vary by AMC/RTA
// and an over-tight from: filter silently matches nothing.
//   "Systematic Investment"    → HDFC/CAMS debit alerts ("...Plan (SIP)") and
//                                KFintech "Systematic Investment request" mails.
//                                Deliberately without "Plan" so both match.
//   "transaction confirmation" → SBI/CAMS purchase confirmations
//   "New Purchase"             → KFintech request + processed mails
//   "units allotted"           → other AMCs' allotment mails
// The trailing -subject:(...) drops cancellations/rejections, which otherwise match
// "Systematic Investment" and would be recorded as a purchase.
// Test any change in the Gmail search box first.
const SEARCH_QUERY  =
  'newer_than:10d ' +
  'subject:("Systematic Investment" OR "transaction confirmation" OR "New Purchase" OR "units allotted") ' +
  '-subject:(cancellation OR cancelled OR canceled OR ceased OR discontinued OR rejected OR failed OR reversal OR refund)';

const PROCESSED_LABEL = 'FF-SIP-Sent';
// Mails that matched the search but weren't a SIP/purchase get their own label, so they
// stop being retried yet stay easy to re-queue (just remove the label) if the parser
// later learns their format.
const SKIPPED_LABEL   = 'FF-SIP-Skipped';
const MAX_THREADS     = 25;

// ── Main ─────────────────────────────────────────────────────────────────────────
function forwardSipEmails() {
  const label = getOrCreateLabel_(PROCESSED_LABEL);
  const skippedLabel = getOrCreateLabel_(SKIPPED_LABEL);
  // getActiveUser() can be blank on consumer Gmail under a trigger — fall back to
  // the effective (script-owner) account so the app can show which inbox it came from.
  const account = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  const threads = GmailApp.search(
    SEARCH_QUERY + ' -label:' + PROCESSED_LABEL + ' -label:' + SKIPPED_LABEL, 0, MAX_THREADS);

  let staged = 0, skipped = 0, failed = 0, labelled = 0;

  Logger.log('Scanning %s new thread(s) for %s', threads.length, account || '(this account)');
  if (threads.length === 0) {
    Logger.log('No new SIP emails matched. Query: %s', SEARCH_QUERY);
    return;
  }

  threads.forEach(function (thread) {
    const messages = thread.getMessages();
    let anySent = false, anySkipped = false;

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
          // Matched the search but the parser didn't recognise it. Park it under a
          // separate label rather than the "sent" one, so it can be re-queued later.
          skipped++; anySkipped = true;
          Logger.log('SKIPPED "%s"\n         %s', msg.getSubject(), res.getContentText());
        } else {
          failed++;
          Logger.log('FAILED  HTTP %s: %s', code, res.getContentText());
        }
      } catch (e) {
        failed++;
        Logger.log('FAILED  POST error: %s', e);
      }
    });

    // A thread that staged anything counts as done; only park it as skipped if
    // nothing in it was recognised.
    if (anySent) { thread.addLabel(label); labelled++; }
    else if (anySkipped) { thread.addLabel(skippedLabel); }
  });

  Logger.log('Done — %s staged, %s skipped, %s failed, %s thread(s) labelled "%s".',
             staged, skipped, failed, labelled, PROCESSED_LABEL);
  if (skipped > 0) Logger.log('Unrecognised mail parked under "%s" — remove that label to retry.', SKIPPED_LABEL);
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

// ── Diagnostics ──────────────────────────────────────────────────────────────────

/**
 * Run this when mail isn't reaching the Review Inbox.
 * Ignores labels entirely, shows the exact plain body the parser receives, POSTs it,
 * and prints the endpoint's reply — which says precisely which field failed.
 */
function debugOneEmail() {
  Logger.log('Query: %s', SEARCH_QUERY);
  const threads = GmailApp.search(SEARCH_QUERY, 0, 5);
  Logger.log('Threads found (ignoring labels): %s', threads.length);
  if (!threads.length) {
    Logger.log('Nothing matched — widen newer_than: or check the subject terms in the Gmail search box.');
    return;
  }

  const thread = threads[0];
  const msg = thread.getMessages()[0];
  const bodyText = msg.getPlainBody();

  Logger.log('Subject : %s', msg.getSubject());
  Logger.log('Date    : %s', msg.getDate());
  Logger.log('Labels  : %s', thread.getLabels().map(function (l) { return l.getName(); }).join(', ') || '(none)');
  Logger.log('--- plain body as the parser sees it (first 1500 chars, " | " = line break) ---');
  Logger.log(bodyText.slice(0, 1500).replace(/\n/g, ' | '));

  const res = UrlFetchApp.fetch(INGEST_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-ingest-secret': INGEST_SECRET },
    payload: JSON.stringify({
      account: Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail(),
      source: 'gmail',
      gmailMessageId: msg.getId(),
      subject: msg.getSubject(),
      body: bodyText,
      date: msg.getDate().toISOString(),
    }),
    muteHttpExceptions: true,
  });
  Logger.log('--- endpoint replied HTTP %s ---', res.getResponseCode());
  Logger.log(res.getContentText());
}

/** Strip both processing labels from matching threads so they can be re-sent. */
function resetSipLabels() {
  const sent = GmailApp.getUserLabelByName(PROCESSED_LABEL);
  const skipped = GmailApp.getUserLabelByName(SKIPPED_LABEL);
  const threads = GmailApp.search(SEARCH_QUERY, 0, MAX_THREADS);
  threads.forEach(function (t) {
    if (sent) t.removeLabel(sent);
    if (skipped) t.removeLabel(skipped);
  });
  Logger.log('Cleared labels on %s thread(s). Now run forwardSipEmails.', threads.length);
}

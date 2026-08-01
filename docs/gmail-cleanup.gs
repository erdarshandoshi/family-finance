/**
 * Gmail housekeeping for a personal account (e.g. niyaatipatel@gmail.com).
 *
 * THREE jobs:
 *   cleanCategories()      → move old Social / Promotions / Updates mail to Trash
 *   highlightLargeEmails() → label big mails into size buckets for easy bulk-delete
 *   reportTopSenders()     → log which senders flood your inbox (unsubscribe targets)
 *
 * SAFETY
 *  - Mail is moved to TRASH (recoverable ~30 days), never permanently deleted.
 *  - DRY_RUN starts true: the first runs only LOG what they *would* trash.
 *  - KEEP_QUERY protects finance mail, bank alerts, starred and important.
 *  - Put this in its OWN Apps Script project (separate from the SIP forwarder).
 */

// ── Config ───────────────────────────────────────────────────────────────────────
var DRY_RUN = true;                       // keep true until you've checked the log

var CLEAN_CATEGORIES = ['promotions', 'social', 'updates', 'forums'];  // trim as you like
var DELETE_OLDER_THAN_DAYS = 7;           // only trash mail older than this many days
var RUN_BUDGET_MS = 4.5 * 60 * 1000;      // keep clearing until ~4.5 min, then stop (6-min limit)

// Keep bank alerts (debits/credits/NEFT/statements) — they live in Updates. Set false
// if you actually want those trashed too.
var KEEP_BANK_ALERTS = true;

// Never trash anything matching this — finance mail, starred, or important.
var KEEP_QUERY =
  '-is:starred -is:important ' +
  '-subject:("Systematic Investment" OR "transaction confirmation" OR "SIP Confirmation" ' +
  'OR "New Purchase" OR "units allotted" OR "your NPS account" OR "Transaction Statement")' +
  (KEEP_BANK_ALERTS
    ? ' -subject:(debited OR credited OR NEFT OR IMPS OR UPI OR RTGS OR "A/c" OR "account statement" OR "transaction" OR "refund" OR "alert")'
    : '');

// Size buckets for the highlighter (Gmail understands larger:/smaller:)
var SIZE_BUCKETS = [
  { q: 'larger:20M',              label: 'Space/1 · Huge 20MB+' },
  { q: 'larger:10M smaller:20M',  label: 'Space/2 · Large 10-20MB' },
  { q: 'larger:5M smaller:10M',   label: 'Space/3 · Big 5-10MB' },
];

// How many recent threads to sample for the "top senders" report.
var REPORT_QUERY  = '(category:promotions OR category:social OR category:updates)';
var REPORT_SAMPLE = 300;
var REPORT_TOP_N  = 30;

// Senders to auto-trash daily. Fill from reportTopSenders — full address or bare domain.
// cleanBlockedSenders() trashes ALL their mail (still respecting the keep-list below).
var BLOCK_SENDERS = [
  // 'offers@ajio.com',
  // 'myntra.com',
];

// ── Job 1: clean old Social / Promotions / Updates ───────────────────────────────
function cleanCategories() {
  var cats = CLEAN_CATEGORIES.map(function (c) { return 'category:' + c; }).join(' OR ');
  var query = '(' + cats + ') older_than:' + DELETE_OLDER_THAN_DAYS + 'd ' + KEEP_QUERY;
  Logger.log('Query: %s', query);

  if (DRY_RUN) {
    var preview = GmailApp.search(query, 0, 40);
    preview.forEach(function (t) { Logger.log('  would trash: %s', t.getFirstMessageSubject()); });
    Logger.log('DRY RUN — nothing deleted. Showing up to 40 examples; the real backlog may be far larger.');
    Logger.log('Set DRY_RUN = false to start trashing (runs in batches; run again / let the daily trigger finish).');
    return;
  }

  // Trashed threads leave the category, so re-searching from 0 keeps returning fresh
  // matches. Loop until nothing's left or we near the 6-minute execution limit.
  var start = Date.now(), trashed = 0;
  while (Date.now() - start < RUN_BUDGET_MS) {
    var threads = GmailApp.search(query, 0, 100);           // moveThreadsToTrash caps at 100
    if (threads.length === 0) break;
    GmailApp.moveThreadsToTrash(threads);
    trashed += threads.length;
    Utilities.sleep(150);
  }
  Logger.log('Moved %s thread(s) to Trash this run — recoverable ~30 days.', trashed);
  Logger.log('If you had thousands, run again (or wait for tomorrow) to clear the rest.');
}

// ── Job 2: highlight the space hogs ──────────────────────────────────────────────
function highlightLargeEmails() {
  SIZE_BUCKETS.forEach(function (b) {
    var label = getOrCreateLabel_(b.label);
    var threads = GmailApp.search(b.q + ' -label:"' + b.label + '"', 0, 200);
    for (var i = 0; i < threads.length; i += 100) {        // addToThreads caps at 100
      label.addToThreads(threads.slice(i, i + 100));
    }
    Logger.log('%s — labelled %s new thread(s)', b.label, threads.length);
  });
  Logger.log('Open the "Space" labels in Gmail to review and bulk-delete large mail.');
}

// ── Job 3: who's flooding the inbox (unsubscribe targets) ─────────────────────────
function reportTopSenders() {
  var threads = GmailApp.search(REPORT_QUERY, 0, REPORT_SAMPLE);
  var counts = {};
  var start = Date.now();

  for (var i = 0; i < threads.length; i++) {
    if (Date.now() - start > RUN_BUDGET_MS) { Logger.log('(stopped early at %s threads)', i); break; }
    var msgs = threads[i].getMessages();
    if (!msgs.length) continue;
    var email = extractEmail_(msgs[0].getFrom());
    counts[email] = (counts[email] || 0) + 1;
  }

  var rows = Object.keys(counts)
    .map(function (k) { return { sender: k, n: counts[k] }; })
    .sort(function (a, b) { return b.n - a.n; });

  Logger.log('Top senders across %s sampled thread(s) — unsubscribe / block the worst:', threads.length);
  rows.slice(0, REPORT_TOP_N).forEach(function (r) {
    Logger.log('  %s×   %s', pad_(r.n), r.sender);
  });
  Logger.log('Tip: search "from:<sender>" in Gmail, then use its Unsubscribe link or a filter.');
}

// ── Job 4: auto-trash mail from blocked senders ──────────────────────────────────
function cleanBlockedSenders() {
  if (!BLOCK_SENDERS.length) {
    Logger.log('BLOCK_SENDERS is empty — run reportTopSenders, then add the worst offenders.');
    return;
  }
  var from = BLOCK_SENDERS.map(function (s) { return 'from:' + s; }).join(' OR ');
  var query = '(' + from + ') ' + KEEP_QUERY;     // no age filter — blocked means gone
  Logger.log('Query: %s', query);

  if (DRY_RUN) {
    GmailApp.search(query, 0, 40).forEach(function (t) {
      Logger.log('  would trash: %s — %s', t.getMessages()[0].getFrom(), t.getFirstMessageSubject());
    });
    Logger.log('DRY RUN — nothing deleted. Set DRY_RUN = false to act.');
    return;
  }

  var start = Date.now(), trashed = 0;
  while (Date.now() - start < RUN_BUDGET_MS) {
    var threads = GmailApp.search(query, 0, 100);
    if (threads.length === 0) break;
    GmailApp.moveThreadsToTrash(threads);
    trashed += threads.length;
    Utilities.sleep(150);
  }
  Logger.log('Moved %s thread(s) from blocked senders to Trash — recoverable ~30 days.', trashed);
}

// ── Standalone: delete by category with progress logging ─────────────────────────
// Runs ~4.5 min then stops (bigger than that hits Apps Script's 6-min limit). Big
// backlogs need several runs — just run it again, or let a daily trigger finish.
var CAT_DRY = true;                          // false = actually trash
var CATS = ['updates', 'forums', 'promotions', 'social'];
var CAT_OLDER_THAN_DAYS = 0;                 // 0 = all; e.g. 7 = keep the last week

function deleteByCategory() {
  var start = Date.now(), grand = 0;
  for (var c = 0; c < CATS.length; c++) {
    var cat = CATS[c];
    var age = CAT_OLDER_THAN_DAYS > 0 ? (' older_than:' + CAT_OLDER_THAN_DAYS + 'd') : '';
    var query = 'category:' + cat + age + ' ' + KEEP_QUERY;

    if (CAT_DRY) {
      var s = GmailApp.search(query, 0, 100);
      Logger.log('[%s] DRY RUN — %s+ match. e.g. "%s"', cat, s.length, s.length ? s[0].getFirstMessageSubject() : '(none)');
      continue;
    }

    var trashed = 0;
    while (true) {
      if (Date.now() - start > RUN_BUDGET_MS) {
        Logger.log('[%s] %s trashed, then hit the time budget. %s total this run — RUN AGAIN to continue.',
                   cat, trashed, grand + trashed);
        return;
      }
      var threads = GmailApp.search(query, 0, 100);
      if (threads.length === 0) break;
      GmailApp.moveThreadsToTrash(threads);
      trashed += threads.length;
      if (trashed % 500 === 0) Logger.log('[%s] %s trashed…', cat, trashed);   // periodic progress
      Utilities.sleep(150);
    }
    grand += trashed;
    Logger.log('[%s] done — %s thread(s) to Trash.', cat, trashed);
  }
  Logger.log('Finished. %s thread(s) trashed this run. If a category still has mail, run again.', grand);
}

// ── Helpers ──────────────────────────────────────────────────────────────────────
function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function extractEmail_(from) {
  var m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).toLowerCase().trim() || '(unknown)';
}

function pad_(n) {
  var s = String(n);
  return s.length >= 4 ? s : ('    ' + s).slice(-4);
}

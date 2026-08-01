/**
 * Gmail housekeeping for a personal account (e.g. niyaatipatel@gmail.com).
 *
 * TWO jobs, each on its own daily trigger:
 *   cleanCategories()      → move old Social / Promotions / Updates mail to Trash
 *   highlightLargeEmails() → label big mails into size buckets so they're easy to bulk-delete
 *
 * SAFETY
 *  - Mail is moved to TRASH (recoverable ~30 days), never permanently deleted.
 *  - DRY_RUN starts true: the first runs only LOG what they *would* trash. Flip to false
 *    once you've read the log and are happy.
 *  - KEEP_QUERY excludes your finance mail (SIP/NPS/etc.), starred and important, so the
 *    Family Finance forwarder never loses a source email.
 *  - Put this in a SEPARATE Apps Script project from the SIP forwarder (shared globals
 *    across files in one project cause name clashes).
 */

// ── Config ───────────────────────────────────────────────────────────────────────
var DRY_RUN = true;                       // ← keep true until you've checked the log

var CLEAN_CATEGORIES = ['promotions', 'social', 'updates'];  // drop 'updates' if unsure
var DELETE_OLDER_THAN_DAYS = 7;           // only trash mail older than this many days
var RUN_BUDGET_MS = 4.5 * 60 * 1000;      // keep clearing until ~4.5 min, then stop (6-min limit)

// Keep bank alerts (debits/credits/NEFT/statements) — they live in Updates. Set to false
// if you actually want those trashed too.
var KEEP_BANK_ALERTS = true;

// Never trash anything matching this — your finance mail, starred, or important.
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

// ── Job 1: clean out old Social / Promotions / Updates ───────────────────────────
function cleanCategories() {
  var cats = CLEAN_CATEGORIES.map(function (c) { return 'category:' + c; }).join(' OR ');
  var query = '(' + cats + ') older_than:' + DELETE_OLDER_THAN_DAYS + 'd ' + KEEP_QUERY;
  Logger.log('Query: %s', query);

  if (DRY_RUN) {
    var preview = GmailApp.search(query, 0, 40);
    preview.forEach(function (t) { Logger.log('  would trash: %s', t.getFirstMessageSubject()); });
    Logger.log('DRY RUN — nothing deleted. Showing up to 40 examples; the real backlog may be far larger.');
    Logger.log('Set DRY_RUN = false to start trashing (in batches, run again / let the daily trigger finish the rest).');
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

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

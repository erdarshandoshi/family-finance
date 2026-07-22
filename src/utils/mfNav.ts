// Client-side helpers around mfapi.in for scheme lookup and historical NAV.
// Used to resolve a scheme name → scheme code and to estimate SIP units when the
// AMC email omits them: units = amount ÷ NAV(schemeCode, installmentDate).

export interface SchemeMatch {
  schemeCode: string;
  schemeName: string;
}

export interface NavPoint {
  nav: number;
  date: string;   // ISO yyyy-mm-dd
}

// mfapi returns dates as "dd-mm-yyyy"
function mfapiDateToIso(d: string): string | null {
  const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export async function searchSchemes(query: string): Promise<SchemeMatch[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const json = await res.json() as { schemeCode: number; schemeName: string }[];
    return (json ?? []).map(s => ({ schemeCode: String(s.schemeCode), schemeName: s.schemeName }));
  } catch {
    return [];
  }
}

// Score a candidate scheme name against the raw scheme text from the email.
function scoreMatch(raw: string, candidate: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const r = norm(raw);
  const c = norm(candidate);
  let score = 0;

  // Plan / option must agree — these flip which scheme code you get.
  const wantDirect = /\bdirect\b/.test(r);
  const candDirect = /\bdirect\b/.test(c);
  if (wantDirect === candDirect) score += 5; else score -= 5;

  const wantIdcw = /\b(idcw|dividend)\b/.test(r);
  const candIdcw = /\b(idcw|dividend)\b/.test(c);
  if (wantIdcw === candIdcw) score += 5; else score -= 5;

  // Overlap of meaningful tokens
  const stop = new Set(['fund', 'plan', 'option', 'the', 'scheme', 'growth', 'direct', 'regular', 'idcw', 'dividend']);
  const rTokens = r.split(' ').filter(t => t.length > 2 && !stop.has(t));
  const cTokens = new Set(c.split(' '));
  for (const t of rTokens) if (cTokens.has(t)) score += 2;

  return score;
}

// Resolve the best mfapi scheme code for a raw scheme string from an email.
export async function resolveSchemeCode(schemeRaw: string): Promise<SchemeMatch | null> {
  // Search on the fund name without plan/option noise for broader recall.
  const base = schemeRaw.replace(/\b(direct|regular|plan|growth|idcw|dividend|option|reinvestment|payout)\b/gi, ' ')
    .replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
  const results = await searchSchemes(base || schemeRaw);
  if (results.length === 0) return null;

  let best: SchemeMatch | null = null;
  let bestScore = -Infinity;
  for (const r of results) {
    const s = scoreMatch(schemeRaw, r.schemeName);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return bestScore > 0 ? best : null;
}

// NAV on a given date, snapping to the nearest available trading day (SIPs debited on
// a holiday/weekend are allotted at the next business day's NAV).
export async function navOnDate(schemeCode: string, isoDate: string): Promise<NavPoint | null> {
  try {
    const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
    if (!res.ok) return null;
    const json = await res.json() as { status: string; data: { date: string; nav: string }[] };
    if (json.status !== 'SUCCESS' || !Array.isArray(json.data) || json.data.length === 0) return null;

    const target = new Date(isoDate).getTime();
    // SIP units are allotted at the NAV of the realization date — the first trading day
    // on/after the debit date. Prefer the nearest date >= target; if the installment is
    // newer than any NAV we have, fall back to the latest available (nearest before).
    let after: NavPoint | null = null;   // smallest date >= target
    let before: NavPoint | null = null;  // largest date < target
    for (const row of json.data) {
      const iso = mfapiDateToIso(row.date);
      const nav = parseFloat(row.nav);
      if (!iso || !Number.isFinite(nav) || nav <= 0) continue;
      const t = new Date(iso).getTime();
      if (t >= target) {
        if (!after || t < new Date(after.date).getTime()) after = { nav, date: iso };
      } else {
        if (!before || t > new Date(before.date).getTime()) before = { nav, date: iso };
      }
    }
    return after ?? before;
  } catch {
    return null;
  }
}

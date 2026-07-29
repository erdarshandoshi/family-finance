// Parse an NPS (CRA/Protean) monthly transaction statement into the shape the NPS tab
// stores. Not a route — Vercel ignores api/ files starting with _.
//
// NPS statements are a header-row / value-row table, not "label: value" pairs, so the
// figures are recovered positionally within the Investment Summary and validated by the
// identity the statement itself prints: Holdings = Contribution − Withdrawal + Gain.

const MONTHS = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };

export function isNpsStatement(text) {
  const t = String(text || '');
  return /\bNPS\b/i.test(t) && /(transaction statement|statement of transaction|PRAN)/i.test(t);
}

function isoDate(raw) {
  if (!raw) return null;
  let m = String(raw).match(/(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (!mon) return null;
    let y = m[3]; if (y.length === 2) y = (Number(y) > 70 ? '19' : '20') + y;
    return `${y}-${mon}-${String(m[1]).padStart(2, '0')}`;
  }
  m = String(raw).match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);   // "Jun 30, 2026"
  if (m) { const mon = MONTHS[m[1].slice(0, 3).toLowerCase()]; if (mon) return `${m[3]}-${mon}-${String(m[2]).padStart(2, '0')}`; }
  return null;
}

const FUND_MANAGERS = [
  [/hdfc/i, 'HDFC Pension'], [/sbi/i, 'SBI Pension'], [/lic/i, 'LIC Pension'],
  [/uti/i, 'UTI Retirement'], [/icici/i, 'ICICI Pru Pension'], [/kotak/i, 'Kotak Pension'],
  [/aditya\s*birla/i, 'Aditya Birla Pension'], [/max\s*life/i, 'Max Life Pension'],
  [/\btata\b/i, 'Tata Pension'], [/\bdsp\b/i, 'DSP Pension'],
];

function detectFundManager(flat) {
  const m = flat.match(/NPS\s+TRUST\s+A\/C\s+(.+?)\s+SCHEME/i);
  const hay = m ? m[1] : flat;
  for (const [re, name] of FUND_MANAGERS) if (re.test(hay)) return name;
  return null;
}

function detectInvestmentOption(flat) {
  if (/\bactive\s*choice\b/i.test(flat) || /investment option\s*[:-]?\s*active/i.test(flat)) return 'Active';
  const m = flat.match(/life\s*cycle\s*(\d{2})|(?:auto[- ]?)?lc[- ]?(\d{2})/i);
  const n = m ? (m[1] || m[2]) : null;
  if (n === '75') return 'Auto-LC75';
  if (n === '50') return 'Auto-LC50';
  if (n === '25') return 'Auto-LC25';
  return null;
}

// "SCHEME E - TIER I DIRECT 71.00%" → { equityPct: 71, ... }
function detectAllocations(flat) {
  const out = {};
  const map = { E: 'equityPct', C: 'corporateBondPct', G: 'govtSecPct', A: 'altAssetPct' };
  const re = /SCHEME\s+([ECGA])\b[^%]{0,80}?(\d+(?:\.\d+)?)\s*%/gi;
  let m;
  while ((m = re.exec(flat))) {
    const key = map[m[1].toUpperCase()];
    if (key && out[key] == null) out[key] = Number(m[2]);
  }
  return out;
}

export function parseNpsStatement(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  const warnings = [];

  const pran = (flat.match(/\bPRAN\s*(?:No\.?)?\s*[:-]?\s*(\d{9,16})/i) || [])[1] || null;
  const tier = /statement\s+for\s+tier\s*II|Tier\s*II\s*Account/i.test(flat) ? 'II' : 'I';
  const subscriberName = (flat.match(/Subscriber\s+Name\s+([A-Z][A-Z .]+?)\s+Tier/i) || [])[1]?.trim() || null;
  const dateOfJoining = isoDate((flat.match(/Registration\s+Date\s+([0-9]{1,2}[-/][A-Za-z]{3,}[-/][0-9]{2,4})/i) || [])[1]);

  // Statement period / as-on date, for display and dedup
  const period = (flat.match(/period\s+(\d{1,2}[-/][A-Za-z]{3,}[-/]\d{4})\s*(?:TO|to|-)\s*(\d{1,2}[-/][A-Za-z]{3,}[-/]\d{4})/i) || []).slice(1, 3).join(' to ') || null;
  const asOnDate = isoDate((flat.match(/as\s+on\s+([A-Za-z]{3,}\s+\d{1,2},?\s+\d{4})/i) || [])[1])
    || (period ? isoDate(period.split(' to ')[1]) : null);

  // Investment Summary: the four money figures appear in header order A, B, C, D — with a
  // standalone integer (No. of Contributions) between A and B, and the XIRR as a percentage.
  const region = (flat.match(/Investment\s+Summary(.*?)(?:Investment\s+Details|Scheme\s+wise|Changes\s+made|$)/i) || [])[1] || flat;
  const money = (region.match(/\b\d[\d,]*\.\d{2}(?!\s*%)/g) || [])   // 2-dp numbers not followed by %
    .map(s => Number(s.replace(/,/g, '')))
    .filter(n => Number.isFinite(n));

  let currentCorpus = null, totalInvested = null;
  if (money.length >= 4) {
    const [A, B, C, D] = money;                 // Holdings, Contribution, Withdrawal, Gain
    const consistent = Math.abs(A - (B - C + D)) <= Math.max(1, A * 0.005);
    if (consistent) { currentCorpus = A; totalInvested = B; }
    else {
      currentCorpus = Math.max(...money.slice(0, 4));   // holdings is the largest
      warnings.push('Statement figures did not reconcile — please check corpus and contribution.');
    }
  } else if (money.length) {
    currentCorpus = Math.max(...money);
    warnings.push('Could not read the contribution total — please enter it.');
  } else {
    warnings.push('Could not read the summary figures — please enter corpus and contribution.');
  }

  if (!pran) return null;                        // without a PRAN it isn't a usable NPS record

  return {
    pran,
    subscriberName,
    tier,
    fundManager: detectFundManager(flat),
    investmentOption: detectInvestmentOption(flat),
    currentCorpus,
    totalInvested,
    ...detectAllocations(flat),
    dateOfJoining,
    asOnDate,
    period,
    warnings,
  };
}

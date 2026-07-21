// Module-level cache persists across warm invocations (resets on cold start)
let cache = { stocks: [], ts: 0 };
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function loadAllStocks() {
  const now = Date.now();
  if (cache.stocks.length && now - cache.ts < CACHE_TTL) return cache.stocks;

  // NSE's public equity master list — all listed stocks with ISIN
  const res = await fetch(
    'https://archives.nseindia.com/content/equities/EQUITY_L.csv',
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!res.ok) throw new Error(`NSE CSV fetch failed: ${res.status}`);

  const text = await res.text();
  // CSV header: SYMBOL,NAME OF COMPANY,SERIES,DATE OF LISTING,PAID UP VALUE,MARKET LOT,ISIN NUMBER,FACE VALUE
  const stocks = text
    .split('\n')
    .slice(1)                         // skip header row
    .reduce((acc, line) => {
      const parts = line.split(',');
      const symbol = parts[0]?.trim();
      const name   = parts[1]?.trim();
      const isin   = parts[6]?.trim();
      if (symbol && name && isin?.startsWith('IN')) {
        acc.push({ symbol, name, isin });
      }
      return acc;
    }, []);

  cache = { stocks, ts: now };
  return stocks;
}

export default async function handler(req, res) {
  const q = (req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json({ stocks: [] });

  try {
    const all = await loadAllStocks();

    // Prioritise exact symbol/ISIN prefix matches, then substring
    const exact   = all.filter(s => s.symbol.toLowerCase() === q || s.isin.toLowerCase() === q);
    const prefix  = all.filter(s =>
      s.symbol.toLowerCase().startsWith(q) || s.isin.toLowerCase().startsWith(q),
    ).filter(s => !exact.includes(s));
    const contain = all.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.symbol.toLowerCase().includes(q) ||
      s.isin.toLowerCase().includes(q),
    ).filter(s => !exact.includes(s) && !prefix.includes(s));

    const stocks = [...exact, ...prefix, ...contain].slice(0, 12);

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.json({ stocks });
  } catch (err) {
    console.error('stocks API error:', err);
    return res.json({ stocks: [] });
  }
}

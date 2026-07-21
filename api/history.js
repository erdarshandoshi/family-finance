// Batch daily price history from Yahoo Finance for one or more NSE/BSE symbols.
// GET /api/history?symbols=RELIANCE,TCS&range=3y
// Returns { history: { RELIANCE: [{ t, c }], ... } }  (t = ms epoch, c = close)

export default async function handler(req, res) {
  const symbolsParam = (req.query.symbols || '').trim();
  const range = (req.query.range || '3y').trim();
  if (!symbolsParam) return res.json({ history: {} });

  const symbols = symbolsParam
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40);

  async function fetchOne(symbol) {
    // Index symbols (e.g. ^NSEI) are queried as-is; equities try NSE then BSE
    const suffixes = symbol.startsWith('^') ? [''] : ['.NS', '.BO'];
    for (const suffix of suffixes) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}${suffix}?interval=1d&range=${range}`;
        const r = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) continue;
        const data = await r.json();
        const result = data?.chart?.result?.[0];
        const ts = result?.timestamp;
        const closes = result?.indicators?.quote?.[0]?.close;
        if (Array.isArray(ts) && Array.isArray(closes)) {
          const series = [];
          for (let i = 0; i < ts.length; i++) {
            const c = closes[i];
            if (c != null && c > 0) {
              series.push({ t: ts[i] * 1000, c: Math.round(c * 100) / 100 });
            }
          }
          if (series.length) return series;
        }
      } catch { /* try next suffix */ }
    }
    return [];
  }

  try {
    const entries = await Promise.all(symbols.map(async s => [s, await fetchOne(s)]));
    // Daily data — cache for 6h at the edge
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200');
    return res.json({ history: Object.fromEntries(entries) });
  } catch (err) {
    console.error('history API error:', err);
    return res.json({ history: {} });
  }
}

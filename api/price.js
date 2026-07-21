export default async function handler(req, res) {
  const symbol = (req.query.symbol || '').trim().toUpperCase();
  if (!symbol) return res.json({ price: null });

  // Try NSE (.NS) then BSE (.BO)
  const suffixes = ['.NS', '.BO'];
  for (const suffix of suffixes) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}${suffix}?interval=1d&range=1d`;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) {
        // Cache for 1 hour — Yahoo updates prices ~15 min delayed
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
        return res.json({ price: Math.round(price * 100) / 100, source: `${symbol}${suffix}` });
      }
    } catch { /* try next suffix */ }
  }

  return res.json({ price: null });
}

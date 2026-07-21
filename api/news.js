// Per-stock news via Google News RSS, searched by company name (reliable for
// Indian/NSE stocks — Yahoo's search returns generic market news for most NSE tickers).
// GET /api/news?q=<encoded JSON: [{ s: "RELIANCE", n: "Reliance Industries Ltd" }, ...]>
// Returns { news: { RELIANCE: [{ title, publisher, link, time }], ... } }

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const block of blocks) {
    const get = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? decodeEntities(stripCdata(m[1])) : '';
    };
    let title = get('title');
    const link = get('link');
    const pubDate = get('pubDate');
    const source = get('source');
    // Google News titles are "Headline - Publisher" — drop the trailing source
    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }
    if (title && link) {
      const t = pubDate ? new Date(pubDate).getTime() : NaN;
      items.push({ title, publisher: source, link, time: Number.isNaN(t) ? null : t });
    }
  }
  return items;
}

// Trim corporate suffixes so the search query stays focused on the company
function cleanName(name, symbol) {
  const base = (name || symbol || '').trim();
  const cleaned = base
    .replace(/\b(limited|ltd\.?|corporation|corp\.?|company|co\.?|india)\b/gi, '')
    .replace(/[,.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || base || symbol;
}

async function fetchGoogleNews(name, symbol) {
  const query = `"${cleanName(name, symbol)}" share price NSE`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRss(xml).slice(0, 8);
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  let items = [];
  try { items = JSON.parse(req.query.q || '[]'); } catch { items = []; }
  if (!Array.isArray(items) || items.length === 0) return res.json({ news: {} });
  items = items.slice(0, 40);

  try {
    const entries = await Promise.all(items.map(async it => {
      const symbol = String(it.s || '').toUpperCase();
      const name = String(it.n || '');
      if (!symbol) return null;
      return [symbol, await fetchGoogleNews(name, symbol)];
    }));
    const news = Object.fromEntries(entries.filter(Boolean));
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    return res.json({ news });
  } catch (err) {
    console.error('news API error:', err);
    return res.json({ news: {} });
  }
}

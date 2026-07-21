import { useMemo, useState } from 'react';
import { ExternalLink, Newspaper, RefreshCw } from 'lucide-react';
import type { NewsMap, NewsItem } from '../../utils/stockHistory';

interface HeldStock { symbol: string; stockName: string; }

interface Props {
  stocks: HeldStock[];
  news: NewsMap | null;
  loading: boolean;
  onRefresh: () => void;
}

// Stable colour per symbol for the ticker chips
const CHIP_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#eab308'];
function colorFor(symbol: string, order: string[]): string {
  const i = order.indexOf(symbol);
  return CHIP_COLORS[(i < 0 ? 0 : i) % CHIP_COLORS.length];
}

interface FeedItem extends NewsItem { symbol: string; stockName: string; }

function dayBucket(ms: number | null): { key: string; label: string } {
  if (!ms) return { key: 'zzz', label: 'Earlier' };
  const d = new Date(ms);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86_400_000);
  if (diff <= 0) return { key: '0', label: 'Today' };
  if (diff === 1) return { key: '1', label: 'Yesterday' };
  if (diff < 7) return { key: String(diff), label: `${diff} days ago` };
  return { key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) };
}

function timeLabel(ms: number | null): string {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function StockNewsTab({ stocks, news, loading, onRefresh }: Props) {
  const [filter, setFilter] = useState<string>('all');
  const order = stocks.map(s => s.symbol);
  const nameOf = (sym: string) => stocks.find(s => s.symbol === sym)?.stockName ?? sym;

  // Flatten to a single feed, newest first
  const feed = useMemo<FeedItem[]>(() => {
    if (!news) return [];
    const all: FeedItem[] = [];
    for (const [symbol, items] of Object.entries(news)) {
      for (const it of items) all.push({ ...it, symbol, stockName: nameOf(symbol) });
    }
    return all.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of feed) m.set(f.symbol, (m.get(f.symbol) ?? 0) + 1);
    return m;
  }, [feed]);

  const visible = filter === 'all' ? feed : feed.filter(f => f.symbol === filter);

  // Group visible items by day bucket, preserving sort order
  const groups = useMemo(() => {
    const out: { label: string; items: FeedItem[] }[] = [];
    let cur: { key: string; label: string; items: FeedItem[] } | null = null;
    for (const f of visible) {
      const b = dayBucket(f.time);
      if (!cur || cur.key !== b.key) { cur = { key: b.key, label: b.label, items: [] }; out.push(cur); }
      cur.items.push(f);
    }
    return out;
  }, [visible]);

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setFilter('all')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
            filter === 'all' ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-surface border-edge text-muted hover:text-content'}`}>
          All ({feed.length})
        </button>
        {stocks.map(s => {
          const n = counts.get(s.symbol) ?? 0;
          return (
            <button key={s.symbol} onClick={() => setFilter(s.symbol)} disabled={n === 0}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-40 ${
                filter === s.symbol ? 'text-content' : 'bg-surface border-edge text-muted hover:text-content'}`}
              style={filter === s.symbol
                ? { backgroundColor: colorFor(s.symbol, order) + '30', borderColor: colorFor(s.symbol, order) + '80' }
                : {}}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colorFor(s.symbol, order) }} />
              {s.symbol} ({n})
            </button>
          );
        })}
        <button onClick={onRefresh} disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-muted hover:text-content text-xs border border-edge hover:border-edge rounded-full px-3 py-1.5 transition-colors disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading && news === null ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted">
          <div className="w-9 h-9 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-sm">Fetching the latest market news…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-faint">
          <Newspaper size={38} className="mx-auto mb-3 opacity-30" />
          <p>No recent news found{filter !== 'all' ? ' for this stock' : ''} right now.</p>
          <p className="text-xs mt-1">Try refreshing later — coverage varies by stock.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(group => (
            <div key={group.label} className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-muted text-xs font-semibold uppercase tracking-wide">{group.label}</span>
                <div className="flex-1 h-px bg-surface2" />
              </div>
              <div className="space-y-2">
                {group.items.map((n, i) => {
                  const color = colorFor(n.symbol, order);
                  return (
                    <a key={`${n.symbol}-${i}`} href={n.link} target="_blank" rel="noopener noreferrer"
                      className="group block bg-surface border border-edge hover:border-edge active:scale-[0.99] rounded-2xl shadow-card p-4 transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0"
                          style={{ backgroundColor: color + '25', color }}>
                          {n.symbol}
                        </span>
                        <span className="text-faint text-xs truncate">{n.publisher}</span>
                        {n.time && <span className="text-faint text-xs ml-auto flex-shrink-0">{timeLabel(n.time)}</span>}
                      </div>
                      <div className="flex items-start gap-3">
                        <p className="text-content text-[15px] leading-snug font-medium group-hover:text-accent transition-colors flex-1">
                          {n.title}
                        </p>
                        <ExternalLink size={15} className="text-faint group-hover:text-accent flex-shrink-0 mt-1 transition-colors" />
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

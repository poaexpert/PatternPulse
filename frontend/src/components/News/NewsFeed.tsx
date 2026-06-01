import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useStore } from '../../store';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  summary?: string;
  symbol: string;
}

const DEFAULT_SYMBOLS = 'SPY,QQQ,AAPL,TSLA,NVDA,META,AMZN,MSFT,GC=F,CL=F';

function timeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return '';
  }
}

function isToday(dateStr: string): boolean {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    return date.toDateString() === now.toDateString();
  } catch {
    return false;
  }
}

function SkeletonCard() {
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg px-4 py-3 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-terminal-border rounded w-3/4" />
          <div className="h-3 bg-terminal-border rounded w-1/2" />
          <div className="h-3 bg-terminal-border rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}

const POS_WORDS = ['bullish','surge','rally','gain','profit','beat','upgrade','record','soar','jump','rise','breakthrough','positive','strong','growth','outperform'];
const NEG_WORDS = ['bearish','crash','decline','loss','miss','downgrade','recession','plunge','fall','drop','weak','fail','concern','risk','warning','cut'];

function getSentiment(title: string): { label: string; cls: string } | null {
  const t = title.toLowerCase();
  const posScore = POS_WORDS.filter(w => t.includes(w)).length;
  const negScore = NEG_WORDS.filter(w => t.includes(w)).length;
  if (posScore > negScore) return { label: 'POSITIVE', cls: 'bg-terminal-green/10 text-terminal-green border-terminal-green/25' };
  if (negScore > posScore) return { label: 'NEGATIVE', cls: 'bg-terminal-red/10 text-terminal-red border-terminal-red/25' };
  if (posScore > 0 && negScore > 0) return { label: 'MIXED', cls: 'bg-terminal-yellow/10 text-terminal-yellow border-terminal-yellow/25' };
  return null;
}

function NewsCard({ item }: { item: NewsItem }) {
  const symbolColor: Record<string, string> = {
    SPY: 'bg-terminal-cyan/10 text-terminal-cyan border-terminal-cyan/25',
    QQQ: 'bg-terminal-purple/10 text-terminal-purple border-terminal-purple/25',
    AAPL: 'bg-terminal-green/10 text-terminal-green border-terminal-green/25',
    TSLA: 'bg-terminal-red/10 text-terminal-red border-terminal-red/25',
    NVDA: 'bg-terminal-green/10 text-terminal-green border-terminal-green/25',
  };
  const badgeCls = symbolColor[item.symbol] ?? 'bg-terminal-border/40 text-terminal-text-secondary border-terminal-border';
  const sentiment = getSentiment(item.title);

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-terminal-card border border-terminal-border rounded-lg px-4 py-3 hover:border-terminal-cyan/40 transition-colors group"
    >
      <p className="text-sm font-medium text-terminal-text-primary group-hover:text-terminal-cyan transition-colors leading-snug">
        {item.title}
      </p>
      {item.summary && (
        <p className="text-xs text-terminal-text-secondary mt-1 line-clamp-2 leading-relaxed">
          {item.summary}
        </p>
      )}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeCls}`}>
          {item.symbol}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-terminal-bg border border-terminal-border text-terminal-text-secondary">
          {item.source}
        </span>
        {sentiment && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${sentiment.cls}`}>
            {sentiment.label}
          </span>
        )}
        <span className="text-[10px] text-terminal-text-secondary/60 ml-auto">
          {timeAgo(item.pubDate)}
        </span>
      </div>
    </a>
  );
}

export default function NewsFeed() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const { watchlist } = useStore();

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const watchlistSymbols = watchlist
        .map((w) => w.symbol)
        .slice(0, 8);
      const symbolSet = new Set([
        ...DEFAULT_SYMBOLS.split(','),
        ...watchlistSymbols,
      ]);
      const symbols = Array.from(symbolSet).slice(0, 18).join(',');

      const { data } = await axios.get<{ news: NewsItem[] }>(`/api/market/news?symbols=${encodeURIComponent(symbols)}`, {
        timeout: 15000,
      });
      setNews(data.news ?? []);
    } catch {
      setError('Failed to load news. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [watchlist, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const todayNews = news.filter((n) => isToday(n.pubDate));
  const earlierNews = news.filter((n) => !isToday(n.pubDate));

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-terminal-text-primary">Market News</h2>
          <p className="text-xs text-terminal-text-secondary mt-0.5">
            Latest headlines across all major markets
          </p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
            loading
              ? 'bg-terminal-card border-terminal-border text-terminal-text-secondary cursor-not-allowed'
              : 'bg-terminal-cyan text-black border-terminal-cyan hover:bg-terminal-cyan/90 active:scale-95'
          }`}
        >
          <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg bg-terminal-red/10 border border-terminal-red/30 px-4 py-3 text-terminal-red text-sm">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {/* News groups */}
      {!loading && !error && (
        <>
          {todayNews.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold text-terminal-cyan uppercase tracking-widest">Today</span>
                <div className="flex-1 h-px bg-terminal-border" />
                <span className="text-xs text-terminal-text-secondary">{todayNews.length} articles</span>
              </div>
              <div className="space-y-2">
                {todayNews.map((item, i) => <NewsCard key={`today-${i}`} item={item} />)}
              </div>
            </div>
          )}

          {earlierNews.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 mt-4">
                <span className="text-xs font-bold text-terminal-text-secondary uppercase tracking-widest">Earlier</span>
                <div className="flex-1 h-px bg-terminal-border" />
                <span className="text-xs text-terminal-text-secondary">{earlierNews.length} articles</span>
              </div>
              <div className="space-y-2">
                {earlierNews.map((item, i) => <NewsCard key={`earlier-${i}`} item={item} />)}
              </div>
            </div>
          )}

          {news.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-terminal-text-secondary">
              <svg className="w-12 h-12 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 0-2 2v0a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2"/>
                <path d="M16 2v4"/><path d="M8 8h8"/><path d="M8 12h6"/>
              </svg>
              <p className="text-sm font-medium">No news articles found</p>
              <p className="text-xs mt-1 opacity-60">Try refreshing or check back later</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

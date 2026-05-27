import { useState, useEffect } from 'react';
import axios from 'axios';

interface EarningsItem {
  symbol: string;
  name: string;
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  time: 'BMO' | 'AMC';
}

function formatRevenue(val: number | null): string {
  if (val == null) return '—';
  if (Math.abs(val) >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (Math.abs(val) >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toFixed(2)}`;
}

function formatEPS(val: number | null): string {
  if (val == null) return '—';
  return `$${val.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function relativeLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T12:00:00');
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `In ${diff}d`;
}

function getEarningsStatus(item: EarningsItem): 'reported' | 'upcoming' {
  return item.epsActual !== null || item.revenueActual !== null ? 'reported' : 'upcoming';
}

function getBeatMissColor(actual: number | null, estimate: number | null): string {
  if (actual == null || estimate == null) return 'text-terminal-text-secondary';
  return actual >= estimate ? 'text-terminal-green' : 'text-terminal-red';
}

function getBeatMissIcon(actual: number | null, estimate: number | null): string {
  if (actual == null || estimate == null) return '';
  return actual >= estimate ? '▲' : '▼';
}

function TimingBadge({ time }: { time: 'BMO' | 'AMC' }) {
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
      time === 'BMO'
        ? 'bg-terminal-cyan/10 text-terminal-cyan border-terminal-cyan/25'
        : 'bg-terminal-purple/10 text-terminal-purple border-terminal-purple/25'
    }`}>
      {time}
    </span>
  );
}

function EarningsRow({ item }: { item: EarningsItem }) {
  const status = getEarningsStatus(item);
  const epsColor = getBeatMissColor(item.epsActual, item.epsEstimate);
  const epsIcon = getBeatMissIcon(item.epsActual, item.epsEstimate);

  // Expected move heuristic: ~5-8% for mega caps, 8-15% for mid caps
  const expectedMove = item.symbol.length <= 3 ? '±5–8%' : '±8–12%';

  return (
    <div className={`grid gap-3 px-4 py-3 border rounded-lg transition-colors hover:border-terminal-cyan/30 ${
      status === 'reported'
        ? 'bg-terminal-card border-terminal-border/80'
        : 'bg-terminal-card border-terminal-border'
    }`} style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr' }}>
      {/* Symbol + timing */}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold text-terminal-text-primary font-mono">{item.symbol}</span>
        <TimingBadge time={item.time} />
      </div>

      {/* Company name */}
      <div className="min-w-0">
        <p className="text-xs text-terminal-text-secondary truncate">{item.name || item.symbol}</p>
        {status === 'upcoming' && (
          <p className="text-[10px] text-terminal-cyan mt-0.5">Expected: {expectedMove}</p>
        )}
      </div>

      {/* EPS */}
      <div className="text-right">
        <p className="text-[10px] text-terminal-text-secondary mb-0.5">EPS</p>
        <p className="text-xs font-mono">
          {status === 'reported' ? (
            <span className={`font-bold ${epsColor}`}>
              {epsIcon} {formatEPS(item.epsActual)}
            </span>
          ) : (
            <span className="text-terminal-text-secondary">{formatEPS(item.epsEstimate)}</span>
          )}
        </p>
        {status === 'reported' && item.epsEstimate !== null && (
          <p className="text-[10px] text-terminal-text-secondary/60">est: {formatEPS(item.epsEstimate)}</p>
        )}
      </div>

      {/* Revenue */}
      <div className="text-right">
        <p className="text-[10px] text-terminal-text-secondary mb-0.5">Revenue</p>
        {status === 'reported' ? (
          <>
            <p className={`text-xs font-mono font-bold ${getBeatMissColor(item.revenueActual, item.revenueEstimate)}`}>
              {getBeatMissIcon(item.revenueActual, item.revenueEstimate)} {formatRevenue(item.revenueActual)}
            </p>
            {item.revenueEstimate !== null && (
              <p className="text-[10px] text-terminal-text-secondary/60">est: {formatRevenue(item.revenueEstimate)}</p>
            )}
          </>
        ) : (
          <p className="text-xs font-mono text-terminal-text-secondary">{formatRevenue(item.revenueEstimate)}</p>
        )}
      </div>

      {/* Status badge */}
      <div className="text-right">
        {status === 'reported' ? (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            item.epsActual !== null && item.epsEstimate !== null && item.epsActual >= item.epsEstimate
              ? 'bg-terminal-green/10 text-terminal-green border-terminal-green/30'
              : item.epsActual !== null
              ? 'bg-terminal-red/10 text-terminal-red border-terminal-red/30'
              : 'bg-terminal-border text-terminal-text-secondary border-terminal-border'
          }`}>
            {item.epsActual !== null && item.epsEstimate !== null
              ? item.epsActual >= item.epsEstimate ? 'BEAT' : 'MISS'
              : 'REPORTED'}
          </span>
        ) : (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-terminal-yellow/10 text-terminal-yellow border-terminal-yellow/30">
            UPCOMING
          </span>
        )}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg px-4 py-3 animate-pulse">
      <div className="flex gap-4">
        <div className="w-16 h-4 bg-terminal-border rounded" />
        <div className="flex-1 h-4 bg-terminal-border rounded" />
        <div className="w-20 h-4 bg-terminal-border rounded" />
        <div className="w-20 h-4 bg-terminal-border rounded" />
      </div>
    </div>
  );
}

export default function EarningsCalendar() {
  const [earnings, setEarnings] = useState<EarningsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios
      .get<{ success: boolean; earnings: EarningsItem[] }>('/api/market/earnings', { timeout: 15000 })
      .then(({ data }) => {
        setEarnings(data.earnings ?? []);
      })
      .catch(() => {
        setError('Failed to load earnings data.');
      })
      .finally(() => setLoading(false));
  }, []);

  const reported = earnings.filter((e) => getEarningsStatus(e) === 'reported');
  const upcoming = earnings.filter((e) => getEarningsStatus(e) === 'upcoming');

  // Group upcoming by date
  const upcomingByDate = upcoming.reduce<Record<string, EarningsItem[]>>((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {});

  const sortedDates = Object.keys(upcomingByDate).sort();

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-terminal-text-primary">Earnings Calendar</h2>
          <p className="text-xs text-terminal-text-secondary mt-0.5">
            Upcoming & recent earnings reports · Next 14 days
          </p>
        </div>
        {!loading && !error && (
          <div className="flex items-center gap-3 text-xs text-terminal-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-terminal-cyan" />
              BMO = Before Market Open
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-terminal-purple" />
              AMC = After Market Close
            </span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-terminal-red/10 border border-terminal-red/30 px-4 py-3 text-terminal-red text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {earnings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-terminal-text-secondary">
              <svg className="w-12 h-12 mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <p className="text-sm font-medium">No earnings in the next 14 days</p>
              <p className="text-xs mt-1 opacity-60">Check back closer to earnings season</p>
            </div>
          ) : (
            <>
              {/* Coming Up section */}
              {sortedDates.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-terminal-cyan uppercase tracking-widest">Coming Up</span>
                    <div className="flex-1 h-px bg-terminal-border" />
                    <span className="text-xs text-terminal-text-secondary">{upcoming.length} report{upcoming.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Column headers */}
                  <div className="grid gap-3 px-4 py-1.5 mb-1" style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr' }}>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider">Symbol</p>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider">Company</p>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider text-right">EPS Est.</p>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider text-right">Rev. Est.</p>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider text-right">Status</p>
                  </div>

                  <div className="space-y-4">
                    {sortedDates.map((date) => (
                      <div key={date}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-terminal-text-primary">{formatDate(date)}</span>
                          <span className="text-[10px] text-terminal-cyan bg-terminal-cyan/10 px-2 py-0.5 rounded-full border border-terminal-cyan/20">
                            {relativeLabel(date)}
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {upcomingByDate[date].map((item, i) => (
                            <EarningsRow key={`${date}-${i}`} item={item} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Already Reported section */}
              {reported.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3 mt-6">
                    <span className="text-xs font-bold text-terminal-text-secondary uppercase tracking-widest">Already Reported</span>
                    <div className="flex-1 h-px bg-terminal-border" />
                    <span className="text-xs text-terminal-text-secondary">{reported.length} report{reported.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid gap-3 px-4 py-1.5 mb-1" style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr' }}>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider">Symbol</p>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider">Company</p>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider text-right">EPS Actual</p>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider text-right">Revenue</p>
                    <p className="text-[10px] text-terminal-text-secondary uppercase tracking-wider text-right">Result</p>
                  </div>
                  <div className="space-y-1.5">
                    {reported.map((item, i) => (
                      <EarningsRow key={`reported-${i}`} item={item} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

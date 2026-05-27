import { useState, useEffect } from 'react';
import axios from 'axios';

interface EconomicEvent {
  date: string;
  name: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'FED' | 'INFLATION' | 'JOBS' | 'GROWTH' | 'SPENDING';
  description: string;
  actual?: string;
  estimate?: string;
}

function impactBadge(impact: EconomicEvent['impact']) {
  const cfg = {
    HIGH:   { dot: '🔴', cls: 'bg-terminal-red/10 text-terminal-red border-terminal-red/30' },
    MEDIUM: { dot: '🟡', cls: 'bg-terminal-yellow/10 text-terminal-yellow border-terminal-yellow/30' },
    LOW:    { dot: '🟢', cls: 'bg-terminal-green/10 text-terminal-green border-terminal-green/30' },
  }[impact];
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${cfg.cls}`}>
      {cfg.dot} {impact}
    </span>
  );
}

function categoryIcon(category: EconomicEvent['category']): string {
  return { FED: '🏦', INFLATION: '📊', JOBS: '💼', GROWTH: '📈', SPENDING: '🛒' }[category];
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
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
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  return `In ${diff} days`;
}

function isFOMC(event: EconomicEvent): boolean {
  return event.category === 'FED' && event.name.toLowerCase().includes('fomc');
}

function EventCard({ event }: { event: EconomicEvent }) {
  const fomc = isFOMC(event);

  if (fomc) {
    return (
      <div className="rounded-xl border-2 border-terminal-yellow/50 bg-gradient-to-r from-terminal-yellow/10 to-terminal-yellow/5 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">{categoryIcon(event.category)}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-bold text-terminal-yellow">{event.name}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-terminal-yellow/20 text-terminal-yellow border-terminal-yellow/40">
                  FOMC MEETING
                </span>
              </div>
              <p className="text-xs text-terminal-text-secondary leading-relaxed">{event.description}</p>
              {(event.actual || event.estimate) && (
                <div className="flex gap-3 mt-2 text-xs">
                  {event.estimate && <span className="text-terminal-text-secondary">Est: <span className="text-terminal-text-primary">{event.estimate}</span></span>}
                  {event.actual && <span className="text-terminal-yellow font-semibold">Actual: {event.actual}</span>}
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0">{impactBadge(event.impact)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border px-4 py-3 transition-colors hover:border-terminal-cyan/30 ${
      event.impact === 'HIGH'
        ? 'bg-terminal-card border-terminal-red/20'
        : 'bg-terminal-card border-terminal-border'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-lg mt-0.5">{categoryIcon(event.category)}</span>
          <div>
            <p className={`text-sm font-semibold ${event.impact === 'HIGH' ? 'text-terminal-text-primary' : 'text-terminal-text-primary'}`}>
              {event.name}
            </p>
            <p className="text-xs text-terminal-text-secondary leading-relaxed mt-0.5">{event.description}</p>
            {(event.actual || event.estimate) && (
              <div className="flex gap-3 mt-1.5 text-xs">
                {event.estimate && <span className="text-terminal-text-secondary">Est: <span className="text-terminal-text-primary">{event.estimate}</span></span>}
                {event.actual && <span className="text-terminal-green font-semibold">Actual: {event.actual}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0">{impactBadge(event.impact)}</div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="bg-terminal-card border border-terminal-border rounded-lg px-4 py-3 animate-pulse space-y-2">
      <div className="h-3 bg-terminal-border rounded w-2/3" />
      <div className="h-3 bg-terminal-border rounded w-1/3" />
    </div>
  );
}

export default function EconomicCalendar() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    axios
      .get<{ success: boolean; events: EconomicEvent[] }>('/api/market/economic', { timeout: 10000 })
      .then(({ data }) => setEvents(data.events ?? []))
      .catch(() => setError('Failed to load economic calendar.'))
      .finally(() => setLoading(false));
  }, []);

  // Find next HIGH impact event
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextHigh = events.find((e) => {
    const d = new Date(e.date + 'T12:00:00');
    d.setHours(0, 0, 0, 0);
    return e.impact === 'HIGH' && d >= today;
  });

  const nextHighDiff = nextHigh
    ? Math.round((new Date(nextHigh.date + 'T12:00:00').setHours(0,0,0,0) - today.getTime()) / 86400000)
    : null;

  // Group events by date
  const byDate = events.reduce<Record<string, EconomicEvent[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});
  const sortedDates = Object.keys(byDate).sort();

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-terminal-text-primary">Economic Calendar</h2>
        <p className="text-xs text-terminal-text-secondary mt-0.5">Key macro events & Federal Reserve schedule</p>
      </div>

      {/* Next HIGH impact countdown */}
      {!loading && !error && nextHigh && (
        <div className="rounded-xl border-2 border-terminal-red/40 bg-terminal-red/5 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔴</span>
            <div>
              <p className="text-xs text-terminal-text-secondary uppercase tracking-widest font-semibold">Next HIGH Impact Event</p>
              <p className="text-sm font-bold text-terminal-text-primary mt-0.5">{nextHigh.name}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black text-terminal-red tabular-nums">
              {nextHighDiff === 0 ? 'TODAY' : nextHighDiff === 1 ? 'TOMORROW' : `${nextHighDiff}d`}
            </p>
            <p className="text-[10px] text-terminal-text-secondary">{formatDate(nextHigh.date).split(',')[0]}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-terminal-red/10 border border-terminal-red/30 px-4 py-3 text-terminal-red text-sm">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {/* Events timeline */}
      {!loading && !error && (
        <div className="space-y-6">
          {sortedDates.map((date) => {
            const label = relativeLabel(date);
            const isToday = label === 'Today';
            const isTomorrow = label === 'Tomorrow';
            return (
              <div key={date}>
                {/* Date group header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${
                    isToday
                      ? 'bg-terminal-cyan/15 text-terminal-cyan border-terminal-cyan/30'
                      : isTomorrow
                      ? 'bg-terminal-yellow/10 text-terminal-yellow border-terminal-yellow/30'
                      : 'bg-terminal-card border-terminal-border text-terminal-text-secondary'
                  }`}>
                    {isToday && <span className="w-1.5 h-1.5 rounded-full bg-terminal-cyan animate-pulse" />}
                    {label}
                  </div>
                  <span className="text-xs text-terminal-text-secondary">{formatDate(date)}</span>
                  <div className="flex-1 h-px bg-terminal-border" />
                  <span className="text-[10px] text-terminal-text-secondary">
                    {byDate[date].filter((e) => e.impact === 'HIGH').length} HIGH
                  </span>
                </div>

                {/* Events for this date */}
                <div className="space-y-2 ml-0">
                  {byDate[date].map((event, i) => (
                    <EventCard key={i} event={event} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      {!loading && !error && (
        <div className="rounded-lg bg-terminal-card border border-terminal-border px-4 py-3">
          <p className="text-[10px] text-terminal-text-secondary uppercase tracking-widest font-semibold mb-2">Impact Legend</p>
          <div className="flex flex-wrap gap-4">
            <span className="text-xs flex items-center gap-1.5 text-terminal-text-secondary">🔴 HIGH — Major market-moving event</span>
            <span className="text-xs flex items-center gap-1.5 text-terminal-text-secondary">🟡 MEDIUM — Moderate market impact</span>
            <span className="text-xs flex items-center gap-1.5 text-terminal-text-secondary">🟢 LOW — Minor economic data</span>
          </div>
          <div className="flex flex-wrap gap-4 mt-2">
            <span className="text-xs flex items-center gap-1.5 text-terminal-text-secondary">🏦 FED &nbsp;📊 INFLATION &nbsp;💼 JOBS &nbsp;📈 GROWTH &nbsp;🛒 SPENDING</span>
          </div>
        </div>
      )}
    </div>
  );
}

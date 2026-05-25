export function formatPrice(price: number): string {
  if (price >= 1000) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (price >= 1) {
    return `$${price.toFixed(2)}`;
  }
  return `$${price.toFixed(4)}`;
}

export function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}`;
}

export function formatPercent(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) {
    return `${(vol / 1_000_000_000).toFixed(1)}B`;
  }
  if (vol >= 1_000_000) {
    return `${(vol / 1_000_000).toFixed(1)}M`;
  }
  if (vol >= 1_000) {
    return `${(vol / 1_000).toFixed(0)}K`;
  }
  return vol.toFixed(0);
}

export function formatMarketCap(cap: number): string {
  if (cap >= 1_000_000_000_000) {
    return `$${(cap / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (cap >= 1_000_000_000) {
    return `$${(cap / 1_000_000_000).toFixed(1)}B`;
  }
  if (cap >= 1_000_000) {
    return `$${(cap / 1_000_000).toFixed(1)}M`;
  }
  return `$${cap.toLocaleString()}`;
}

export function formatNumber(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function getChangeColor(change: number): string {
  if (change > 0) return 'text-terminal-green';
  if (change < 0) return 'text-terminal-red';
  return 'text-terminal-text-secondary';
}

export function getDirectionColor(direction: string): string {
  switch (direction) {
    case 'LONG':
      return 'text-terminal-green';
    case 'SHORT':
      return 'text-terminal-red';
    default:
      return 'text-terminal-text-secondary';
  }
}

export function getStrengthColor(strength: number): string {
  if (strength >= 8) return 'text-terminal-green';
  if (strength >= 6) return 'text-terminal-yellow';
  if (strength >= 4) return 'text-terminal-cyan';
  return 'text-terminal-text-secondary';
}

export function getStrengthBgColor(strength: number): string {
  if (strength >= 8) return 'bg-terminal-green';
  if (strength >= 6) return 'bg-terminal-yellow';
  if (strength >= 4) return 'bg-terminal-cyan';
  return 'bg-terminal-text-secondary';
}

export function formatScanType(type: string): string {
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatStrengthBar(strength: number): string {
  const filled = Math.round((strength / 10) * 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function timeAgo(date: string | Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const nyTime = new Date(
    now.toLocaleString('en-US', { timeZone: 'America/New_York' })
  );
  const day = nyTime.getDay();
  const hours = nyTime.getHours();
  const minutes = nyTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  if (day === 0 || day === 6) return false;
  return timeInMinutes >= 570 && timeInMinutes < 960; // 9:30 AM to 4:00 PM
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function getConditionLabel(conditionType: string): string {
  const labels: Record<string, string> = {
    PRICE_ABOVE: 'Price Above',
    PRICE_BELOW: 'Price Below',
    PERCENT_CHANGE_UP: '% Change Up',
    PERCENT_CHANGE_DOWN: '% Change Down',
    VOLUME_SURGE: 'Volume Surge',
    RSI_ABOVE: 'RSI Above',
    RSI_BELOW: 'RSI Below',
    SCAN_MATCH: 'Scan Match',
  };
  return labels[conditionType] || conditionType;
}

export function getRsiColor(rsi: number): string {
  if (rsi >= 70) return 'text-terminal-red';
  if (rsi <= 30) return 'text-terminal-green';
  return 'text-terminal-cyan';
}

export function getMacdColor(histogram: number): string {
  return histogram >= 0 ? 'text-terminal-green' : 'text-terminal-red';
}

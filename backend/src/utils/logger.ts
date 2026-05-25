/**
 * Simple timestamp logger for PatternPulse.
 * Format: [2024-01-15 09:31:05] message
 */
export function log(message: string): void {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').substring(0, 19);
  console.log(`[${ts}] ${message}`);
}

export function logError(message: string, err?: unknown): void {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').substring(0, 19);
  const errMsg = err instanceof Error ? err.message : String(err ?? '');
  console.error(`[${ts}] ERROR: ${message}${errMsg ? ` - ${errMsg}` : ''}`);
}

export function logWarn(message: string): void {
  const now = new Date();
  const ts = now.toISOString().replace('T', ' ').substring(0, 19);
  console.warn(`[${ts}] WARN: ${message}`);
}

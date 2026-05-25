// Telegram removed — stub exports kept for import compatibility across codebase
import { ScanResult } from '../types';

export function initTelegram(_botToken: string): void {}
export function isInitialized(): boolean { return false; }
export function formatScanAlert(_result: ScanResult): string { return ''; }
export async function sendScanAlert(_chatId: string, _result: ScanResult): Promise<boolean> { return false; }
export async function sendMessage(_chatId: string, _message: string): Promise<boolean> { return false; }
export async function sendMarketOpenBrief(_chatId: string, _results: ScanResult[]): Promise<void> {}
export async function sendMarketCloseSummary(_chatId: string, _results: ScanResult[]): Promise<void> {}
export async function testConnection(_chatId: string): Promise<boolean> { return false; }

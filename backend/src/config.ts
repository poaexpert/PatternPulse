import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../../..', '.env') });
// Also try loading from backend directory
dotenv.config({ path: path.join(__dirname, '../..', '.env') });

export const config = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '8735837328:AAEg6DbgMqLoEX7n3troSUVM_w-foiqW-TE',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '6844213541',
  PUSHOVER_USER_KEY: process.env.PUSHOVER_USER_KEY || '',
  PUSHOVER_APP_TOKEN: process.env.PUSHOVER_APP_TOKEN || '',
  SCAN_INTERVAL_MINUTES: parseInt(process.env.SCAN_INTERVAL_MINUTES || '5', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const;

export default config;

export interface Env {
  DB: D1Database;
  TRADING_BOT_DO: DurableObjectNamespace;
  SESSION_JWT_SECRET?: string;
  MASTER_ENCRYPTION_KEY?: string;
  OWNER_TELEGRAM_ID?: string;
  DEFAULT_SIGNAL_CHANNEL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ALLOW_LIVE_TRADING?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: 'owner' | 'admin' | 'user';
  telegramId: string | null;
}

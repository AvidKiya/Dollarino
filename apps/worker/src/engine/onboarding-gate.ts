import type { D1Database } from '@cloudflare/workers-types';

export interface PreTradeOnboardingGateResult {
  ok: boolean;
  code?: 'ONBOARDING_GATE_REQUIRED' | 'TRADING_MODE_SELECTION_REQUIRED' | 'RISK_TERMS_REQUIRED';
  hasSelectedMode: boolean;
  hasAcceptedRisk: boolean;
  tradingMode: 'PAPER' | 'LIVE';
  error?: string;
}

/**
 * Enforces the V11.4 strict pre-trade safety gate:
 * No trade (demo/PAPER or real/LIVE) may be opened manually, automatically, via Telegram,
 * via Copy-Trade, or via Listing Sniper until the user has:
 *   1. Explicitly chosen a trading mode (PAPER or LIVE -> `trading_mode_selected = 1`), AND
 *   2. Checked and confirmed the Risk & Transparency agreement (`risk_terms_accepted_at IS NOT NULL`).
 */
export async function checkPreTradeOnboardingGate(
  db: D1Database,
  userId: string
): Promise<PreTradeOnboardingGateResult> {
  const row = await db
    .prepare(
      `SELECT u.risk_terms_accepted_at,
              COALESCE(bc.trading_mode_selected, 0) AS trading_mode_selected,
              COALESCE(bc.trading_mode, 'PAPER') AS trading_mode
       FROM users u
       LEFT JOIN bot_configs bc ON bc.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`
    )
    .bind(userId)
    .first<{
      risk_terms_accepted_at: string | null;
      trading_mode_selected: number;
      trading_mode: string;
    }>()
    .catch(() => null);

  const hasAcceptedRisk = Boolean(row?.risk_terms_accepted_at);
  const hasSelectedMode = Number(row?.trading_mode_selected ?? 0) === 1;
  const tradingMode: 'PAPER' | 'LIVE' = row?.trading_mode === 'LIVE' ? 'LIVE' : 'PAPER';

  if (hasSelectedMode && hasAcceptedRisk) {
    return {
      ok: true,
      hasSelectedMode: true,
      hasAcceptedRisk: true,
      tradingMode,
    };
  }

  if (!hasSelectedMode && !hasAcceptedRisk) {
    return {
      ok: false,
      code: 'ONBOARDING_GATE_REQUIRED',
      hasSelectedMode: false,
      hasAcceptedRisk: false,
      tradingMode,
      error:
        'قبل از باز شدن هرگونه معامله (دمو یا واقعی)، ابتدا حالت معاملاتی (حساب دمو یا واقعی) را انتخاب کرده و متن قوانین و ریسک را تیک زده و تایید کنید.',
    };
  }

  if (!hasSelectedMode) {
    return {
      ok: false,
      code: 'TRADING_MODE_SELECTION_REQUIRED',
      hasSelectedMode: false,
      hasAcceptedRisk: true,
      tradingMode,
      error:
        'لطفاً ابتدا انتخاب کنید که ربات با حساب دمو (آزمایشی) کار کند یا حساب واقعی (Trust Wallet)؛ پیش از انتخاب هیچ معامله‌ای باز نمی‌شود.',
    };
  }

  return {
    ok: false,
    code: 'RISK_TERMS_REQUIRED',
    hasSelectedMode: true,
    hasAcceptedRisk: false,
    tradingMode,
    error:
      'لطفاً ابتدا متن قوانین و پذیرش مسئولیت ریسک را تیک بزنید و دکمه تایید را بزنید تا معامله یا ربات فعال شود.',
  };
}

import { useEffect, useState } from 'react';
import {
  BrainCircuit,
  CheckCircle2,
  Crown,
  Gift,
  KeyRound,
  Play,
  Plus,
  Send,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface PlatformAIEngine {
  id: string;
  slot_order: number;
  provider: 'deepseek' | 'anthropic' | 'openai' | 'gemini' | 'openai_compatible';
  label: string;
  model: string;
  base_url: string | null;
  weight: number;
  is_active: number;
  api_key_masked: string;
  calls_today: number;
  daily_call_cap: number;
  last_test_status: string;
}

interface PlatformAISignal {
  id: string;
  symbol: string;
  timeframe: string;
  action: string;
  confidence: number;
  model_count: number;
  consensus_mode: string;
  thesis: string;
  created_at: string;
  model_votes: Array<{ provider: string; model: string; action: string; confidence: number }>;
}

const ADMIN_AI_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash', 'deepseek-v4-pro'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-7-sonnet-20250219'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro'],
  openai_compatible: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct'],
};

interface AdminOverview {
  users: Array<{
    id: string;
    email: string;
    username: string;
    role: string;
    is_blocked: number;
    telegram_id: string | null;
    telegram_username: string | null;
    created_at: string;
  }>;
  stats: {
    totalUsers: number;
    signalsCount: number;
    botsCount: number;
    trades: { total: number; open_count: number; total_pnl: number } | null;
  };
  settings: Record<string, string>;
}

interface SubOrder {
  id: string;
  user_id: string;
  email: string;
  username: string;
  plan_code: string;
  name_fa: string | null;
  name_en: string | null;
  status: string;
  payment_method: string;
  payment_reference: string | null;
  amount_usd: number;
  amount_toman: number;
  created_at: string;
}

interface PlanRow {
  code: string;
  price_usd: number;
  price_toman: number;
}

export function AdminPage({
  lang,
  currentUser,
  onUserUpdated,
}: {
  lang: Lang;
  currentUser: { id: string; email: string; username: string; role: string };
  onUserUpdated: () => void;
}) {
  const isFa = lang === 'fa';
  const isOwnerOrAdmin = currentUser.role === 'owner' || currentUser.role === 'admin';
  const [data, setData] = useState<AdminOverview | null>(null);
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [helpText, setHelpText] = useState('');
  const [broadcast, setBroadcast] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const [username, setUsername] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [grantEmail, setGrantEmail] = useState('');
  const [grantPlan, setGrantPlan] = useState('pro_monthly');
  const [grantDays, setGrantDays] = useState(30);

  const [payCfg, setPayCfg] = useState({
    subscriptionRequired: true,
    usdtTrc20Wallet: '',
    iranCardNumber: '',
    iranCardHolder: '',
    telegramSupport: '@Dollarinoofficial',
    proPriceUsd: 29,
    proPriceToman: 1950000,
    vipPriceUsd: 59,
    vipPriceToman: 3950000,
  });

  const [aiEngines, setAiEngines] = useState<PlatformAIEngine[]>([]);
  const [aiSignals, setAiSignals] = useState<PlatformAISignal[]>([]);
  const [consensusMode, setConsensusMode] = useState('ENSEMBLE_AUTO');
  const [cacheTtlSec, setCacheTtlSec] = useState(180);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResults, setAiTestResults] = useState<Array<{ slot_order: number; label: string; model: string; ok: boolean; latencyMs: number; reply: string }>>([]);
  const [aiForm, setAiForm] = useState({
    slotOrder: 1,
    provider: 'deepseek' as PlatformAIEngine['provider'],
    label: 'مدل ۱ (DeepSeek)',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    weight: 100,
  });

  const load = async () => {
    if (!isOwnerOrAdmin) return;
    const [ov, ordRes, subMe, aiRes] = await Promise.all([
      apiFetch<AdminOverview>('/api/admin/overview'),
      apiFetch<{ orders: SubOrder[] }>('/api/subscriptions/admin/orders').catch(() => ({ orders: [] })),
      apiFetch<{ plans: PlanRow[]; paymentConfig: Record<string, string> }>('/api/subscriptions/me').catch(() => null),
      apiFetch<{
        engines: PlatformAIEngine[];
        consensusMode: string;
        cacheTtlSec: number;
        latestSignals: PlatformAISignal[];
      }>('/api/admin/ai-engines').catch(() => null),
    ]);
    setData(ov);
    setOrders(ordRes.orders);
    setHelpText(ov.settings.help_text || '');
    if (aiRes) {
      setAiEngines(aiRes.engines || []);
      setConsensusMode(aiRes.consensusMode || 'ENSEMBLE_AUTO');
      setCacheTtlSec(aiRes.cacheTtlSec || 180);
      setAiSignals(aiRes.latestSignals || []);
    }

    if (subMe) {
      const pro = subMe.plans.find((p) => p.code === 'pro_monthly');
      const vip = subMe.plans.find((p) => p.code === 'vip_quarterly');
      setPayCfg({
        subscriptionRequired: (subMe.paymentConfig.subscription_required ?? 'true') !== 'false',
        usdtTrc20Wallet: subMe.paymentConfig.usdt_trc20_wallet || '',
        iranCardNumber: subMe.paymentConfig.iran_card_number || '',
        iranCardHolder: subMe.paymentConfig.iran_card_holder || '',
        telegramSupport: subMe.paymentConfig.telegram_support || '@Dollarinoofficial',
        proPriceUsd: pro?.price_usd ?? 29,
        proPriceToman: pro?.price_toman ?? 1950000,
        vipPriceUsd: vip?.price_usd ?? 59,
        vipPriceToman: vip?.price_toman ?? 3950000,
      });
    }
  };

  useEffect(() => {
    load().catch(() => {});
  }, [isOwnerOrAdmin]);

  const updateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch('/api/auth/profile', { method: 'PATCH', body: JSON.stringify({ username }) });
    setMsg(isFa ? 'نام کاربری ذخیره شد.' : 'Username updated.');
    onUserUpdated();
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch('/api/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setCurrentPassword('');
    setNewPassword('');
    setMsg(isFa ? 'رمز عبور با موفقیت تغییر یافت.' : 'Password updated securely.');
  };

  const reviewOrder = async (orderId: string, decision: 'APPROVE' | 'REJECT') => {
    setMsg(null);
    await apiFetch(`/api/subscriptions/admin/orders/${orderId}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    setMsg(decision === 'APPROVE' ? 'Subscription approved & activated!' : 'Order rejected.');
    await load();
    onUserUpdated();
  };

  const grantSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const res = await apiFetch<{ email: string; days: number }>('/api/subscriptions/admin/grant', {
      method: 'POST',
      body: JSON.stringify({ emailOrUserId: grantEmail, planCode: grantPlan, days: grantDays }),
    });
    setGrantEmail('');
    setMsg(`Granted ${res.days}d ${grantPlan} to ${res.email}!`);
    await load();
  };

  const savePayConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    await apiFetch('/api/subscriptions/admin/config', {
      method: 'PATCH',
      body: JSON.stringify(payCfg),
    });
    setMsg(isFa ? 'تنظیمات پرداخت و تعرفه اشتراک‌ها ذخیره شد.' : 'Subscription payment & pricing settings saved.');
    await load();
  };

  const savePlatformAiEngine = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/admin/ai-engines', {
        method: 'POST',
        body: JSON.stringify(aiForm),
      });
      setAiForm({ ...aiForm, apiKey: '' });
      setMsg(isFa ? `موتور هوش مصنوعی اسلات ${aiForm.slotOrder} ذخیره شد و برای کل پلتفرم فعال گردید!` : `Central AI Slot ${aiForm.slotOrder} saved!`);
      await load();
      onUserUpdated();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save AI engine');
    }
  };

  const saveConsensusConfig = async () => {
    setMsg(null);
    await apiFetch('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({
        ai_consensus_mode: consensusMode,
        ai_cache_ttl_sec: String(cacheTtlSec),
      }),
    });
    setMsg(isFa ? 'حالت ترکیب مدل‌های هوش مصنوعی و زمان کش ذخیره شد.' : 'AI Consensus mode & cache TTL updated.');
    await load();
    onUserUpdated();
  };

  const testPlatformEngines = async () => {
    setTestingAi(true);
    setAiTestResults([]);
    setMsg(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        results: Array<{ slot_order: number; label: string; model: string; ok: boolean; latencyMs: number; reply: string }>;
      }>('/api/admin/ai-engines/test', { method: 'POST' });
      setAiTestResults(res.results || []);
      setMsg(res.ok ? (isFa ? 'تست موتورهای هوش مصنوعی دلارینو موفق بود ✅' : 'Dollarino AI test passed!') : 'One or more AI models failed');
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      {msg && <div className="surface-card p-4 border-brand text-xs text-brand font-bold">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        <form onSubmit={updateProfile} className="surface-card p-5 space-y-3">
          <h3 className="font-black text-sm text-main flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-signal" />
            <span>{isFa ? 'پروفایل حساب کاربری' : 'Account Profile'}</span>
          </h3>
          <div className="text-sub">
            Email: <span className="text-main font-mono-num font-bold">{currentUser.email}</span> · Role:{' '}
            <span className="uppercase text-signal font-black">{currentUser.role}</span>
          </div>
          <div className="flex gap-2">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="flex-1 surface-input rounded-xl px-3 py-2" />
            <button type="submit" className="px-4 py-2 rounded-xl btn-emerald font-extrabold">
              {isFa ? 'ذخیره' : 'Save'}
            </button>
          </div>
        </form>

        <form onSubmit={updatePassword} className="surface-card p-5 space-y-3">
          <h3 className="font-black text-sm text-main flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-flame" />
            <span>{isFa ? 'تغییر رمز عبور' : 'Security & Password'}</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current Password"
              className="surface-input rounded-xl px-3 py-2"
            />
            <input
              required
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New Password (min 6)"
              className="surface-input rounded-xl px-3 py-2"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-xl btn-cobalt font-extrabold">
            {isFa ? 'به‌روزرسانی رمز عبور' : 'Update Password'}
          </button>
        </form>
      </div>

      {isOwnerOrAdmin && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="surface-card p-4">
              <div className="text-xs text-sub">{isFa ? 'کل کاربران' : 'Total Users'}</div>
              <div className="text-xl font-black font-mono-num text-main mt-1">{data.stats.totalUsers}</div>
            </div>
            <div className="surface-card p-4">
              <div className="text-xs text-sub">{isFa ? 'سفارش اشتراک در انتظار' : 'Pending Orders'}</div>
              <div className="text-xl font-black font-mono-num text-flame mt-1">
                {orders.filter((o) => o.status === 'PENDING_REVIEW').length}
              </div>
            </div>
            <div className="surface-card p-4">
              <div className="text-xs text-sub">{isFa ? 'کل معاملات' : 'Total Trades'}</div>
              <div className="text-xl font-black font-mono-num text-main mt-1">{data.stats.trades?.total ?? 0}</div>
            </div>
            <div className="surface-card p-4">
              <div className="text-xs text-sub">{isFa ? 'سیگنال‌ها' : 'Signals Logged'}</div>
              <div className="text-xl font-black font-mono-num text-main mt-1">{data.stats.signalsCount}</div>
            </div>
          </div>

          {/* Centralized Owner Multi-AI Engine (1 to 3 Combined Models) */}
          <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-5 border-[#1464F6]/35">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-black text-main flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-brand" />
                  <span>{isFa ? 'موتور هوش مصنوعی دلارینو — موتور دُرّبین (۱ تا ۳ مدل ترکیبی)' : 'Dollarino AI Engine — Dorrbin (1–3 Combined Models)'}</span>
                </h3>
                <p className="text-xs text-sub mt-1">
                  {isFa
                    ? 'کلیدهای API خود را (۱، ۲ یا حداکثر ۳ مدل) اینجا وارد کنید. تمام کاربرانی که دکمه «هوش مصنوعی» را می‌زنند، از خروجی اجماع همین مدل‌ها معامله می‌کنند (بدون نیاز به API کاربر).'
                    : 'Connect 1 to 3 AI API keys here. Every platform user trading via AI uses this single combined consensus brain.'}
                </p>
              </div>
              <button
                type="button"
                disabled={testingAi}
                onClick={() => void testPlatformEngines()}
                className="px-4 py-2 rounded-xl btn-emerald text-xs font-black inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{testingAi ? '...' : isFa ? 'تست همزمان مدل‌های فعال' : 'Ping Active AI Models'}</span>
              </button>
            </div>

            {aiTestResults.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                {aiTestResults.map((r) => (
                  <div key={r.slot_order} className={`p-3 rounded-2xl border ${r.ok ? 'badge-signal' : 'bg-rose-500/10 border-rose-500/35'}`}>
                    <div className="font-black text-main flex items-center justify-between">
                      <span>#{r.slot_order} {r.label}</span>
                      <span className="font-mono-num text-[11px]">{r.latencyMs}ms</span>
                    </div>
                    <div className="text-[11px] text-sub mt-1 break-all">{r.reply}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Consensus Mode & Cache Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end p-4 rounded-2xl surface-soft border text-xs">
              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">
                  {isFa ? 'حالت ترکیب مدل‌ها (Consensus)' : 'Consensus Mode'}
                </label>
                <select
                  value={consensusMode}
                  onChange={(e) => setConsensusMode(e.target.value)}
                  className="w-full surface-input rounded-xl px-3 py-2 text-xs"
                >
                  <option value="ENSEMBLE_AUTO">{isFa ? 'هوشمند خودکار (همه مدل‌های فعال تا ۳ مدل)' : 'Auto Ensemble (All active up to 3)'}</option>
                  <option value="SINGLE">{isFa ? 'تک‌مدل (فقط اسلات ۱)' : 'Single Model (Slot 1)'}</option>
                  <option value="DUAL">{isFa ? 'دو مدل ترکیبی (اسلات ۱ + ۲)' : 'Dual Consensus (Slots 1+2)'}</option>
                  <option value="ENSEMBLE_3">{isFa ? 'اجماع ۳ مدل همزمان (اسلات ۱ + ۲ + ۳)' : '3-Model Ensemble (Slots 1+2+3)'}</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">
                  {isFa ? 'زمان اشتراک‌گذاری کش بین کاربران (ثانیه)' : 'Shared Cache TTL (sec)'}
                </label>
                <input
                  type="number"
                  min={30}
                  max={900}
                  value={cacheTtlSec}
                  onChange={(e) => setCacheTtlSec(Number(e.target.value))}
                  className="w-full surface-input rounded-xl px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <button
                type="button"
                onClick={() => void saveConsensusConfig()}
                className="py-2.5 px-4 rounded-xl btn-cobalt text-xs font-black"
              >
                {isFa ? 'ذخیره تنظیمات ترکیب' : 'Save Consensus Settings'}
              </button>
            </div>

            {/* Active Slots List (1..3) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {[1, 2, 3].map((slot) => {
                const eng = aiEngines.find((e) => e.slot_order === slot);
                return (
                  <div key={slot} className="surface-soft rounded-2xl p-4 border space-y-2.5 flex flex-col justify-between">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full banner-cobalt-soft text-brand">
                          {isFa ? `اسلات ${slot}` : `Slot ${slot}`}
                        </span>
                        <div className="font-black text-main mt-1.5">
                          {eng ? eng.label : isFa ? 'خالی (اختیاری)' : 'Empty Slot'}
                        </div>
                        {eng && (
                          <div className="text-[11px] text-dim font-mono-num mt-0.5">
                            {eng.provider.toUpperCase()} · {eng.model}
                          </div>
                        )}
                      </div>
                      {eng && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/ai-engines/${eng.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ is_active: eng.is_active !== 1 }),
                            });
                            await load();
                            onUserUpdated();
                          }}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                            eng.is_active === 1 ? 'badge-signal' : 'bg-slate-500/20 text-dim'
                          }`}
                        >
                          {eng.is_active === 1 ? (isFa ? 'فعال' : 'ON') : (isFa ? 'خاموش' : 'OFF')}
                        </button>
                      )}
                    </div>

                    {eng ? (
                      <div className="space-y-2 pt-2 border-t text-[11px]">
                        <div className="flex justify-between text-sub">
                          <span>Key: <span className="font-mono-num text-main">{eng.api_key_masked}</span></span>
                          <span>Weight: <span className="font-mono-num text-main">{eng.weight}%</span></span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-dim">{eng.last_test_status || 'SAVED'}</span>
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setAiForm({
                                  slotOrder: slot,
                                  provider: eng.provider,
                                  label: eng.label,
                                  model: eng.model,
                                  baseUrl: eng.base_url || '',
                                  apiKey: '',
                                  weight: eng.weight,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg surface-card text-brand font-bold"
                            >
                              {isFa ? 'ویرایش' : 'Edit'}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch(`/api/admin/ai-engines/${eng.id}`, { method: 'DELETE' });
                                await load();
                                onUserUpdated();
                              }}
                              className="p-1.5 rounded-lg surface-card text-rose-500"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setAiForm({
                            ...aiForm,
                            slotOrder: slot,
                            label: `مدل ${slot} (${aiForm.provider.toUpperCase()})`,
                          })
                        }
                        className="w-full py-2 rounded-xl surface-card text-brand font-bold hover:border-brand"
                      >
                        + {isFa ? `افزودن به اسلات ${slot}` : `Configure Slot ${slot}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add / Update Slot Form */}
            <form onSubmit={savePlatformAiEngine} className="pt-3 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs items-end">
              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'شماره اسلات (۱ تا ۳)' : 'Slot (1-3)'}</label>
                <select
                  value={aiForm.slotOrder}
                  onChange={(e) => setAiForm({ ...aiForm, slotOrder: Number(e.target.value) })}
                  className="w-full surface-input rounded-xl px-2.5 py-2"
                >
                  <option value={1}>Slot 1</option>
                  <option value={2}>Slot 2</option>
                  <option value={3}>Slot 3</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'سرویس‌دهنده' : 'Provider'}</label>
                <select
                  value={aiForm.provider}
                  onChange={(e) => {
                    const p = e.target.value as PlatformAIEngine['provider'];
                    const models = ADMIN_AI_MODELS[p] || [];
                    const defaultBase =
                      p === 'deepseek'
                        ? 'https://api.deepseek.com'
                        : p === 'openai'
                          ? 'https://api.openai.com/v1'
                          : '';
                    setAiForm({
                      ...aiForm,
                      provider: p,
                      model: models[0] || aiForm.model,
                      baseUrl: defaultBase,
                      label: `مدل ${aiForm.slotOrder} (${p.toUpperCase()})`,
                    });
                  }}
                  className="w-full surface-input rounded-xl px-2.5 py-2"
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="anthropic">Claude (Anthropic)</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai_compatible">OpenRouter / Custom</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'نام مدل' : 'Model'}</label>
                <input
                  list="admin-ai-models"
                  value={aiForm.model}
                  onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
                  className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num"
                />
                <datalist id="admin-ai-models">
                  {(ADMIN_AI_MODELS[aiForm.provider] || []).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'عنوان نمایشی' : 'Label'}</label>
                <input
                  value={aiForm.label}
                  onChange={(e) => setAiForm({ ...aiForm, label: e.target.value })}
                  className="w-full surface-input rounded-xl px-2.5 py-2"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">{isFa ? 'کلید API (اختیاری در ویرایش)' : 'API Key'}</label>
                <input
                  type="password"
                  dir="ltr"
                  placeholder="sk-..."
                  value={aiForm.apiKey}
                  onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                  className="w-full surface-input rounded-xl px-2.5 py-2 font-mono-num"
                />
              </div>

              <button type="submit" className="py-2.5 px-3 rounded-xl btn-cobalt font-black inline-flex items-center justify-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>{isFa ? 'ثبت / آپدیت اسلات' : 'Save Slot'}</span>
              </button>
            </form>

            {aiSignals.length > 0 && (
              <div className="pt-2 border-t space-y-2 text-xs">
                <div className="font-black text-sub">{isFa ? 'آخرین تصمیمات اجماع هوش مصنوعی دلارینو' : 'Recent Dollarino AI Signals'}</div>
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                  {aiSignals.map((sig) => (
                    <div key={sig.id} className="surface-soft rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-black text-main">{sig.symbol} ({sig.timeframe})</span>{' '}
                        <span className={`font-black ${sig.action === 'LONG' ? 'text-signal' : sig.action === 'SHORT' ? 'text-loss' : 'text-dim'}`}>
                          {sig.action} ({sig.confidence}%)
                        </span>{' '}
                        <span className="text-[11px] text-dim">· {sig.model_count}x models</span>
                      </div>
                      <span className="text-[11px] text-sub truncate max-w-[360px]">{sig.thesis}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="surface-card p-5 space-y-3 overflow-x-auto">
            <h3 className="text-sm font-black text-main flex items-center gap-2">
              <Crown className="w-4 h-4 text-flame" />
              <span>{isFa ? 'سفارش‌های خرید اشتراک (تایید / رد)' : 'Subscription Orders (Approve / Reject)'}</span>
            </h3>
            {orders.length === 0 ? (
              <p className="text-xs text-dim py-3">{isFa ? 'هنوز سفارشی ثبت نشده است.' : 'No subscription orders yet.'}</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-dim border-b">
                  <tr>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'کاربر' : 'User'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'پلن' : 'Plan'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'کد پیگیری' : 'Payment Ref'}</th>
                    <th className="py-2.5 px-2 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                    <th className="py-2.5 px-2 text-end">{isFa ? 'عملیات' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-3 px-2">
                        <div className="font-bold text-main">{o.username}</div>
                        <div className="text-[11px] text-dim">{o.email}</div>
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-bold text-brand">{isFa ? o.name_fa || o.plan_code : o.name_en || o.plan_code}</div>
                        <div className="text-[11px] font-mono-num text-dim">
                          ${o.amount_usd} / {o.amount_toman?.toLocaleString()}T
                        </div>
                      </td>
                      <td className="py-3 px-2 font-mono-num text-[11px]">
                        <span className="text-sub">{o.payment_method}</span>
                        <div className="text-main break-all max-w-[200px]">{o.payment_reference || '-'}</div>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            o.status === 'ACTIVE'
                              ? 'badge-signal'
                              : o.status === 'PENDING_REVIEW'
                                ? 'bg-[#FF8A00]/15 text-flame'
                                : 'bg-rose-500/15 text-loss'
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-end space-x-1.5">
                        {o.status === 'PENDING_REVIEW' && (
                          <>
                            <button
                              onClick={() => void reviewOrder(o.id, 'APPROVE')}
                              className="px-2.5 py-1.5 rounded-xl btn-emerald font-bold inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{isFa ? 'تایید' : 'Approve'}</span>
                            </button>
                            <button
                              onClick={() => void reviewOrder(o.id, 'REJECT')}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-loss font-bold inline-flex items-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{isFa ? 'رد' : 'Reject'}</span>
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <form onSubmit={grantSubscription} className="surface-card p-5 space-y-3">
              <h3 className="font-black text-sm text-main flex items-center gap-2">
                <Gift className="w-4 h-4 text-signal" />
                <span>{isFa ? 'فعال‌سازی دستی اشتراک برای کاربر' : 'Manual Subscription Grant'}</span>
              </h3>
              <input
                required
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder={isFa ? 'ایمیل یا ID کاربر' : 'User Email or ID'}
                className="w-full surface-input rounded-xl px-3 py-2.5"
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)} className="surface-input rounded-xl px-3 py-2.5">
                  <option value="pro_monthly">Pro Monthly</option>
                  <option value="vip_quarterly">VIP Quarterly</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={grantDays}
                  onChange={(e) => setGrantDays(Number(e.target.value))}
                  className="surface-input rounded-xl px-3 py-2.5 font-mono-num"
                />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl btn-emerald font-extrabold">
                {isFa ? 'اعطای اشتراک فعال' : 'Grant Active Subscription'}
              </button>
            </form>

            <form onSubmit={savePayConfig} className="surface-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-main flex items-center gap-2">
                  <Settings className="w-4 h-4 text-brand" />
                  <span>{isFa ? 'تنظیمات کیف‌پول و تعرفه پلن‌ها' : 'Payment Wallet & Plan Pricing'}</span>
                </h3>
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-sub">
                  <input
                    type="checkbox"
                    checked={payCfg.subscriptionRequired}
                    onChange={(e) => setPayCfg({ ...payCfg, subscriptionRequired: e.target.checked })}
                  />
                  <span>{isFa ? 'اجبار اشتراک پولی' : 'Require Paid Plan'}</span>
                </label>
              </div>
              <input
                value={payCfg.usdtTrc20Wallet}
                onChange={(e) => setPayCfg({ ...payCfg, usdtTrc20Wallet: e.target.value })}
                placeholder="USDT TRC20 Wallet Address"
                className="w-full surface-input rounded-xl px-3 py-2 font-mono-num"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={payCfg.iranCardNumber}
                  onChange={(e) => setPayCfg({ ...payCfg, iranCardNumber: e.target.value })}
                  placeholder="Card Number (6037-...)"
                  className="surface-input rounded-xl px-3 py-2 font-mono-num"
                />
                <input
                  value={payCfg.iranCardHolder}
                  onChange={(e) => setPayCfg({ ...payCfg, iranCardHolder: e.target.value })}
                  placeholder="Card Holder Name"
                  className="surface-input rounded-xl px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <input type="number" value={payCfg.proPriceUsd} onChange={(e) => setPayCfg({ ...payCfg, proPriceUsd: Number(e.target.value) })} placeholder="Pro $" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                <input type="number" value={payCfg.proPriceToman} onChange={(e) => setPayCfg({ ...payCfg, proPriceToman: Number(e.target.value) })} placeholder="Pro T" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                <input type="number" value={payCfg.vipPriceUsd} onChange={(e) => setPayCfg({ ...payCfg, vipPriceUsd: Number(e.target.value) })} placeholder="VIP $" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
                <input type="number" value={payCfg.vipPriceToman} onChange={(e) => setPayCfg({ ...payCfg, vipPriceToman: Number(e.target.value) })} placeholder="VIP T" className="surface-input rounded-xl px-2.5 py-2 font-mono-num" />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl btn-cobalt font-extrabold">
                {isFa ? 'ذخیره تنظیمات مالی و پلن‌ها' : 'Save Pricing & Payment Info'}
              </button>
            </form>
          </div>

          <div className="surface-card p-5 overflow-x-auto">
            <h3 className="text-sm font-black mb-3 flex items-center gap-2 text-main">
              <Users className="w-4 h-4 text-brand" />
              <span>{isFa ? 'مدیریت کاربران و ادمین‌ها' : 'Instance Users & Admin Controls'}</span>
            </h3>
            <table className="w-full text-xs">
              <thead className="text-dim border-b">
                <tr>
                  <th className="py-2 px-2 text-start">User</th>
                  <th className="py-2 px-2 text-start">Telegram</th>
                  <th className="py-2 px-2 text-start">Role</th>
                  <th className="py-2 px-2 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 px-2 text-main font-semibold">
                      {u.username} <span className="text-dim">({u.email})</span>
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-sub">{u.telegram_id || '-'}</td>
                    <td className="py-2.5 px-2">
                      <span className="px-2 py-0.5 rounded surface-soft text-main font-bold">{u.role}</span>
                    </td>
                    <td className="py-2.5 px-2 text-end space-x-2">
                      {u.role !== 'owner' && (
                        <>
                          {currentUser.role === 'owner' && (
                            <button
                              onClick={async () => {
                                await apiFetch(`/api/admin/users/${u.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ role: u.role === 'admin' ? 'user' : 'admin' }),
                                });
                                void load();
                              }}
                              className="px-2.5 py-1 rounded-lg banner-cobalt-soft text-brand font-bold"
                            >
                              {u.role === 'admin' ? 'Demote' : 'Make Admin'}
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              await apiFetch(`/api/admin/users/${u.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ is_blocked: !u.is_blocked }),
                              });
                              void load();
                            }}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/15 text-loss font-bold"
                          >
                            {u.is_blocked ? 'Unblock' : 'Block'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="surface-card p-5 space-y-3">
              <h3 className="font-black text-sm flex items-center gap-2 text-main">
                <Shield className="w-4 h-4 text-signal" />
                <span>{isFa ? 'ویرایش متن راهنمای ربات تلگرام' : 'Telegram Bot Help Message'}</span>
              </h3>
              <textarea rows={4} value={helpText} onChange={(e) => setHelpText(e.target.value)} className="w-full surface-input rounded-2xl p-3" />
              <button
                onClick={async () => {
                  await apiFetch('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ help_text: helpText }) });
                  setMsg('Help message updated.');
                }}
                className="px-4 py-2 rounded-xl btn-emerald font-bold"
              >
                Save Help Text
              </button>
            </div>

            <div className="surface-card p-5 space-y-3">
              <h3 className="font-black text-sm flex items-center gap-2 text-main">
                <Send className="w-4 h-4 text-flame" />
                <span>{isFa ? 'ارسال پیام همگانی به کاربران تلگرام' : 'Telegram Broadcast'}</span>
              </h3>
              <textarea
                rows={4}
                value={broadcast}
                onChange={(e) => setBroadcast(e.target.value)}
                placeholder="Write announcement..."
                className="w-full surface-input rounded-2xl p-3"
              />
              <button
                onClick={async () => {
                  const res = await apiFetch<{ sent: number }>('/api/admin/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({ message: broadcast }),
                  });
                  setBroadcast('');
                  setMsg(`Broadcast sent to ${res.sent} Telegram users.`);
                }}
                className="px-4 py-2 rounded-xl btn-cobalt font-bold"
              >
                Send Broadcast
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

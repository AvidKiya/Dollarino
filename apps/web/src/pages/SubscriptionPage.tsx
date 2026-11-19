import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Crown,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

export interface UserEntitlement {
  hasPaidPlan: boolean;
  planCode: string;
  planNameFa: string;
  planNameEn: string;
  status: string;
  allowPaperDemo: boolean;
  allowAiTrading: boolean;
  allowCodexbot: boolean;
  allowCopyTrade: boolean;
  allowLiveTrading: boolean;
  daysRemaining: number;
  expiresAt: string | null;
  subscriptionRequired: boolean;
}

interface PlanRow {
  code: string;
  name_fa: string;
  name_en: string;
  description_fa: string | null;
  description_en: string | null;
  price_usd: number;
  price_toman: number;
  duration_days: number;
  features_json: string;
  is_popular: number;
}

interface SubOrder {
  id: string;
  plan_code: string;
  name_fa?: string;
  name_en?: string;
  status: string;
  payment_method: string;
  payment_reference: string | null;
  amount_usd: number;
  admin_note: string | null;
  expires_at: string | null;
  created_at: string;
}

export function SubscriptionPage({
  lang,
  onRefreshDashboard,
}: {
  lang: Lang;
  onRefreshDashboard: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const [entitlement, setEntitlement] = useState<UserEntitlement | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [orders, setOrders] = useState<SubOrder[]>([]);
  const [payCfg, setPayCfg] = useState<Record<string, string>>({});
  const [selectedPlan, setSelectedPlan] = useState<PlanRow | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'USDT_TRC20' | 'CARD_TO_CARD'>('USDT_TRC20');
  const [paymentRef, setPaymentRef] = useState('');
  const [payerNote, setPayerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState('');

  const loadData = async () => {
    const res = await apiFetch<{
      entitlement: UserEntitlement;
      plans: PlanRow[];
      orders: SubOrder[];
      paymentConfig: Record<string, string>;
    }>('/api/subscriptions/me');
    setEntitlement(res.entitlement);
    setPlans(res.plans);
    setOrders(res.orders);
    setPayCfg(res.paymentConfig);
    if (!selectedPlan) {
      const def = res.plans.find((p) => p.code === 'pro_monthly') || res.plans.find((p) => p.price_usd > 0) || null;
      setSelectedPlan(def);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const copyText = (val: string, key: string) => {
    void navigator.clipboard?.writeText(val);
    setCopied(key);
    setTimeout(() => setCopied(''), 1800);
  };

  const submitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan || selectedPlan.price_usd <= 0) return;
    setSubmitting(true);
    setMsg(null);
    try {
      await apiFetch('/api/subscriptions/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planCode: selectedPlan.code,
          paymentMethod,
          paymentReference: paymentRef.trim(),
          payerNote: payerNote.trim(),
        }),
      });
      setPaymentRef('');
      setPayerNote('');
      setMsg(
        isFa
          ? 'سفارش اشتراک با موفقیت ثبت شد! پس از بررسی و تایید مدیر (چند دقیقه)، اشتراک شما فوراً فعال می‌شود.'
          : 'Subscription order submitted! Once verified by admin, your Pro/VIP license activates immediately.'
      );
      await loadData();
      await onRefreshDashboard();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current License Status Banner */}
      <div className="card-tt p-5 sm:p-6 bg-gradient-to-br from-[#0f1628] to-[#0a0f1d] border-[#2563eb]/35 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#2563eb]/15 border border-[#2563eb]/40 flex items-center justify-center shrink-0">
            <Crown className={`w-6 h-6 ${entitlement?.hasPaidPlan ? 'text-[#27cd86]' : 'text-[#4b73f5]'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-white">
                {isFa ? entitlement?.planNameFa || 'وضعیت اشتراک' : entitlement?.planNameEn || 'Subscription Status'}
              </h1>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  entitlement?.hasPaidPlan
                    ? 'bg-[#27cd86]/15 text-[#27cd86] border-[#27cd86]/35'
                    : 'bg-[#f59f14]/15 text-[#f59f14] border-[#f59f14]/35'
                }`}
              >
                {entitlement?.hasPaidPlan
                  ? isFa
                    ? `فعال · ${entitlement.daysRemaining} روز باقی‌مانده`
                    : `ACTIVE · ${entitlement.daysRemaining}d left`
                  : isFa
                    ? 'حساب تست دمو (محدود)'
                    : 'Paper Demo Tier'}
              </span>
            </div>
            <p className="text-xs text-[#8f99aa] mt-1">
              {entitlement?.hasPaidPlan
                ? isFa
                  ? 'دسترسی کامل به ترید هوش مصنوعی، استراتژی‌های CodexBot، کپی‌ترید تلگرام و صرافی‌های Toobit و KCEX فعال است.'
                  : 'Full access unlocked: AI Trading, CodexBot Strategies, Telegram Copy-Trade & Live Toobit / KCEX.'
                : isFa
                  ? 'حساب دمو (Paper) برای تست رایگان باز است. برای اتصال لایو Toobit / KCEX، ترید هوشمند AI و کپی‌ترید تلگرام، اشتراک تهیه کنید.'
                  : 'Paper Demo testing is free. Purchase Pro or VIP to unlock AI Auto-Trading, Telegram Copy-Trade & Live Toobit/KCEX.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px]">
          {[
            { ok: true, label: isFa ? 'حساب دمو' : 'Paper Demo' },
            { ok: entitlement?.allowAiTrading, label: isFa ? 'ترید AI' : 'AI Trading' },
            { ok: entitlement?.allowCopyTrade, label: isFa ? 'کپی‌ترید تلگرام' : 'Copy-Trade' },
            { ok: entitlement?.allowLiveTrading, label: 'Toobit & KCEX' },
          ].map((e) => (
            <span
              key={e.label}
              className={`px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 ${
                e.ok ? 'bg-[#27cd86]/10 border-[#27cd86]/30 text-[#27cd86]' : 'bg-[#151a24] border-[#222836] text-[#6c7689]'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" /> {e.label}
            </span>
          ))}
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-[#4b73f5]/15 border border-[#4b73f5]/35 text-xs text-[#d6e2ff]">
          {msg}
        </div>
      )}

      {/* 3 Plan Cards (kifpool-style clean rounded cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((p) => {
          let feats: string[] = [];
          try {
            feats = JSON.parse(p.features_json) as string[];
          } catch {
            feats = [];
          }
          const isSelected = selectedPlan?.code === p.code;
          const isCurrent = entitlement?.planCode === p.code;

          return (
            <div
              key={p.code}
              className={`card-tt p-5 flex flex-col justify-between gap-4 transition ${
                p.is_popular
                  ? 'border-[#4b73f5]/60 ring-1 ring-[#4b73f5]/25'
                  : isSelected
                    ? 'border-[#27cd86]/60'
                    : ''
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-white">{isFa ? p.name_fa : p.name_en}</span>
                  {p.is_popular ? (
                    <span className="px-2 py-0.5 rounded-full bg-[#4b73f5]/20 text-[#9eb7ff] border border-[#4b73f5]/40 text-[10px] font-bold">
                      {isFa ? 'پرفروش‌ترین' : 'MOST POPULAR'}
                    </span>
                  ) : null}
                </div>

                <div>
                  <div className="flex items-baseline gap-2 font-mono-num">
                    <span className="text-2xl font-extrabold text-white">
                      {p.price_usd === 0 ? (isFa ? 'رایگان' : 'Free') : `$${p.price_usd}`}
                    </span>
                    {p.price_usd > 0 && (
                      <span className="text-xs text-[#6c7689]">/ {p.duration_days} {isFa ? 'روز' : 'days'}</span>
                    )}
                  </div>
                  {p.price_toman > 0 && (
                    <p className="text-xs text-[#27cd86] font-semibold mt-0.5">
                      {p.price_toman.toLocaleString()} {isFa ? 'تومان' : 'Toman'}
                    </p>
                  )}
                </div>

                <p className="text-xs text-[#8f99aa] leading-relaxed">{isFa ? p.description_fa : p.description_en}</p>

                <ul className="space-y-2 pt-2 border-t border-[#181d28] text-xs">
                  {feats.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[#c8d0dc]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#27cd86] shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {p.price_usd === 0 ? (
                <div className="py-2.5 text-center rounded-xl bg-[#131823] text-xs font-semibold text-[#8f99aa]">
                  {isCurrent ? (isFa ? 'فعال روی حساب دمو' : 'Active for Paper Testing') : (isFa ? 'همیشه رایگان برای تست' : 'Always Free for Demo')}
                </div>
              ) : (
                <button
                  onClick={() => setSelectedPlan(p)}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs transition ${
                    isSelected
                      ? 'bg-[#27cd86] text-[#080a0e]'
                      : 'bg-[#4b73f5] hover:bg-[#3d63e0] text-white'
                  }`}
                >
                  {isSelected
                    ? isFa ? 'انتخاب‌شده برای پرداخت ↓' : 'Selected for Checkout ↓'
                    : isFa ? 'خرید و فعال‌سازی اشتراک' : 'Select & Upgrade'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Checkout Panel */}
      {selectedPlan && selectedPlan.price_usd > 0 && (
        <div className="card-tt p-5 sm:p-6 space-y-5 border-[#4b73f5]/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#4b73f5]" />
              <span>
                {isFa
                  ? `پرداخت و فعال‌سازی: ${selectedPlan.name_fa} ($${selectedPlan.price_usd})`
                  : `Checkout: ${selectedPlan.name_en} ($${selectedPlan.price_usd})`}
              </span>
            </h2>
            <span className="text-xs text-[#6c7689]">
              {isFa ? `پشتیبانی تلگرام: ${payCfg.telegram_support || '@Dollarino_admin'}` : `Support: ${payCfg.telegram_support || '@Dollarino_admin'}`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <button
              type="button"
              onClick={() => setPaymentMethod('USDT_TRC20')}
              className={`p-3.5 rounded-xl border text-start flex items-center gap-3 transition ${
                paymentMethod === 'USDT_TRC20'
                  ? 'border-[#27cd86] bg-[#27cd86]/10 text-white'
                  : 'border-[#1d222e] bg-[#0b0e14] text-[#8f99aa]'
              }`}
            >
              <Wallet className="w-5 h-5 text-[#27cd86] shrink-0" />
              <div>
                <div className="font-bold">{isFa ? 'پرداخت با تتر (USDT · شبکه TRC20)' : 'Tether USDT (TRC20 Network)'}</div>
                <div className="text-[11px] opacity-80">${selectedPlan.price_usd} USDT</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('CARD_TO_CARD')}
              className={`p-3.5 rounded-xl border text-start flex items-center gap-3 transition ${
                paymentMethod === 'CARD_TO_CARD'
                  ? 'border-[#4b73f5] bg-[#4b73f5]/10 text-white'
                  : 'border-[#1d222e] bg-[#0b0e14] text-[#8f99aa]'
              }`}
            >
              <CreditCard className="w-5 h-5 text-[#4b73f5] shrink-0" />
              <div>
                <div className="font-bold">{isFa ? 'پرداخت کارت به کارت (تومانی)' : 'Card-to-Card (IRR / Toman)'}</div>
                <div className="text-[11px] opacity-80">{selectedPlan.price_toman.toLocaleString()} {isFa ? 'تومان' : 'Toman'}</div>
              </div>
            </button>
          </div>

          {/* Payment Destination Box */}
          <div className="p-4 rounded-xl bg-[#0b0e15] border border-[#1d2433] flex flex-wrap items-center justify-between gap-3 text-xs">
            {paymentMethod === 'USDT_TRC20' ? (
              <div className="space-y-1 min-w-0">
                <div className="text-[#8f99aa]">{isFa ? 'آدرس کیف‌پول تتر (شبکه TRC20):' : 'USDT TRC20 Deposit Address:'}</div>
                <div className="font-mono-num text-sm font-bold text-white break-all">
                  {payCfg.usdt_trc20_wallet || 'TYourTRC20WalletAddressHereSetInAdminPanel'}
                </div>
              </div>
            ) : (
              <div className="space-y-1 min-w-0">
                <div className="text-[#8f99aa]">
                  {isFa ? `شماره کارت (${payCfg.iran_card_holder || 'مدیریت دلارینو'}):` : `Bank Card (${payCfg.iran_card_holder || 'Admin'}):`}
                </div>
                <div className="font-mono-num text-sm font-bold text-white" dir="ltr">
                  {payCfg.iran_card_number || '6037-9975-0000-0000'}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() =>
                copyText(
                  paymentMethod === 'USDT_TRC20' ? payCfg.usdt_trc20_wallet || '' : payCfg.iran_card_number || '',
                  'addr'
                )
              }
              className="px-3 py-1.5 rounded-lg bg-[#161b26] hover:bg-[#1e2536] text-white inline-flex items-center gap-1.5 shrink-0"
            >
              <Copy className="w-3.5 h-3.5 text-[#4b73f5]" />
              <span>{copied === 'addr' ? (isFa ? 'کپی شد!' : 'Copied!') : isFa ? 'کپی' : 'Copy'}</span>
            </button>
          </div>

          <form onSubmit={submitCheckout} className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <input
              required
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder={
                paymentMethod === 'USDT_TRC20'
                  ? isFa ? 'هش تراکنش (TXID) را وارد کنید...' : 'Paste USDT TRC20 TXID...'
                  : isFa ? 'شماره پیگیری / ۴ رقم آخر کارت...' : 'Paste tracking code...'
              }
              className="bg-[#080a0e] border border-[#222836] rounded-xl px-3.5 py-2.5 font-mono-num text-white"
            />
            <input
              value={payerNote}
              onChange={(e) => setPayerNote(e.target.value)}
              placeholder={isFa ? 'آیدی تلگرام یا توضیحات (اختیاری)' : 'Telegram @handle or note (optional)'}
              className="bg-[#080a0e] border border-[#222836] rounded-xl px-3.5 py-2.5 text-white"
            />
            <button
              disabled={submitting}
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#27cd86] hover:bg-[#22b878] text-[#080a0e] font-bold flex items-center justify-center gap-2 transition"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{submitting ? '...' : isFa ? 'ثبت پرداخت و ارسال برای تایید' : 'Submit Payment Reference'}</span>
            </button>
          </form>
        </div>
      )}

      {/* Order History */}
      {orders.length > 0 && (
        <div className="card-tt p-5 space-y-3 text-xs">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#4b73f5]" />
            <span>{isFa ? 'سوابق سفارش اشتراک شما' : 'Your Subscription Orders'}</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-[11px] text-[#6c7689] border-b border-[#181d28]">
                <tr>
                  <th className="py-2 text-start">{isFa ? 'پلن' : 'Plan'}</th>
                  <th className="py-2 text-start">{isFa ? 'روش' : 'Method'}</th>
                  <th className="py-2 text-start">{isFa ? 'کد پیگیری / TXID' : 'Reference'}</th>
                  <th className="py-2 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                  <th className="py-2 text-end">{isFa ? 'تاریخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#151a24] font-mono-num">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 font-sans font-semibold text-white">{isFa ? o.name_fa || o.plan_code : o.name_en || o.plan_code}</td>
                    <td className="py-2.5 text-[#9aa5b5]">{o.payment_method}</td>
                    <td className="py-2.5 text-[#c5cede] max-w-[200px] truncate">{o.payment_reference || '-'}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold ${
                          o.status === 'ACTIVE'
                            ? 'bg-[#27cd86]/15 text-[#27cd86]'
                            : o.status === 'PENDING_REVIEW'
                              ? 'bg-[#f59f14]/15 text-[#f59f14]'
                              : 'bg-[#eb493d]/15 text-[#eb493d]'
                        }`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-end text-[#6c7689]">{o.created_at.slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

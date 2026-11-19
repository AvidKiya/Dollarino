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
          ? 'سفارش اشتراک با موفقیت ثبت شد! پس از بررسی و تایید مدیر، اشتراک شما فوراً فعال می‌شود.'
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
      {/* Hero License Banner */}
      <div className="hero-cobalt p-6 text-white flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Crown className={`w-6 h-6 ${entitlement?.hasPaidPlan ? 'text-[#55ff94]' : 'text-[#fde047]'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black">
                {isFa ? entitlement?.planNameFa || 'وضعیت اشتراک' : entitlement?.planNameEn || 'Subscription Status'}
              </h1>
              <span className="px-3 py-0.5 rounded-full text-[11px] font-bold bg-white/15">
                {entitlement?.hasPaidPlan
                  ? isFa
                    ? `فعال · ${entitlement.daysRemaining} روز`
                    : `ACTIVE · ${entitlement.daysRemaining}d`
                  : isFa
                    ? 'حساب دمو رایگان'
                    : 'Paper Demo Tier'}
              </span>
            </div>
            <p className="text-xs text-white/80 mt-1">
              {entitlement?.hasPaidPlan
                ? isFa
                  ? 'دسترسی کامل به هوش مصنوعی دلارینو، استراتژی منتخب دلارینو، کپی ترید دلارینو و صرافی‌های Toobit و KCEX فعال است.'
                  : 'Full access unlocked: Dollarino AI, Dollarino Select, Dollarino Copy-Trade & Live Toobit/KCEX.'
                : isFa
                  ? 'دمو رایگان باز است. با خرید اشتراک حرفه‌ای، هوش مصنوعی دلارینو، ترید لایو و کپی ترید دلارینو را فعال کنید.'
                  : 'Paper Demo is free. Upgrade to Pro or VIP for Dollarino AI, Copy-Trade & Live Toobit/KCEX.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { ok: true, label: isFa ? 'دمو رایگان' : 'Paper Demo' },
            { ok: entitlement?.allowAiTrading, label: isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI' },
            { ok: entitlement?.allowCopyTrade, label: isFa ? 'کپی ترید دلارینو' : 'Dollarino Copy-Trade' },
            { ok: entitlement?.allowLiveTrading, label: isFa ? 'اتصال صرافی واقعی' : 'Toobit & KCEX' },
          ].map((e) => (
            <span
              key={e.label}
              className={`px-3 py-1 rounded-xl inline-flex items-center gap-1 font-bold ${
                e.ok ? 'bg-[#059669] text-white shadow' : 'bg-white/10 text-white/60'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> {e.label}
            </span>
          ))}
        </div>
      </div>

      {msg && (
        <div className="surface-card p-4 border-brand text-xs text-main font-semibold">
          {msg}
        </div>
      )}

      {/* 3 Plan Cards */}
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
              className={`p-6 rounded-3xl flex flex-col justify-between gap-4 transition ${
                p.is_popular ? 'hero-cobalt text-white' : 'surface-card'
              } ${isSelected && !p.is_popular ? 'ring-2 ring-[#1464F6]' : ''}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-black text-base ${p.is_popular ? 'text-white' : 'text-main'}`}>
                    {isFa ? p.name_fa : p.name_en}
                  </span>
                  {p.is_popular ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-black">
                      {isFa ? 'محبوب‌ترین' : 'POPULAR'}
                    </span>
                  ) : null}
                </div>

                <div>
                  <div className="flex items-baseline gap-2 font-mono-num">
                    <span className={`text-3xl font-black ${p.is_popular ? 'text-white' : 'text-main'}`}>
                      {p.price_usd === 0 ? (isFa ? 'رایگان' : 'Free') : `$${p.price_usd}`}
                    </span>
                    {p.price_usd > 0 && (
                      <span className={`text-xs ${p.is_popular ? 'text-white/75' : 'text-dim'}`}>
                        / {p.duration_days} {isFa ? 'روز' : 'days'}
                      </span>
                    )}
                  </div>
                  {p.price_toman > 0 && (
                    <p className={`text-xs font-extrabold mt-1 ${p.is_popular ? 'text-[#7dffb0]' : 'text-signal'}`}>
                      {p.price_toman.toLocaleString()} {isFa ? 'تومان' : 'Toman'}
                    </p>
                  )}
                </div>

                <p className={`text-xs leading-relaxed ${p.is_popular ? 'text-white/85' : 'text-sub'}`}>
                  {isFa ? p.description_fa : p.description_en}
                </p>

                <ul className={`space-y-2 pt-3 border-t text-xs ${p.is_popular ? 'border-white/20' : ''}`}>
                  {feats.map((f, i) => (
                    <li key={i} className={`flex items-start gap-2 ${p.is_popular ? 'text-white' : 'text-sub'}`}>
                      <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${p.is_popular ? 'text-[#55ff94]' : 'text-signal'}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {p.price_usd === 0 ? (
                <div className="py-2.5 text-center rounded-xl surface-soft text-xs font-bold text-sub">
                  {isCurrent ? (isFa ? 'فعال روی حساب دمو' : 'Active for Demo') : (isFa ? 'همیشه رایگان برای تست' : 'Always Free')}
                </div>
              ) : (
                <button
                  onClick={() => setSelectedPlan(p)}
                  className={`w-full py-3 rounded-2xl font-extrabold text-xs transition ${
                    p.is_popular
                      ? 'bg-[#059669] hover:bg-[#047857] text-white shadow'
                      : isSelected
                        ? 'btn-emerald'
                        : 'btn-cobalt'
                  }`}
                >
                  {isSelected
                    ? isFa ? 'انتخاب‌شده برای پرداخت ↓' : 'Selected ↓'
                    : isFa ? 'خرید و فعال‌سازی اشتراک' : 'Select Plan'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Checkout Panel */}
      {selectedPlan && selectedPlan.price_usd > 0 && (
        <div className="surface-card p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-black text-main flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand" />
              <span>
                {isFa
                  ? `پرداخت و فعال‌سازی: ${selectedPlan.name_fa} ($${selectedPlan.price_usd})`
                  : `Checkout: ${selectedPlan.name_en} ($${selectedPlan.price_usd})`}
              </span>
            </h2>
            <span className="text-xs text-sub font-semibold">
              {isFa ? `پشتیبانی: ${payCfg.telegram_support || '@Dollarino_admin'}` : `Support: ${payCfg.telegram_support || '@Dollarino_admin'}`}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <button
              type="button"
              onClick={() => setPaymentMethod('USDT_TRC20')}
              className={`p-4 rounded-2xl border text-start flex items-center gap-3 transition ${
                paymentMethod === 'USDT_TRC20' ? 'btn-emerald' : 'surface-soft text-sub'
              }`}
            >
              <Wallet className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-extrabold">{isFa ? 'پرداخت با تتر (USDT · TRC20)' : 'Tether USDT (TRC20)'}</div>
                <div className="text-[11px] opacity-90">${selectedPlan.price_usd} USDT</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('CARD_TO_CARD')}
              className={`p-4 rounded-2xl border text-start flex items-center gap-3 transition ${
                paymentMethod === 'CARD_TO_CARD' ? 'btn-cobalt' : 'surface-soft text-sub'
              }`}
            >
              <CreditCard className="w-5 h-5 shrink-0" />
              <div>
                <div className="font-extrabold">{isFa ? 'پرداخت کارت به کارت (تومانی)' : 'Card-to-Card (Toman)'}</div>
                <div className="text-[11px] opacity-90">{selectedPlan.price_toman.toLocaleString()} {isFa ? 'تومان' : 'Toman'}</div>
              </div>
            </button>
          </div>

          <div className="p-4 rounded-2xl surface-soft border flex flex-wrap items-center justify-between gap-3 text-xs">
            {paymentMethod === 'USDT_TRC20' ? (
              <div className="space-y-1 min-w-0">
                <div className="text-sub">{isFa ? 'آدرس کیف‌پول تتر (TRC20):' : 'USDT TRC20 Address:'}</div>
                <div className="font-mono-num text-sm font-black text-main break-all">
                  {payCfg.usdt_trc20_wallet || 'Set USDT wallet in Admin Panel'}
                </div>
              </div>
            ) : (
              <div className="space-y-1 min-w-0">
                <div className="text-sub">
                  {isFa ? `شماره کارت (${payCfg.iran_card_holder || 'مدیریت دلارینو'}):` : `Bank Card (${payCfg.iran_card_holder || 'Admin'}):`}
                </div>
                <div className="font-mono-num text-sm font-black text-main" dir="ltr">
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
              className="px-3.5 py-2 rounded-xl surface-card border text-main font-bold inline-flex items-center gap-1.5 shrink-0"
            >
              <Copy className="w-3.5 h-3.5 text-brand" />
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
                  ? isFa ? 'هش تراکنش (TXID)...' : 'Paste USDT TRC20 TXID...'
                  : isFa ? 'شماره پیگیری / ۴ رقم آخر کارت...' : 'Paste tracking code...'
              }
              className="surface-input rounded-xl px-3.5 py-2.5 font-mono-num"
            />
            <input
              value={payerNote}
              onChange={(e) => setPayerNote(e.target.value)}
              placeholder={isFa ? 'آیدی تلگرام یا توضیحات (اختیاری)' : 'Telegram @handle (optional)'}
              className="surface-input rounded-xl px-3.5 py-2.5"
            />
            <button
              disabled={submitting}
              type="submit"
              className="px-5 py-2.5 rounded-xl btn-emerald font-extrabold flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{submitting ? '...' : isFa ? 'ثبت پرداخت و ارسال برای تایید' : 'Submit Payment Reference'}</span>
            </button>
          </form>
        </div>
      )}

      {orders.length > 0 && (
        <div className="surface-card p-5 space-y-3 text-xs">
          <h3 className="font-black text-sm text-main flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand" />
            <span>{isFa ? 'سوابق سفارش اشتراک' : 'Subscription Orders'}</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-[11px] text-dim border-b">
                <tr>
                  <th className="py-2 text-start">{isFa ? 'پلن' : 'Plan'}</th>
                  <th className="py-2 text-start">{isFa ? 'روش' : 'Method'}</th>
                  <th className="py-2 text-start">{isFa ? 'کد پیگیری' : 'Reference'}</th>
                  <th className="py-2 text-start">{isFa ? 'وضعیت' : 'Status'}</th>
                  <th className="py-2 text-end">{isFa ? 'تاریخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono-num">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-2.5 font-sans font-bold text-main">{isFa ? o.name_fa || o.plan_code : o.name_en || o.plan_code}</td>
                    <td className="py-2.5 text-sub">{o.payment_method}</td>
                    <td className="py-2.5 text-sub max-w-[200px] truncate">{o.payment_reference || '-'}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold ${
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
                    <td className="py-2.5 text-end text-dim">{o.created_at.slice(0, 16)}</td>
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

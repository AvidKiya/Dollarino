import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  Headphones,
  Loader2,
  Send,
  ShieldAlert,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  channel: string;
  support_mode?: 'AI_ASSISTANT' | 'HUMAN_ADMIN';
  last_message_at: string;
}

interface SupportMsg {
  id: string;
  ticket_id: string;
  sender_role: 'user' | 'admin' | 'ai' | 'system';
  sender_name: string | null;
  message: string;
  created_at: string;
}

function renderFormattedSupportText(raw: string) {
  const normalized = raw.replace(/\\n/g, '\n');
  const tokens = normalized.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-black text-main">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={idx} dir="ltr" className="px-1.5 py-0.5 rounded bg-black/25 font-mono text-[11px] text-amber-300">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
  lang: 'fa' | 'en';
  authenticated?: boolean;
  onGoToAuth?: () => void;
}

export function SupportModal({ open, onClose, lang, authenticated = true, onGoToAuth }: Props) {
  const isFa = lang === 'fa';
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [text, setText] = useState('');
  const [telegramSupport, setTelegramSupport] = useState('@Dollarino_bot');
  const [antiScam, setAntiScam] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [supportMode, setSupportMode] = useState<'AI_ASSISTANT' | 'HUMAN_ADMIN'>('AI_ASSISTANT');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!open || !authenticated) return;
    setLoading(true);
    try {
      const res = await apiFetch<{
        tickets: SupportTicket[];
        messages: SupportMsg[];
        telegramSupport: string;
        antiScamNotice: string;
      }>('/api/support/tickets');
      const tks = res.tickets || [];
      setTickets(tks);
      setMessages(res.messages || []);
      if (tks[0]?.support_mode === 'HUMAN_ADMIN') {
        setSupportMode('HUMAN_ADMIN');
      } else {
        setSupportMode('AI_ASSISTANT');
      }
      if (res.telegramSupport) setTelegramSupport(res.telegramSupport);
      if (res.antiScamNotice) setAntiScam(res.antiScamNotice);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [open, authenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open || !authenticated) return;
    const t = setInterval(() => void load(), 12_000);
    return () => clearInterval(t);
  }, [open, authenticated, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  if (!open) return null;

  const activeTicket = tickets.find((t) => t.status !== 'CLOSED') || tickets[0];
  const tgHandleClean = telegramSupport.replace(/^@/, '');

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending || !authenticated) return;
    setSending(true);
    setStatusMsg('');
    try {
      const res = await apiFetch<{
        ok: boolean;
        ticketId: string;
        supportMode: 'AI_ASSISTANT' | 'HUMAN_ADMIN';
        aiReply?: { id: string; sender_role: string; sender_name: string; message: string } | null;
      }>('/api/support/message', {
        method: 'POST',
        body: JSON.stringify({
          ticketId: activeTicket?.id,
          subject: isFa ? 'پشتیبانی آنلاین دلارینو' : 'Dollarino Online Support',
          message: clean,
          mode: supportMode === 'HUMAN_ADMIN' ? 'HUMAN' : 'AI',
        }),
      });
      setText('');
      if (res.supportMode) setSupportMode(res.supportMode);
      setStatusMsg(
        res.supportMode === 'HUMAN_ADMIN'
          ? isFa
            ? 'پیام شما مستقیماً برای مدیران پشتیبانی ارسال شد.'
            : 'Sent directly to human support admins.'
          : isFa
            ? 'پاسخ هوش مصنوعی آماده شد.'
            : 'AI assistant replied.'
      );
      await load();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  };

  const escalateToHumans = async () => {
    if (escalating || !authenticated) return;
    setEscalating(true);
    setStatusMsg('');
    try {
      const res = await apiFetch<{ ok: boolean; ticketId: string; supportMode: 'HUMAN_ADMIN' }>('/api/support/escalate', {
        method: 'POST',
        body: JSON.stringify({ ticketId: activeTicket?.id }),
      });
      setSupportMode(res.supportMode || 'HUMAN_ADMIN');
      setStatusMsg(
        isFa
          ? 'تیکت شما به مدیران انسانی ارجاع شد. می‌توانید مستقیم پیام بنویسید.'
          : 'Escalated to human managers. Your messages now go directly to admins.'
      );
      await load();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Escalation error');
    } finally {
      setEscalating(false);
    }
  };

  const switchToAi = async () => {
    try {
      await apiFetch('/api/support/switch-ai', {
        method: 'POST',
        body: JSON.stringify({ ticketId: activeTicket?.id }),
      });
      setSupportMode('AI_ASSISTANT');
      setStatusMsg(isFa ? 'دستیار هوشمند پشتیبانی فعال شد.' : 'Switched back to AI assistant.');
    } catch {
      setSupportMode('AI_ASSISTANT');
    }
  };

  const quickPrompts = isFa
    ? [
        'چطور صرافی Toobit یا KCEX را وصل کنم؟',
        'نحوه اتصال Trust Wallet و خرید توکن DEX چیست؟',
        'چطور ربات هوش مصنوعی را برای ترید خودکار روشن کنم؟',
      ]
    : [
        'How do I connect Toobit or KCEX safely?',
        'How does Trust Wallet & DexScreener swap work?',
        'How do I start AI auto-trading?',
      ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="pop-in panel !bg-[var(--panel)] rounded-[28px] w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden border hairline shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b hairline flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-2xl grid place-items-center text-white shadow-md"
              style={{
                background:
                  supportMode === 'HUMAN_ADMIN'
                    ? 'linear-gradient(135deg,#059669,#10B981)'
                    : 'linear-gradient(135deg,#0A4DFF,#2563EB)',
              }}
            >
              {supportMode === 'HUMAN_ADMIN' ? (
                <UserCheck className="w-5 h-5" />
              ) : (
                <Headphones className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-main flex items-center gap-2">
                <span>{isFa ? 'پشتیبانی هوشمند و مستقیم دلارینو' : 'Dollarino Smart + Human Support'}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                    supportMode === 'HUMAN_ADMIN'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-blue-500/15 text-blue-400'
                  }`}
                >
                  {supportMode === 'HUMAN_ADMIN'
                    ? isFa
                      ? 'اتصال مستقیم مدیران'
                      : 'Human Managers'
                    : isFa
                      ? 'دستیار AI فعال'
                      : 'AI Assistant'}
                </span>
              </h3>
              <p className="text-[11px] text-dim">
                {supportMode === 'HUMAN_ADMIN'
                  ? isFa
                    ? 'پیام‌های شما مستقیماً به پنل مدیران ارسال و پاسخ داده می‌شود'
                    : 'Direct conversation with Dollarino human support managers'
                  : isFa
                    ? 'پاسخگویی ۲۴ ساعته هوش مصنوعی + امکان ارجاع فوری به مدیران انسانی'
                    : 'Instant AI assistance with one-click escalation to human managers'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {supportMode === 'AI_ASSISTANT' ? (
              <button
                type="button"
                onClick={() => void escalateToHumans()}
                disabled={escalating}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-[11px] font-black inline-flex items-center gap-1.5 transition"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>{isFa ? 'ارتباط با مدیران' : 'Talk to Admins'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void switchToAi()}
                className="px-3 py-1.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 text-[11px] font-black inline-flex items-center gap-1.5 transition"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>{isFa ? 'پاسخ سریع AI' : 'Switch to AI'}</span>
              </button>
            )}
            <a
              href={`https://t.me/${tgHandleClean}`}
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--soft)] hover:brightness-95 text-[11px] font-bold text-main transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[var(--gold)]" />
              <span dir="ltr">{telegramSupport}</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-full btn-ghost grid place-items-center"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Anti-scam warning */}
        <div className="mx-6 mt-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 px-4 py-2.5 flex items-start gap-2.5 text-[11px] text-amber-300 leading-relaxed">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            {antiScam ||
              (isFa
                ? 'هشدار امنیتی: دلارینو هیچ‌گونه اکانت شخصی برای پشتیبانی یا دریافت وجه ندارد. تمام ارتباطات رسمی فقط از طریق همین پنجره آنلاین و ربات رسمی @Dollarino_bot انجام می‌شود.'
                : 'Security notice: Dollarino has NO personal DM support account. Only use this online window or the official bot @Dollarino_bot.')}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-[260px]">
          {!authenticated ? (
            <div className="py-8 space-y-4 text-center">
              <div className="inline-flex h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-400 items-center justify-center mx-auto">
                <Headphones className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <p className="text-sm font-black text-main">
                  {isFa ? 'برای گفتگوی آنلاین با دستیار AI و مدیران، وارد حساب شوید' : 'Sign in for Live AI & Human Support'}
                </p>
                <p className="text-xs text-dim leading-relaxed">
                  {isFa
                    ? 'پس از ورود می‌توانید به صورت ۲۴ ساعته با هوش مصنوعی پشتیبانی گفتگو کنید یا تیکت خود را مستقیم به مدیران دلارینو ارجاع دهید.'
                    : 'Sign in to chat 24/7 with our AI Support Assistant or escalate directly to human support managers.'}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {onGoToAuth && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoToAuth();
                    }}
                    className="btn-gold px-5 py-2.5 rounded-xl text-xs font-black"
                  >
                    {isFa ? 'ورود / ثبت‌نام در دلارینو' : 'Sign In / Register'}
                  </button>
                )}
                <a
                  href={`https://t.me/${tgHandleClean}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-cobalt px-5 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span dir="ltr">@{tgHandleClean}</span>
                </a>
              </div>
            </div>
          ) : loading && messages.length === 0 ? (
            <div className="py-12 grid place-items-center text-dim text-xs">
              <Loader2 className="w-5 h-5 animate-spin mb-2" />
              <span>{isFa ? 'در حال بارگذاری گفتگو...' : 'Loading conversation...'}</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-6 space-y-4 text-center">
              <div className="inline-flex h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-400 items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <p className="text-xs font-bold text-main">
                  {isFa
                    ? 'سوال خود را بپرسید تا دستیار هوشمند دلارینو فوراً پاسخ دهد'
                    : 'Ask anything and Dollarino AI Support will reply immediately'}
                </p>
                <p className="text-[11px] text-dim leading-relaxed">
                  {isFa
                    ? 'درباره اتصال صرافی، Trust Wallet، ربات AI، اشتراک یا اکستنشن بپرسید — و هر زمان خواستید مستقیم با مدیران انسانی گفتگو کنید.'
                    : 'Ask about exchanges, Trust Wallet, AI bots, or plans — and switch to human managers anytime.'}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp}
                    type="button"
                    onClick={() => setText(qp)}
                    className="px-3 py-1.5 rounded-xl bg-[var(--soft)] border hairline hover:border-blue-500/40 text-[11px] font-medium text-sub hover:text-main transition"
                  >
                    {qp}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.sender_role === 'user';
              const isAi = m.sender_role === 'ai';
              const isSystem = m.sender_role === 'system';

              if (isSystem) {
                return (
                  <div key={m.id} className="flex justify-center">
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2 text-[11px] text-emerald-300 max-w-[90%] text-center">
                      {m.message}
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-gradient-to-br from-[#0A4DFF] to-[#2563EB] text-white'
                        : isAi
                          ? 'bg-[var(--soft)] border border-blue-500/25 text-main'
                          : 'bg-[var(--soft)] border border-emerald-500/30 text-main'
                    }`}
                  >
                    <div className="text-[10px] opacity-80 font-bold mb-1 flex items-center gap-1.5">
                      {isAi && <Bot className="w-3.5 h-3.5 text-blue-400" />}
                      {!isUser && !isAi && <UserCheck className="w-3.5 h-3.5 text-emerald-400" />}
                      <span>
                        {isUser
                          ? isFa
                            ? 'شما'
                            : 'You'
                          : m.sender_name || (isAi ? (isFa ? 'دستیار هوشمند دلارینو' : 'Dollarino AI') : isFa ? 'مدیر پشتیبانی' : 'Support Admin')}
                      </span>
                      <span dir="ltr" className="opacity-65">
                        · {m.created_at.slice(11, 16)}
                      </span>
                    </div>
                    <div>{renderFormattedSupportText(m.message)}</div>
                  </div>
                  {isAi && supportMode === 'AI_ASSISTANT' && (
                    <button
                      type="button"
                      onClick={() => void escalateToHumans()}
                      className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold transition"
                    >
                      <UserCheck className="w-3 h-3" />
                      <span>{isFa ? 'سوال من حل نشد · گفتگو مستقیم با مدیران انسانی' : 'Escalate to Human Managers'}</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        {authenticated && (
        <form onSubmit={sendMessage} className="p-4 border-t hairline space-y-2.5 bg-black/15">
          {statusMsg && (
            <div className="text-[11px] font-bold text-jade inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{statusMsg}</span>
            </div>
          )}
          <div className="flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                supportMode === 'HUMAN_ADMIN'
                  ? isFa
                    ? 'پیام مستقیم به مدیران پشتیبانی بنویسید...'
                    : 'Write directly to human support admins...'
                  : isFa
                    ? 'سوال خود را از دستیار هوشمند بپرسید...'
                    : 'Ask the AI support assistant...'
              }
              className="field flex-1 text-xs py-2.5"
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="btn-gold px-5 rounded-xl text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{isFa ? 'ارسال' : 'Send'}</span>
            </button>
          </div>
          <div className="flex items-center justify-between text-[10px] text-dim px-1">
            <span>
              {supportMode === 'AI_ASSISTANT'
                ? isFa
                  ? 'حالت فعلی: پاسخگویی فوری هوش مصنوعی'
                  : 'Mode: Instant AI Support'
                : isFa
                  ? 'حالت فعلی: گفتگوی مستقیم با مدیران پشتیبانی'
                  : 'Mode: Direct Human Managers'}
            </span>
            {supportMode === 'AI_ASSISTANT' && (
              <button
                type="button"
                onClick={() => void escalateToHumans()}
                className="text-emerald-400 hover:underline font-bold"
              >
                {isFa ? 'اتصال مستقیم به مدیران انسانی' : 'Connect to Human Admins'}
              </button>
            )}
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

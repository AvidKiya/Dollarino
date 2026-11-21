import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Headphones,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';

interface SupportTicketRow {
  id: string;
  subject: string;
  status: string;
  channel: string;
  last_message_at: string;
}

interface SupportMessageRow {
  id: string;
  ticket_id: string;
  sender_role: 'user' | 'admin';
  sender_name: string | null;
  message: string;
  created_at: string;
}

export function SupportModal({
  open,
  lang,
  authenticated,
  onClose,
  onGoToAuth,
}: {
  open: boolean;
  lang: Lang;
  authenticated: boolean;
  onClose: () => void;
  onGoToAuth?: () => void;
}) {
  const isFa = lang === 'fa';
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [telegramSupport, setTelegramSupport] = useState('@Dollarino_bot');
  const [antiScamWarning, setAntiScamWarning] = useState(
    '⚠️ هشدار امنیتی مهم: دلارینو هیچ‌گونه اکانت پیوی شخصی برای پشتیبانی یا دریافت وجه ندارد. تمام ارتباطات رسمی فقط از طریق پشتیبانی آنلاین همین سایت و ربات رسمی @Dollarino_bot انجام می‌شود.'
  );
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadTickets = async (quiet = false) => {
    if (!authenticated) return;
    if (!quiet) setBusy(true);
    try {
      const res = await apiFetch<{
        tickets: SupportTicketRow[];
        messages: SupportMessageRow[];
        telegramSupport: string;
        antiScamWarning?: string;
      }>('/api/support/tickets');
      setTickets(res.tickets);
      setMessages(res.messages);
      if (res.telegramSupport) {
        setTelegramSupport(/Dollarino_admin/i.test(res.telegramSupport) ? '@Dollarino_bot' : res.telegramSupport);
      }
      if (res.antiScamWarning) setAntiScamWarning(res.antiScamWarning);
    } catch {
      // ignore initial error
    } finally {
      if (!quiet) setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || !authenticated) return;
    void loadTickets();
    const timer = window.setInterval(() => {
      void loadTickets(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [open, authenticated]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, open]);

  if (!open) return null;

  const sendMsg = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setStatusMsg('');
    try {
      await apiFetch('/api/support/message', {
        method: 'POST',
        body: JSON.stringify({
          ticketId: tickets[0]?.id,
          subject: isFa ? 'پشتیبانی آنلاین دلارینو' : 'Dollarino Online Support',
          message: draft.trim(),
        }),
      });
      setDraft('');
      setStatusMsg(isFa ? 'پیام شما به پشتیبانی ارسال شد ✅' : 'Message sent to support ✅');
      await loadTickets();
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'Failed to send');
    } finally {
      setBusy(false);
    }
  };

  const tgHandleClean = telegramSupport.replace(/^@/, '').trim() || 'Dollarino_bot';
  const activeTicket = tickets[0];

  return (
    <div
      dir={isFa ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-[85] bg-black/65 backdrop-blur-md p-3 sm:p-5 grid place-items-center overflow-y-auto"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="pop-in w-full max-w-lg panel !bg-[var(--panel)] rounded-[28px] shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b hairline flex items-center justify-between gap-3 bg-gradient-to-l from-[#1652f0]/15 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#1652f0]/15 border border-[#1652f0]/30 grid place-items-center relative shrink-0">
              <Headphones className="w-5 h-5" style={{ color: 'var(--gold)' }} />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[var(--panel)] absolute -top-0.5 -end-0.5 live-dot" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display font-bold text-base sm:text-lg text-main truncate">
                {isFa ? 'پشتیبانی آنلاین دلارینو' : 'Dollarino Online Support'}
              </h3>
              <p className="text-[11px] text-dim truncate">
                {isFa ? 'پاسخ‌گویی مستقیم در وب و تلگرام · همگام‌سازی لحظه‌ای' : 'Live support synced across Web & Telegram'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {authenticated && (
              <button
                type="button"
                onClick={() => void loadTickets()}
                className="h-9 w-9 grid place-items-center rounded-xl btn-ghost"
                aria-label={isFa ? 'بروزرسانی' : 'Refresh'}
              >
                <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 grid place-items-center rounded-xl btn-ghost"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-3">
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-main">
            <strong className="text-amber-400 block mb-0.5">{isFa ? 'هشدار مهم امنیتی:' : 'Official Security Notice:'}</strong>
            <span>
              {isFa
                ? antiScamWarning
                : 'Dollarino has NO personal/private Telegram DM admin account for payments or support. Only use Online Support here and our official bot @Dollarino_bot.'}
            </span>
          </div>
          {!authenticated ? (
            <div className="surface-soft rounded-2xl p-5 text-center space-y-3">
              <MessageCircle className="w-10 h-10 mx-auto text-brand" />
              <p className="text-sm font-bold text-main">
                {isFa ? 'برای گفتگوی آنلاین و ثبت تیکت وارد حساب خود شوید' : 'Sign in to start an online support chat'}
              </p>
              <p className="text-xs text-dim leading-relaxed">
                {isFa
                  ? 'اگر هنوز حساب نساخته‌اید، می‌توانید از دکمه زیر وارد شوید یا مستقیم به پشتیبانی تلگرام پیام دهید.'
                  : 'Log in or message our Telegram support desk directly.'}
              </p>
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
                    {isFa ? 'ورود / ثبت‌نام در سایت' : 'Sign In / Register'}
                  </button>
                )}
                <a
                  href={`https://t.me/${tgHandleClean}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-emerald px-5 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isFa ? 'پشتیبانی تلگرام' : 'Telegram Support'}</span>
                </a>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 badge-signal px-3 py-1 rounded-full font-bold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>
                    {activeTicket
                      ? `${isFa ? 'وضعیت تیکت:' : 'Ticket:'} ${
                          activeTicket.status === 'OPEN'
                            ? isFa ? 'در انتظار پاسخ' : 'Open'
                            : activeTicket.status === 'ANSWERED'
                              ? isFa ? 'پاسخ داده‌شده' : 'Answered'
                              : isFa ? 'بسته' : 'Closed'
                        }`
                      : isFa ? 'گفتگوی جدید با پشتیبانی' : 'New Support Conversation'}
                  </span>
                </span>
                <a
                  href={`https://t.me/${tgHandleClean}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand font-bold hover:underline inline-flex items-center gap-1"
                >
                  <Send className="w-3 h-3" />
                  <span dir="ltr">@{tgHandleClean}</span>
                </a>
              </div>

              <div className="space-y-2.5 min-h-[200px]">
                {messages.length === 0 ? (
                  <div className="surface-soft rounded-2xl p-4 text-xs text-dim text-center leading-relaxed">
                    {isFa
                      ? 'سلام! هر سوالی درباره اشتراک، اتصال صرافی Toobit/KCEX، هوش مصنوعی من یا کپی‌ترید دارید همین‌جا بنویسید تا کارشناسان دلارینو فوراً پاسخ دهند.'
                      : 'Ask anything about subscriptions, exchanges, My AI, or Copy Trading — our team replies live.'}
                  </div>
                ) : (
                  messages.map((m) => {
                    const isAdminMsg = m.sender_role === 'admin';
                    return (
                      <div
                        key={m.id}
                        className={`flex ${isAdminMsg ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            isAdminMsg
                              ? 'surface-soft border hairline text-main'
                              : 'bg-[#1652f0] text-white'
                          }`}
                        >
                          <p className="text-[10px] opacity-75 font-bold mb-1">
                            {isAdminMsg ? (m.sender_name || (isFa ? 'پشتیبانی دلارینو' : 'Support')) : (isFa ? 'شما' : 'You')}
                          </p>
                          <p className="whitespace-pre-wrap">{m.message}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>
            </>
          )}
        </div>

        {authenticated && (
          <div className="p-4 border-t hairline space-y-2 bg-[var(--panel)]">
            {statusMsg && (
              <p className="text-[11px] font-bold text-jade flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{statusMsg}</span>
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMsg();
                  }
                }}
                placeholder={isFa ? 'پیام خود را برای پشتیبانی بنویسید...' : 'Write your message to support...'}
                className="field text-xs flex-1 py-2.5"
              />
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={() => void sendMsg()}
                className="btn-gold px-4 py-2.5 rounded-xl text-xs font-black inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isFa ? 'ارسال' : 'Send'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

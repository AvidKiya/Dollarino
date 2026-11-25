import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Eye,
  ImagePlus,
  Loader2,
  LogIn,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Send,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type {
  AiChatMessageItem,
  AiChatSessionItem,
  CreatorInfo,
  ExtractedChartSetup,
  NavTab,
  SelectableAIModel,
} from '../lib/types';

export async function compressChartImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('خطا در خواندن فایل تصویر'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('فرمت تصویر پشتیبانی نمی‌شود'));
      img.onload = () => {
        const maxDim = 1400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function FormattedAiMarkdown({ text }: { text: string }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const blocks = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-[12.5px] sm:text-[13px] leading-relaxed break-words">
      {blocks.map((block, idx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const inner = block.slice(3, -3).replace(/^[a-zA-Z0-9_-]+\n/, '').trim();
          return (
            <div key={idx} className="relative rounded-xl bg-black/75 text-slate-100 border border-white/10 overflow-hidden my-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(inner);
                  setCopiedIdx(idx);
                  setTimeout(() => setCopiedIdx(null), 1500);
                }}
                className="absolute top-2 end-2 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold flex items-center gap-1"
              >
                {copiedIdx === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedIdx === idx ? 'کپی شد' : 'کپی'}</span>
              </button>
              <pre dir="ltr" className="p-3 pt-8 overflow-x-auto text-[11px] font-mono leading-relaxed">
                <code>{inner}</code>
              </pre>
            </div>
          );
        }

        const lines = block.split('\n');
        return (
          <div key={idx} className="space-y-1">
            {lines.map((line, lIdx) => {
              const tokens = line.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g);
              return (
                <p key={lIdx} className={line.trim() === '' ? 'h-1.5' : ''}>
                  {tokens.map((part, pIdx) => {
                    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
                      return (
                        <strong key={pIdx} className="font-black text-main">
                          {part.slice(2, -2)}
                        </strong>
                      );
                    }
                    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
                      return (
                        <code
                          key={pIdx}
                          dir="ltr"
                          className="px-1.5 py-0.5 rounded-md bg-[var(--soft)] border hairline font-mono text-[11px] text-[var(--gold)]"
                        >
                          {part.slice(1, -1)}
                        </code>
                      );
                    }
                    return <span key={pIdx}>{part}</span>;
                  })}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function SetupActionCard({
  setup,
  isFa,
  onOpenTerminal,
}: {
  setup: ExtractedChartSetup;
  isFa: boolean;
  onOpenTerminal?: (symbol: string) => void;
}) {
  const isLong = setup.direction === 'LONG';
  return (
    <div
      className={`mt-2.5 rounded-2xl border p-3.5 space-y-2.5 ${
        isLong
          ? 'bg-emerald-500/10 border-emerald-500/35'
          : 'bg-rose-500/10 border-rose-500/35'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isLong ? (
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-rose-400" />
          )}
          <span className="font-display font-black text-sm text-main" dir="ltr">
            {setup.symbol} · {setup.direction}
          </span>
          {setup.timeframe && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full surface-soft border hairline text-dim">
              {setup.timeframe}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-black">
          {setup.leverage && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--soft)] text-main">
              {setup.leverage}x
            </span>
          )}
          {setup.rrRatio && (
            <span className="px-2 py-0.5 rounded-full bg-[var(--gold)]/20 text-[var(--gold)]">
              R:R {setup.rrRatio}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]" dir="ltr">
        <div className="rounded-xl bg-black/15 px-2.5 py-1.5">
          <p className="text-[9px] text-dim uppercase">Entry</p>
          <p className="font-mono font-bold text-main">{setup.entry}</p>
        </div>
        <div className="rounded-xl bg-rose-500/15 px-2.5 py-1.5">
          <p className="text-[9px] text-rose-300 uppercase">Stop Loss</p>
          <p className="font-mono font-bold text-rose-300">{setup.stopLoss}</p>
        </div>
        <div className="rounded-xl bg-emerald-500/15 px-2.5 py-1.5">
          <p className="text-[9px] text-emerald-300 uppercase">TP1</p>
          <p className="font-mono font-bold text-emerald-300">{setup.tp1}</p>
        </div>
        {setup.tp2 && (
          <div className="rounded-xl bg-emerald-500/10 px-2.5 py-1.5">
            <p className="text-[9px] text-emerald-300 uppercase">TP2</p>
            <p className="font-mono font-bold text-emerald-300">{setup.tp2}</p>
          </div>
        )}
        {setup.tp3 && (
          <div className="rounded-xl bg-emerald-500/10 px-2.5 py-1.5">
            <p className="text-[9px] text-emerald-300 uppercase">TP3</p>
            <p className="font-mono font-bold text-emerald-300">{setup.tp3}</p>
          </div>
        )}
      </div>

      {onOpenTerminal && (
        <button
          type="button"
          onClick={() => onOpenTerminal(setup.symbol)}
          className="btn-cobalt w-full sm:w-auto px-3.5 py-2 rounded-xl text-[11px] font-black"
        >
          {isFa ? 'باز کردن در ترمینال معاملاتی' : 'Open Symbol in Terminal'}
        </button>
      )}
    </div>
  );
}

const DEFAULT_FALLBACK_MODEL: SelectableAIModel = {
  id: 'dollarino-live-ai',
  label: 'هوش مصنوعی زنده دلارینو',
  provider: 'deepseek',
  model: 'dollarino-live-quant-v1',
  source: 'PLATFORM',
  supportsVision: false,
  isDefault: true,
};

export function DedicatedAiChatSurface({
  lang,
  authenticated = true,
  compact = false,
  onNavigate,
  onSelectSymbolForTerminal,
  onExpandFullScreen,
  onCloseFloating,
  onGoAuth,
}: {
  lang: Lang;
  authenticated?: boolean;
  compact?: boolean;
  onNavigate?: (tab: NavTab) => void;
  onSelectSymbolForTerminal?: (symbol: string) => void;
  onExpandFullScreen?: () => void;
  onCloseFloating?: () => void;
  onGoAuth?: () => void;
}) {
  const isFa = lang === 'fa';
  const [models, setModels] = useState<SelectableAIModel[]>([DEFAULT_FALLBACK_MODEL]);
  const [selectedModelId, setSelectedModelId] = useState<string>('dollarino-live-ai');
  const [creator, setCreator] = useState<CreatorInfo>({
    nameFa: 'آوید کیا',
    nameEn: 'Avid Kiya',
    telegram: '@avidkiya',
    telegramUrl: 'https://t.me/avidkiya',
    instagram: '@avid_kiya',
    instagramUrl: 'https://instagram.com/avid_kiya',
    twitter: '@avid_kiya',
    twitterUrl: 'https://x.com/avid_kiya',
  });

  const [sessions, setSessions] = useState<AiChatSessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiChatMessageItem[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadModelsAndSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      if (!authenticated) {
        const mRes = await apiFetch<{
          models: SelectableAIModel[];
          selectedModelId: string;
          creator?: CreatorInfo;
        }>('/api/public/ai-models');
        if (mRes.models?.length) {
          setModels(mRes.models);
          setSelectedModelId(mRes.selectedModelId || mRes.models[0]!.id);
        }
        if (mRes.creator) setCreator(mRes.creator);
        return;
      }

      const [mRes, sRes] = await Promise.all([
        apiFetch<{ models: SelectableAIModel[]; selectedModelId: string; creator?: CreatorInfo }>(
          '/api/ai-assistant/models'
        ),
        apiFetch<{ sessions: AiChatSessionItem[] }>('/api/ai-assistant/sessions'),
      ]);
      if (mRes.models?.length) {
        setModels(mRes.models);
        setSelectedModelId(mRes.selectedModelId || mRes.models[0]!.id);
      }
      if (mRes.creator) setCreator(mRes.creator);
      const list = sRes.sessions || [];
      setSessions(list);
      if (list[0] && !activeSessionId) {
        setActiveSessionId(list[0].id);
        const detail = await apiFetch<{ messages: AiChatMessageItem[] }>(
          `/api/ai-assistant/sessions/${list[0].id}`
        ).catch(() => ({ messages: [] }));
        setMessages(detail.messages || []);
      }
    } catch {
      // Keep built-in fallback model ready
    } finally {
      setLoadingSessions(false);
    }
  }, [activeSessionId, authenticated]);

  useEffect(() => {
    void loadModelsAndSessions();
  }, [loadModelsAndSessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const openSession = async (sid: string) => {
    setActiveSessionId(sid);
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ messages: AiChatMessageItem[] }>(`/api/ai-assistant/sessions/${sid}`);
      setMessages(res.messages || []);
    } catch {
      setMessages([]);
    }
  };

  const startNewChat = async () => {
    setErrorMsg(null);
    setMessages([]);
    setPendingImage(null);
    if (!authenticated) {
      setActiveSessionId(null);
      return;
    }
    try {
      const res = await apiFetch<{ session: AiChatSessionItem }>('/api/ai-assistant/sessions', {
        method: 'POST',
        body: JSON.stringify({ modelId: selectedModelId || undefined }),
      });
      setActiveSessionId(res.session.id);
      setSessions((prev) => [res.session, ...prev]);
    } catch {
      setActiveSessionId(null);
    }
  };

  const deleteSession = async (sid: string) => {
    await apiFetch(`/api/ai-assistant/sessions/${sid}`, { method: 'DELETE' }).catch(() => {});
    setSessions((prev) => prev.filter((s) => s.id !== sid));
    if (activeSessionId === sid) {
      setActiveSessionId(null);
      setMessages([]);
    }
  };

  const handleModelChange = async (newId: string) => {
    setSelectedModelId(newId);
    if (!authenticated) return;
    await apiFetch('/api/ai-assistant/select-model', {
      method: 'POST',
      body: JSON.stringify({ modelId: newId }),
    }).catch(() => {});
  };

  const handleImageFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg(isFa ? 'لطفاً یک فایل تصویری معتبر (PNG/JPG/WebP) انتخاب کنید.' : 'Please choose a valid image.');
      return;
    }
    setErrorMsg(null);
    try {
      const dataUrl = await compressChartImageFile(file);
      setPendingImage(dataUrl);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Image load error');
    }
  };

  const sendMessage = async (overrideText?: string) => {
    const cleanText = (overrideText ?? input).trim();
    if ((!cleanText && !pendingImage) || sending) return;

    const attachedImg = pendingImage;
    const optimisticText =
      cleanText ||
      (isFa
        ? 'لطفاً این تصویر چارت را تحلیل کن و ستاپ معاملاتی بده.'
        : 'Please analyze this chart screenshot and suggest a trading setup.');

    const optimisticUserMsg: AiChatMessageItem = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: optimisticText,
      hasImage: Boolean(attachedImg),
      previewImageUrl: attachedImg || undefined,
    };

    const historySnapshot = messages
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, optimisticUserMsg]);
    if (!overrideText) setInput('');
    setPendingImage(null);
    setSending(true);
    setErrorMsg(null);

    try {
      const endpoint = authenticated ? '/api/ai-assistant/chat' : '/api/public/ai-chat';
      const payload = JSON.stringify({
        sessionId: authenticated ? activeSessionId : undefined,
        modelId: selectedModelId || undefined,
        message: cleanText,
        imageDataUrl: attachedImg,
        history: !authenticated ? historySnapshot : undefined,
      });

      let res: {
        sessionId: string;
        reply: string;
        modelId: string;
        modelLabel: string;
        usedVision: boolean;
        visionFallbackNotice?: string;
        setup: ExtractedChartSetup | null;
      };

      try {
        res = await apiFetch(endpoint, { method: 'POST', body: payload });
      } catch (primaryErr) {
        const errStatus = (primaryErr as { status?: number })?.status;
        const errText = primaryErr instanceof Error ? primaryErr.message : '';
        if (errStatus === 404 || /Route not found/i.test(errText)) {
          if (authenticated) {
            try {
              res = await apiFetch('/api/public/ai-chat', {
                method: 'POST',
                body: JSON.stringify({
                  modelId: selectedModelId || undefined,
                  message: cleanText,
                  imageDataUrl: attachedImg,
                  history: historySnapshot,
                }),
              });
            } catch (pubErr) {
              const pStatus = (pubErr as { status?: number })?.status;
              const pText = pubErr instanceof Error ? pubErr.message : '';
              if (pStatus === 404 || /Route not found/i.test(pText)) {
                throw new Error(
                  isFa
                    ? 'سرور بک‌اند (Cloudflare Worker) هنوز به نسخه جدید آپدیت نشده است (Route not found). لطفاً دستور npx wrangler deploy را روی سرور اجرا کنید تا مسیر جدید هوش مصنوعی فعال شود.'
                    : 'Backend Cloudflare Worker is still on an older version (Route not found). Run `npx wrangler deploy` to update the API routes.'
                );
              }
              throw pubErr;
            }
          } else {
            throw new Error(
              isFa
                ? 'سرور بک‌اند (Cloudflare Worker) هنوز به نسخه جدید آپدیت نشده است (Route not found). لطفاً دستور npx wrangler deploy را روی سرور اجرا کنید.'
                : 'Backend Cloudflare Worker is still on an older version (Route not found). Run `npx wrangler deploy`.'
            );
          }
        } else {
          throw primaryErr;
        }
      }

      if (authenticated && (!activeSessionId || activeSessionId !== res.sessionId)) {
        setActiveSessionId(res.sessionId);
        const sRes = await apiFetch<{ sessions: AiChatSessionItem[] }>('/api/ai-assistant/sessions').catch(() => ({
          sessions: [],
        }));
        if (sRes.sessions.length) setSessions(sRes.sessions);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: 'assistant',
          content: res.visionFallbackNotice ? `${res.visionFallbackNotice}\n\n${res.reply}` : res.reply,
          modelId: res.modelId,
          modelLabel: res.modelLabel,
          usedVision: res.usedVision,
          setup: res.setup,
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'خطا در ارتباط با هوش مصنوعی';
      setErrorMsg(msg);
    } finally {
      setSending(false);
    }
  };

  const activeModel = models.find((m) => m.id === selectedModelId) || models[0];
  const quickStarters = isFa
    ? [
        'تحلیل لحظه‌ای بیت‌کوین و ستاپ امروز',
        'کد Pine Script استراتژی EMA + RSI بنویس',
        'با سرمایه ۵۰۰ دلار و ریسک ۲٪ چقدر حجم بگیرم؟',
        'دلارینو و سازنده‌اش آوید کیا را معرفی کن',
      ]
    : [
        'Live BTC analysis & setup',
        'Write an EMA + RSI Pine Script strategy',
        'Position sizing for $500 & 2% risk',
        'Who built Dollarino?',
      ];

  return (
    <div
      className={`flex ${compact ? 'flex-col h-full' : 'flex-col lg:flex-row h-[calc(100vh-11rem)] min-h-[560px]'} gap-3`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) void handleImageFile(f);
      }}
    >
      {/* Sessions Sidebar in full page mode */}
      {!compact && authenticated && (
        <aside className="lg:w-72 shrink-0 panel rounded-[24px] p-3.5 flex flex-col justify-between gap-3">
          <div className="space-y-3 overflow-hidden flex flex-col">
            <button
              type="button"
              onClick={() => void startNewChat()}
              className="btn-cobalt w-full py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>{isFa ? 'گفتگوی جدید با هوش مصنوعی' : 'New AI Chat'}</span>
            </button>

            <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[340px] lg:max-h-none pe-1">
              {loadingSessions && sessions.length === 0 ? (
                <div className="py-6 text-center text-xs text-dim">
                  <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                  {isFa ? 'در حال بارگذاری...' : 'Loading...'}
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-[11px] text-dim text-center py-6">
                  {isFa ? 'هنوز گفتگویی ثبت نشده — اولین پیام یا عکس چارت را بفرستید!' : 'No conversations yet.'}
                </p>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.id}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition cursor-pointer ${
                      activeSessionId === s.id
                        ? 'bg-[var(--cobalt)]/20 border border-[var(--cobalt)]/40 text-main font-bold'
                        : 'surface-soft text-sub hover:brightness-95'
                    }`}
                    onClick={() => void openSession(s.id)}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-[var(--gold)]" />
                    <span className="truncate flex-1">{s.title}</span>
                    <button
                      type="button"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteSession(s.id);
                      }}
                      className="opacity-60 hover:opacity-100 text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="surface-soft rounded-2xl p-3 space-y-1.5 text-[11px]">
            <div className="flex items-center gap-1.5 font-black text-main">
              <UserCheck className="w-3.5 h-3.5 text-jade shrink-0" />
              <span>{isFa ? `طراح و سازنده: ${creator.nameFa}` : `Creator: ${creator.nameEn}`}</span>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] text-dim" dir="ltr">
              <a href={creator.telegramUrl} target="_blank" rel="noreferrer" className="hover:text-main underline">
                TG: {creator.telegram}
              </a>
              <a href={creator.instagramUrl} target="_blank" rel="noreferrer" className="hover:text-main underline">
                IG: {creator.instagram}
              </a>
              <a href={creator.twitterUrl} target="_blank" rel="noreferrer" className="hover:text-main underline">
                X: {creator.twitter}
              </a>
            </div>
          </div>
        </aside>
      )}

      {/* Main Chat Container */}
      <div
        className={`flex-1 flex flex-col min-h-0 ${
          compact ? '' : 'panel rounded-[26px]'
        } overflow-hidden relative ${dragOver ? 'ring-2 ring-[var(--gold)]' : ''}`}
      >
        {dragOver && (
          <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm grid place-items-center text-center p-6 pointer-events-none">
            <div className="space-y-2">
              <ImagePlus className="w-10 h-10 text-[var(--gold)] mx-auto" />
              <p className="font-display font-bold text-base text-white">
                {isFa ? 'عکس چارت را همین‌جا رها کنید' : 'Drop chart image here'}
              </p>
            </div>
          </div>
        )}

        {/* Top Header + Model Selector */}
        <div
          className={`px-3.5 pt-2 sm:pt-3 pb-2.5 border-b hairline shrink-0 space-y-2 ${
            compact ? 'bg-[var(--glass-a)] backdrop-blur-md' : 'bg-[var(--panel)]'
          }`}
        >
          {compact && (
            <div className="sm:hidden flex justify-center">
              <span className="w-10 h-1 rounded-full bg-[var(--line-strong)]" aria-hidden="true" />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-10 h-10 rounded-full overflow-hidden dz-logo-pill p-1 shrink-0 grid place-items-center">
                <img
                  src="/logo.png"
                  alt="Dollarino Logo"
                  className="w-full h-full object-contain drop-shadow-[0_2px_6px_rgba(22,82,240,0.3)]"
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-display font-bold text-xs sm:text-sm text-main truncate">
                    {isFa ? 'هوش مصنوعی دلارینو' : 'Dollarino AI'}
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    {isFa ? 'آنلاین' : 'Live'}
                  </span>
                  {activeModel?.supportsVision && (
                    <span className="hidden xs:inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400">
                      <Eye className="w-2.5 h-2.5" />
                      Vision
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-dim truncate">
                  {isFa ? `سازنده: ${creator.nameFa} (${creator.telegram})` : `Creator: ${creator.nameEn}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {!authenticated && onGoAuth && (
                <button
                  type="button"
                  onClick={() => {
                    onCloseFloating?.();
                    onGoAuth();
                  }}
                  title={isFa ? 'ورود برای ذخیره چت‌ها' : 'Sign in'}
                  className="h-8 px-2.5 rounded-full btn-ghost text-[10px] font-black inline-flex items-center gap-1"
                >
                  <LogIn className="w-3 h-3" />
                  <span className="hidden sm:inline">{isFa ? 'ورود' : 'Login'}</span>
                </button>
              )}

              {compact && (
                <button
                  type="button"
                  onClick={() => void startNewChat()}
                  title={isFa ? 'گفتگوی جدید' : 'New chat'}
                  className="h-8 w-8 rounded-full btn-ghost grid place-items-center"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                </button>
              )}

              {onExpandFullScreen && (
                <button
                  type="button"
                  onClick={onExpandFullScreen}
                  title={isFa ? 'باز کردن صفحه کامل چت' : 'Open Full AI Page'}
                  className="h-8 w-8 rounded-full btn-ghost grid place-items-center"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}

              {onCloseFloating && (
                <button
                  type="button"
                  onClick={onCloseFloating}
                  title={isFa ? 'جمع کردن به گوی' : 'Minimize to orb'}
                  className="h-8 w-8 rounded-full btn-ghost grid place-items-center"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {models.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectedModelId}
                onChange={(e) => void handleModelChange(e.target.value)}
                aria-label={isFa ? 'انتخاب مدل هوش مصنوعی' : 'Select AI Model'}
                className="w-full rounded-full bg-[var(--soft)] border hairline py-1.5 px-3 text-[11px] font-bold text-main outline-none focus:border-[var(--gold)] transition"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.supportsVision ? '[Vision] ' : ''}
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-4 px-2 space-y-4">
              <DollarinoRobotLogoIcon size={82} />
              <div className="space-y-1 max-w-md">
                <h4 className="font-display font-bold text-sm sm:text-base text-main">
                  {isFa ? 'ربات هوش مصنوعی دلارینو آماده است' : 'Dollarino AI is Ready'}
                </h4>
                <p className="text-[11px] sm:text-xs text-dim leading-relaxed">
                  {isFa
                    ? 'سوال بپرسید، اسم ارز را برای تحلیل زنده و ستاپ بنویسید، یا عکس چارت بفرستید.'
                    : 'Ask anything, request live coin setups, or drop a chart screenshot.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
                {quickStarters.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendMessage(q)}
                    className="surface-soft hover:brightness-95 active:scale-[0.98] transition text-start px-3 py-2.5 rounded-2xl text-[11px] font-bold text-sub border hairline"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] sm:max-w-[82%] rounded-[20px] px-3.5 py-2.5 shadow-sm ${
                    m.role === 'user'
                      ? 'bg-[#1652f0] text-white rounded-ee-md'
                      : 'surface-soft border hairline text-sub rounded-es-md'
                  }`}
                >
                  {m.previewImageUrl && (
                    <img
                      src={m.previewImageUrl}
                      alt="Uploaded chart"
                      className="max-h-52 rounded-xl mb-2 object-contain border border-white/15"
                    />
                  )}
                  {m.hasImage && !m.previewImageUrl && (
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg surface-soft border hairline mb-1.5">
                      <ImagePlus className="w-3 h-3" />
                      <span>{isFa ? 'تصویر چارت پیوست شد' : 'Chart image attached'}</span>
                    </div>
                  )}

                  {m.role === 'assistant' && m.modelLabel && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--gold)] mb-1">
                      <Bot className="w-3 h-3" />
                      <span>{m.modelLabel}</span>
                      {m.usedVision && (
                        <span className="inline-flex items-center gap-1">
                          · <Eye className="w-3 h-3" /> Vision
                        </span>
                      )}
                    </div>
                  )}

                  {m.role === 'assistant' ? (
                    <FormattedAiMarkdown text={m.content} />
                  ) : (
                    <p className="text-xs sm:text-[13px] whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  )}

                  {m.setup && (
                    <SetupActionCard
                      setup={m.setup}
                      isFa={isFa}
                      onOpenTerminal={
                        authenticated && onNavigate
                          ? (sym) => {
                              const clean = sym.endsWith('USDT') ? sym : `${sym}USDT`;
                              onSelectSymbolForTerminal?.(clean);
                              onNavigate('terminal');
                              onCloseFloating?.();
                            }
                          : !authenticated && onGoAuth
                            ? () => {
                                onCloseFloating?.();
                                onGoAuth();
                              }
                            : undefined
                      }
                    />
                  )}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="surface-soft border hairline rounded-[20px] rounded-es-md px-3.5 py-2.5 flex items-center gap-2 text-xs text-dim">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" />
                <span>{isFa ? 'در حال تحلیل و نوشتن پاسخ...' : 'Thinking...'}</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Error notice */}
        {errorMsg && (
          <div className="mx-3.5 mb-2 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/35 text-[11px] font-bold text-rose-300 flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <button type="button" onClick={() => setErrorMsg(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modern Pill Chat Bar Composer + Chart Upload/Paste */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className={`px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t hairline space-y-2 shrink-0 ${
            compact ? 'bg-[var(--glass-a)] backdrop-blur-md' : 'bg-[var(--panel)]'
          }`}
        >
          {pendingImage && (
            <div className="flex items-center gap-3 p-2 rounded-2xl surface-soft border hairline">
              <img src={pendingImage} alt="Preview" className="h-12 w-16 object-cover rounded-xl border hairline" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-main truncate flex items-center gap-1.5">
                  <ImagePlus className="w-3.5 h-3.5 text-brand shrink-0" />
                  <span className="truncate">{isFa ? 'عکس چارت آماده ارسال به AI' : 'Chart ready for AI'}</span>
                </p>
                <p className="text-[10px] text-dim truncate">
                  {isFa ? 'پیام بنویسید یا دکمه ارسال را بزنید.' : 'Add prompt or send.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                className="h-7 w-7 rounded-full btn-ghost grid place-items-center text-rose-400 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void handleImageFile(file);
            }}
          />

          <div className="flex items-end gap-1.5 rounded-[24px] bg-[var(--soft)] border border-[var(--line-strong)] focus-within:border-[var(--gold)] px-2 py-1.5 shadow-sm transition">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={isFa ? 'ارسال عکس چارت' : 'Attach chart image'}
              className="h-9 w-9 shrink-0 rounded-full hover:bg-[var(--panel)] grid place-items-center text-[var(--gold)] transition"
            >
              <ImagePlus className="w-[18px] h-[18px]" />
            </button>

            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const items = Array.from(e.clipboardData?.items || []);
                const imgItem = items.find((it) => it.type.startsWith('image/'));
                const file = imgItem?.getAsFile();
                if (file) {
                  e.preventDefault();
                  void handleImageFile(file);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={
                isFa
                  ? 'هر سوالی دارید بپرسید یا عکس چارت بفرستید...'
                  : 'Message Dollarino AI or attach a chart...'
              }
              className="flex-1 bg-transparent border-0 outline-none focus:ring-0 py-1.5 px-1 text-xs sm:text-sm text-main placeholder:text-dim resize-none max-h-28 leading-relaxed"
            />

            <button
              type="submit"
              disabled={sending || (!input.trim() && !pendingImage)}
              aria-label={isFa ? 'ارسال پیام' : 'Send message'}
              className="h-9 w-9 sm:w-auto sm:px-3.5 shrink-0 rounded-full btn-cobalt font-black text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-35 transition active:scale-95"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {!compact && <span className="hidden sm:inline">{isFa ? 'ارسال' : 'Send'}</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Liquid Glass Hero Orb Avatar: Animated Floating-Orb Robot + Animated Candlesticks Behind */
export function DollarinoRobotLogoIcon({ size = 82 }: { size?: number }) {
  return (
    <div
      className="dz-hero-orb shrink-0 pointer-events-none"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <div className="dz-hero-shell">
        {/* Animated Candlesticks Behind the Robot */}
        <svg className="dz-hero-candles" viewBox="0 0 64 64" fill="none">
          <g className="dz-candle dz-candle-1">
            <line x1="10" y1="26" x2="10" y2="54" stroke="#10D856" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.65" />
            <rect x="7.5" y="34" width="5" height="14" rx="1.5" fill="#10D856" fillOpacity="0.45" />
          </g>
          <g className="dz-candle dz-candle-2">
            <line x1="21" y1="18" x2="21" y2="50" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.6" />
            <rect x="18.5" y="25" width="5" height="17" rx="1.5" fill="#38BDF8" fillOpacity="0.38" />
          </g>
          <g className="dz-candle dz-candle-3">
            <line x1="32" y1="13" x2="32" y2="47" stroke="#16E664" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.7" />
            <rect x="29.5" y="20" width="5" height="19" rx="1.5" fill="#16E664" fillOpacity="0.44" />
          </g>
          <g className="dz-candle dz-candle-4">
            <line x1="43" y1="16" x2="43" y2="49" stroke="#10D856" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.65" />
            <rect x="40.5" y="23" width="5" height="16" rx="1.5" fill="#10D856" fillOpacity="0.42" />
          </g>
          <g className="dz-candle dz-candle-5">
            <line x1="54" y1="9" x2="54" y2="44" stroke="#16E664" strokeWidth="1.6" strokeLinecap="round" strokeOpacity="0.75" />
            <rect x="51.5" y="15" width="5" height="20" rx="1.5" fill="#16E664" fillOpacity="0.52" />
          </g>
        </svg>

        {/* Cute Animated Floating-Orb Robot Foreground */}
        <svg className="dz-hero-bot" viewBox="0 0 24 24">
          <defs>
            <linearGradient id="dzHeroRb" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4f8dff" />
              <stop offset="100%" stopColor="#1a43c8" />
            </linearGradient>
          </defs>
          <circle className="dz-ant" cx="12" cy="2.6" r="1.5" fill="#10b981" />
          <path d="M12 4v2.4" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
          <rect x="1.6" y="10" width="2.4" height="5.4" rx="1.2" fill="#2f5fe0" />
          <rect x="20" y="10" width="2.4" height="5.4" rx="1.2" fill="#2f5fe0" />
          <rect x="4" y="6" width="16" height="13" rx="5" fill="url(#dzHeroRb)" />
          <rect x="6" y="8" width="12" height="8.6" rx="3.6" fill="#0b1f6e" fillOpacity=".62" />
          <circle className="dz-eye" cx="9.6" cy="12.2" r="1.7" fill="#7dffd0" />
          <circle className="dz-eye" cx="14.4" cy="12.2" r="1.7" fill="#7dffd0" />
          <path d="M10.2 15.2q1.8 1.1 3.6 0" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".92" />
          <path d="M6.2 7.6q2-1.1 5-1" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".5" />
        </svg>

        {/* Liquid Glass Specular Highlights */}
        <span className="dz-hero-top" />
        <span className="dz-hero-sheen" />
      </div>

      {/* Sparkling Star Matching Floating Orb */}
      <svg className="dz-hero-spark" viewBox="0 0 24 24">
        <defs>
          <linearGradient id="dzHeroSp" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7dffd0" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <path fill="url(#dzHeroSp)" d="M12 1c.8 6 3 9.2 11 11-8 1.8-10.2 5-11 11-.8-6-3-9.2-11-11 8-1.8 10.2-5 11-11z" />
      </svg>
    </div>
  );
}

const ORB_STORAGE_KEY = 'dollarino_ai_orb_pos_v3';
const ORB_SIZE = 58;
const ORB_MOBILE_SIZE = 44;
const ORB_MARGIN = 10;
const ORB_IDLE_MS = 2800;

const LIQUID_ORB_LOGO_DATA_URI =
  'data:image/webp;base64,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';

interface OrbPos {
  side: 'left' | 'right';
  y: number;
}

function clampOrbY(y: number): number {
  if (typeof window === 'undefined') return 320;
  const mobile = (document.documentElement.clientWidth || window.innerWidth) < 640;
  const orbSize = mobile ? ORB_MOBILE_SIZE : ORB_SIZE;
  const bottomReserve = mobile ? 148 : 96;
  const min = mobile ? 84 : 70;
  const max = Math.max(min + 40, window.innerHeight - orbSize - bottomReserve);
  return Math.min(max, Math.max(min, y));
}

function defaultOrbSide(lang: Lang): 'left' | 'right' {
  // In RTL (Persian) the navigation sidebar is on the right, so keep the orb on the left edge by default
  return lang === 'fa' ? 'left' : 'right';
}

function loadSavedOrbPos(lang: Lang): OrbPos {
  const fallbackSide = defaultOrbSide(lang);
  if (typeof window === 'undefined') return { side: fallbackSide, y: 640 };
  const mobile = (document.documentElement.clientWidth || window.innerWidth) < 640;
  const defaultOffset = mobile ? 195 : 135;
  try {
    const raw = localStorage.getItem(ORB_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OrbPos>;
      const side = parsed.side === 'left' || parsed.side === 'right' ? parsed.side : fallbackSide;
      const y = clampOrbY(typeof parsed.y === 'number' ? parsed.y : window.innerHeight - defaultOffset);
      return { side, y };
    }
  } catch {
    // ignore storage limits
  }
  return { side: fallbackSide, y: clampOrbY(window.innerHeight - defaultOffset) };
}

export function FloatingAiChat({
  lang,
  authenticated,
  activeTab,
  onNavigate,
  onSelectSymbolForTerminal,
  onGoAuth,
}: {
  lang: Lang;
  authenticated: boolean;
  activeTab?: NavTab;
  onNavigate?: (tab: NavTab) => void;
  onSelectSymbolForTerminal?: (symbol: string) => void;
  onGoAuth?: () => void;
}) {
  const isFa = lang === 'fa';
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<OrbPos>(() => loadSavedOrbPos(lang));
  const [vw, setVw] = useState<number>(() =>
    typeof window !== 'undefined' ? (document.documentElement.clientWidth || window.innerWidth) : 390
  );
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragCoords, setDragCoords] = useState<{ x: number; y: number } | null>(null);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragMetaRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const scheduleCollapse = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setCollapsed(true);
    }, ORB_IDLE_MS);
  }, []);

  const undock = useCallback(() => {
    setCollapsed(false);
    scheduleCollapse();
  }, [scheduleCollapse]);

  useEffect(() => {
    const onResize = () => {
      setVw(document.documentElement.clientWidth || window.innerWidth);
      setPos((p) => ({ ...p, y: clampOrbY(p.y) }));
    };
    const onScroll = () => {
      if (!dragging && !open) {
        setCollapsed(true);
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [dragging, open]);

  useEffect(() => {
    if (!open && !dragging) {
      scheduleCollapse();
    }
  }, [open, dragging, scheduleCollapse]);

  // Hide floating orb when user is already inside the dedicated full-page AI Chat view
  if (authenticated && activeTab === 'aichat') return null;

  const currentOrbSize = vw < 640 ? ORB_MOBILE_SIZE : ORB_SIZE;
  const restX = pos.side === 'right' ? Math.max(ORB_MARGIN, vw - currentOrbSize - ORB_MARGIN) : ORB_MARGIN;
  const activeX = dragCoords ? dragCoords.x : restX;
  const activeY = dragCoords ? dragCoords.y : clampOrbY(pos.y);

  return (
    <>
      {open && (
        <>
          <div
            className="sm:hidden fixed inset-0 z-[179] bg-black/35 backdrop-blur-[3px]"
            onClick={() => {
              setOpen(false);
              undock();
            }}
          />
          <div
            dir={isFa ? 'rtl' : 'ltr'}
            className={`fixed inset-x-0 bottom-0 h-[84dvh] rounded-t-[28px] sm:inset-x-auto sm:bottom-16 ${
              pos.side === 'left' ? 'sm:left-5' : 'sm:right-5'
            } sm:w-[420px] sm:h-[560px] sm:max-h-[80vh] sm:rounded-[28px] z-[180] liquid-ai-sheet overflow-hidden flex flex-col pop-in`}
          >
            <DedicatedAiChatSurface
              lang={lang}
              authenticated={authenticated}
              compact
              onNavigate={onNavigate}
              onSelectSymbolForTerminal={onSelectSymbolForTerminal}
              onGoAuth={onGoAuth}
              onExpandFullScreen={
                authenticated && onNavigate
                  ? () => {
                      setOpen(false);
                      onNavigate('aichat');
                    }
                  : undefined
              }
              onCloseFloating={() => {
                setOpen(false);
                undock();
              }}
            />
          </div>
        </>
      )}

      {/* Liquid Glass Floating AI Orb (Logo + Blinking AI Robot Badge + AssistiveTouch Edge Dock) */}
      {!open && (
        <>
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
            <filter id="dzGlassFx" x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
              <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="bump" />
              <feSpecularLighting
                in="bump"
                surfaceScale={5}
                specularConstant={1.25}
                specularExponent={22}
                lightingColor="#fff"
                result="spec"
              >
                <fePointLight x={-40} y={-55} z={120} />
              </feSpecularLighting>
              <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
              <feMorphology in="SourceAlpha" operator="erode" radius="1.6" result="er" />
              <feComposite in="SourceAlpha" in2="er" operator="out" result="edge" />
              <feGaussianBlur in="edge" stdDeviation="0.7" result="edgeSoft" />
              <feFlood floodColor="#fff" floodOpacity="0.75" />
              <feComposite in2="edgeSoft" operator="in" result="rim" />
              <feComponentTransfer in="SourceGraphic" result="soft">
                <feFuncA type="linear" slope="0.93" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="soft" />
                <feMergeNode in="specIn" />
                <feMergeNode in="rim" />
              </feMerge>
            </filter>
          </svg>

          <div
            data-side={pos.side}
            className={`dz-orb${dragging ? ' drag' : ''}${collapsed && !dragging ? ' docked' : ''}`}
            style={
              {
                left: `${activeX}px`,
                top: `${activeY}px`,
                '--logo': `url("${LIQUID_ORB_LOGO_DATA_URI}")`,
              } as React.CSSProperties
            }
            onPointerDown={(e) => {
              if (e.button !== 0 && e.pointerType === 'mouse') return;
              e.currentTarget.setPointerCapture(e.pointerId);
              if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
              setCollapsed(false);
              dragMetaRef.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                originX: restX,
                originY: activeY,
                moved: false,
              };
            }}
            onPointerMove={(e) => {
              const meta = dragMetaRef.current;
              if (!meta || meta.pointerId !== e.pointerId) return;
              const dx = e.clientX - meta.startX;
              const dy = e.clientY - meta.startY;
              if (!meta.moved && Math.hypot(dx, dy) > 5) {
                meta.moved = true;
                setDragging(true);
              }
              if (meta.moved) {
                const maxX = Math.max(ORB_MARGIN, vw - ORB_SIZE - ORB_MARGIN);
                const nextX = Math.min(maxX, Math.max(ORB_MARGIN, meta.originX + dx));
                const nextY = clampOrbY(meta.originY + dy);
                setDragCoords({ x: nextX, y: nextY });
              }
            }}
            onPointerUp={(e) => {
              const meta = dragMetaRef.current;
              if (!meta || meta.pointerId !== e.pointerId) return;
              dragMetaRef.current = null;
              if (meta.moved && dragCoords) {
                const mid = vw / 2;
                const nextSide: 'left' | 'right' = dragCoords.x + ORB_SIZE / 2 < mid ? 'left' : 'right';
                const nextPos: OrbPos = { side: nextSide, y: clampOrbY(dragCoords.y) };
                setPos(nextPos);
                setDragCoords(null);
                setDragging(false);
                try {
                  localStorage.setItem(ORB_STORAGE_KEY, JSON.stringify(nextPos));
                } catch {
                  // ignore
                }
                scheduleCollapse();
              } else {
                setDragCoords(null);
                setDragging(false);
                setCollapsed(false);
                setOpen(true);
              }
            }}
            onPointerCancel={() => {
              dragMetaRef.current = null;
              setDragCoords(null);
              setDragging(false);
              scheduleCollapse();
            }}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') undock();
            }}
            onFocus={undock}
          >
            <div className="dz-wrap">
              <button
                type="button"
                className="dz-btn"
                aria-label={isFa ? 'باز کردن دستیار هوشمند دلارینو' : 'Open Dollarino AI Assistant'}
                title={isFa ? 'لمس برای چت هوش مصنوعی · کشیدن برای جابجایی' : 'Tap for AI Chat · Drag to move'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setCollapsed(false);
                    setOpen(true);
                  }
                }}
              >
                <img className="dz-glass" src={LIQUID_ORB_LOGO_DATA_URI} alt="" draggable={false} />
                <span className="dz-top" />
                <span className="dz-sheen" />
              </button>

              <span className="dz-ai" aria-hidden="true">
                <svg className="dz-bot" viewBox="0 0 24 24">
                  <defs>
                    <linearGradient id="dzRb" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#4f8dff" />
                      <stop offset="1" stopColor="#1a43c8" />
                    </linearGradient>
                  </defs>
                  <circle className="dz-ant" cx="12" cy="2.6" r="1.5" fill="#10b981" />
                  <path d="M12 4v2.4" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
                  <rect x="1.6" y="10" width="2.4" height="5.4" rx="1.2" fill="#2f5fe0" />
                  <rect x="20" y="10" width="2.4" height="5.4" rx="1.2" fill="#2f5fe0" />
                  <rect x="4" y="6" width="16" height="13" rx="5" fill="url(#dzRb)" />
                  <rect x="6" y="8" width="12" height="8.6" rx="3.6" fill="#0b1f6e" fillOpacity=".55" />
                  <circle className="dz-eye" cx="9.6" cy="12.2" r="1.7" fill="#7dffd0" />
                  <circle className="dz-eye" cx="14.4" cy="12.2" r="1.7" fill="#7dffd0" />
                  <path d="M10.2 15.2q1.8 1.1 3.6 0" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".9" />
                  <path d="M6.2 7.6q2-1.1 5-1" fill="none" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".45" />
                </svg>
                <svg className="dz-spark" viewBox="0 0 24 24">
                  <defs>
                    <linearGradient id="dzSp" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#7dffd0" />
                      <stop offset="1" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                  <path fill="url(#dzSp)" d="M12 1c.8 6 3 9.2 11 11-8 1.8-10.2 5-11 11-.8-6-3-9.2-11-11 8-1.8 10.2-5 11-11z" />
                </svg>
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
}

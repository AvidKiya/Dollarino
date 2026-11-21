import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Eye,
  ImagePlus,
  Loader2,
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
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/20 text-dim">
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
          {isFa ? '📈 باز کردن در ترمینال معاملاتی' : 'Open Symbol in Terminal'}
        </button>
      )}
    </div>
  );
}

export function DedicatedAiChatSurface({
  lang,
  compact = false,
  onNavigate,
  onSelectSymbolForTerminal,
  onExpandFullScreen,
  onCloseFloating,
}: {
  lang: Lang;
  compact?: boolean;
  onNavigate?: (tab: NavTab) => void;
  onSelectSymbolForTerminal?: (symbol: string) => void;
  onExpandFullScreen?: () => void;
  onCloseFloating?: () => void;
}) {
  const isFa = lang === 'fa';
  const [models, setModels] = useState<SelectableAIModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
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
      const [mRes, sRes] = await Promise.all([
        apiFetch<{ models: SelectableAIModel[]; selectedModelId: string; creator?: CreatorInfo }>(
          '/api/ai-assistant/models'
        ),
        apiFetch<{ sessions: AiChatSessionItem[] }>('/api/ai-assistant/sessions'),
      ]);
      setModels(mRes.models || []);
      setSelectedModelId(mRes.selectedModelId || mRes.models?.[0]?.id || '');
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
      // silent if unauthenticated
    } finally {
      setLoadingSessions(false);
    }
  }, [activeSessionId]);

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
        ? '📊 لطفاً این تصویر چارت را تحلیل کن و ستاپ معاملاتی بده.'
        : '📊 Please analyze this chart screenshot and suggest a trading setup.');

    const optimisticUserMsg: AiChatMessageItem = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content: optimisticText,
      hasImage: Boolean(attachedImg),
      previewImageUrl: attachedImg || undefined,
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    if (!overrideText) setInput('');
    setPendingImage(null);
    setSending(true);
    setErrorMsg(null);

    try {
      const res = await apiFetch<{
        sessionId: string;
        reply: string;
        modelId: string;
        modelLabel: string;
        usedVision: boolean;
        visionFallbackNotice?: string;
        setup: ExtractedChartSetup | null;
      }>('/api/ai-assistant/chat', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeSessionId,
          modelId: selectedModelId || undefined,
          message: cleanText,
          imageDataUrl: attachedImg,
        }),
      });

      if (!activeSessionId || activeSessionId !== res.sessionId) {
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
          content: res.visionFallbackNotice ? `ℹ️ ${res.visionFallbackNotice}\n\n${res.reply}` : res.reply,
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
        '📊 تحلیل روند بیت‌کوین و ستاپ معاملاتی امروز',
        '🧠 کد Pine Script برای استراتژی EMA + RSI بنویس',
        '🛡 با سرمایه ۵۰۰ دلار و ریسک ۲٪ چطور حجم بگیرم؟',
        '👨‍💻 دلارینو و سازنده‌اش آوید کیا را معرفی کن',
      ]
    : [
        '📊 BTC trend & intraday trade setup',
        '🧠 Write an EMA + RSI Pine Script strategy',
        '🛡 Position sizing with $500 & 2% risk',
        '👨‍💻 Who built Dollarino?',
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
      {!compact && (
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
                {isFa ? 'عکس چارت را همین‌جا رها کنید 📸' : 'Drop chart image here 📸'}
              </p>
            </div>
          </div>
        )}

        {/* Top Header + Model Selector */}
        <div className="px-3.5 py-2.5 border-b hairline flex flex-wrap items-center justify-between gap-2 bg-[var(--soft)]/60 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-amber-400 grid place-items-center text-white shrink-0 shadow">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-display font-bold text-xs sm:text-sm text-main truncate">
                  {isFa ? 'هوش مصنوعی اختصاصی دلارینو' : 'Dollarino Dedicated AI'}
                </h3>
                {activeModel?.supportsVision && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                    <Eye className="w-2.5 h-2.5" />
                    Vision
                  </span>
                )}
              </div>
              <p className="text-[10px] text-dim truncate">
                {isFa
                  ? `چت عمومی + تحلیل عکس چارت + ستاپ · سازنده: ${creator.nameFa} (${creator.telegram})`
                  : `Chat & Chart Vision AI · Creator: ${creator.nameEn}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {models.length > 0 && (
              <select
                value={selectedModelId}
                onChange={(e) => void handleModelChange(e.target.value)}
                aria-label={isFa ? 'انتخاب مدل هوش مصنوعی' : 'Select AI Model'}
                className="input-field !py-1.5 !px-2.5 !text-[11px] font-bold max-w-[185px] sm:max-w-[230px]"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.supportsVision ? '👁️ ' : '💬 '}
                    {m.label}
                  </option>
                ))}
              </select>
            )}

            {compact && (
              <button
                type="button"
                onClick={() => void startNewChat()}
                title={isFa ? 'گفتگوی جدید' : 'New chat'}
                className="h-8 w-8 rounded-xl btn-ghost grid place-items-center"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
              </button>
            )}

            {onExpandFullScreen && (
              <button
                type="button"
                onClick={onExpandFullScreen}
                title={isFa ? 'باز کردن صفحه کامل چت' : 'Open Full AI Page'}
                className="h-8 w-8 rounded-xl btn-ghost grid place-items-center"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}

            {onCloseFloating && (
              <button
                type="button"
                onClick={onCloseFloating}
                title={isFa ? 'بستن' : 'Close'}
                className="h-8 w-8 rounded-xl btn-ghost grid place-items-center"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-6 px-3 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-amber-500/20 border hairline grid place-items-center">
                <Sparkles className="w-6 h-6 text-[var(--gold)]" />
              </div>
              <div className="space-y-1 max-w-md">
                <h4 className="font-display font-bold text-sm sm:text-base text-main">
                  {isFa ? 'سلام! من هوش مصنوعی اختصاصی دلارینو هستم' : 'Hello! I am Dollarino Dedicated AI'}
                </h4>
                <p className="text-[11px] sm:text-xs text-dim leading-relaxed">
                  {isFa
                    ? `مثل یک هوش مصنوعی کامل هر سوالی داری بپرس، مدل دلخواهت را از بالا انتخاب کن، یا اسکرین‌شات چارت را اینجا بفرست/Paste کن تا تحلیل و ستاپ دقیق (Entry / SL / TP1-3) بدهم.`
                    : 'Ask anything, switch between connected AI models above, or drop/paste a chart screenshot for full technical analysis and trade setup.'}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-xl">
                {quickStarters.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendMessage(q)}
                    className="surface-soft hover:brightness-95 transition text-start px-3 py-2.5 rounded-2xl text-[11px] font-bold text-sub border hairline"
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
                  className={`max-w-[90%] sm:max-w-[82%] rounded-2xl px-3.5 py-2.5 ${
                    m.role === 'user'
                      ? 'bg-[var(--cobalt)] text-white rounded-ee-sm'
                      : 'surface-soft border hairline text-sub rounded-es-sm'
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
                    <div className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-black/20 mb-1.5">
                      <ImagePlus className="w-3 h-3" />
                      <span>{isFa ? 'تصویر چارت پیوست شد' : 'Chart image attached'}</span>
                    </div>
                  )}

                  {m.role === 'assistant' && m.modelLabel && (
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--gold)] mb-1">
                      <Bot className="w-3 h-3" />
                      <span>{m.modelLabel}</span>
                      {m.usedVision && <span>· 👁️ Vision</span>}
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
                        onNavigate
                          ? (sym) => {
                              const clean = sym.endsWith('USDT') ? sym : `${sym}USDT`;
                              onSelectSymbolForTerminal?.(clean);
                              onNavigate('terminal');
                              onCloseFloating?.();
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
              <div className="surface-soft border hairline rounded-2xl px-3.5 py-2.5 flex items-center gap-2 text-xs text-dim">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--gold)]" />
                <span>{isFa ? 'هوش مصنوعی در حال تحلیل و نوشتن پاسخ...' : 'Thinking...'}</span>
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

        {/* Composer + Chart Upload/Paste */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
          className="p-3 border-t hairline bg-[var(--soft)]/40 space-y-2 shrink-0"
        >
          {pendingImage && (
            <div className="flex items-center gap-3 p-2 rounded-2xl surface-soft border hairline">
              <img src={pendingImage} alt="Preview" className="h-14 w-20 object-cover rounded-xl border hairline" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-main">
                  {isFa ? '📸 عکس چارت آماده ارسال برای تحلیل AI' : '📸 Chart ready for AI analysis'}
                </p>
                <p className="text-[10px] text-dim">
                  {isFa ? 'می‌توانید سوال اضافه بنویسید یا مستقیم ارسال کنید.' : 'Add prompt or send directly.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                className="h-7 w-7 rounded-full btn-ghost grid place-items-center text-rose-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
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
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title={isFa ? 'آپلود عکس چارت' : 'Upload chart image'}
              className="h-10 w-10 shrink-0 rounded-2xl btn-ghost border hairline grid place-items-center hover:border-[var(--gold)] transition"
            >
              <ImagePlus className="w-4 h-4 text-[var(--gold)]" />
            </button>

            <textarea
              rows={compact ? 1 : 2}
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
                  ? 'پیام بنویس یا عکس چارت را اینجا Paste/آپلود کن...'
                  : 'Ask anything or paste/upload a chart image...'
              }
              className="input-field flex-1 !py-2.5 !px-3.5 text-xs sm:text-sm resize-none max-h-32"
            />

            <button
              type="submit"
              disabled={sending || (!input.trim() && !pendingImage)}
              className="h-10 px-4 shrink-0 rounded-2xl btn-cobalt font-black text-xs inline-flex items-center gap-1.5 disabled:opacity-45"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {!compact && <span>{isFa ? 'ارسال' : 'Send'}</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
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

  // Hide floating launcher when user is already inside the dedicated full-page AI Chat view
  if (authenticated && activeTab === 'aichat') return null;

  return (
    <>
      {open && (
        <div
          dir={isFa ? 'rtl' : 'ltr'}
          className="fixed bottom-24 lg:bottom-20 end-3 sm:end-6 z-[180] w-[calc(100vw-1.5rem)] sm:w-[430px] h-[540px] max-h-[76vh] panel rounded-[28px] shadow-2xl border border-[var(--glass-border)] overflow-hidden flex flex-col pop-in"
        >
          {authenticated ? (
            <DedicatedAiChatSurface
              lang={lang}
              compact
              onNavigate={onNavigate}
              onSelectSymbolForTerminal={onSelectSymbolForTerminal}
              onExpandFullScreen={
                onNavigate
                  ? () => {
                      setOpen(false);
                      onNavigate('aichat');
                    }
                  : undefined
              }
              onCloseFloating={() => setOpen(false)}
            />
          ) : (
            <div className="p-5 flex flex-col justify-between h-full space-y-4">
              <div className="flex items-center justify-between border-b hairline pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-amber-400 grid place-items-center text-white">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-sm text-main">
                      {isFa ? 'هوش مصنوعی اختصاصی دلارینو' : 'Dollarino Dedicated AI'}
                    </h4>
                    <p className="text-[10px] text-dim">
                      {isFa ? 'تحلیل چارت + انتخاب مدل + گفتگو' : 'Chart Vision + Multi-Model Chat'}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="h-8 w-8 rounded-full btn-ghost grid place-items-center">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs text-sub leading-relaxed flex-1 overflow-y-auto">
                <div className="surface-soft rounded-2xl p-3.5 space-y-2 border hairline">
                  <p className="font-bold text-main">
                    {isFa
                      ? '✨ آماده پاسخ‌گویی به هر سوال و تحلیل عکس چارت شما!'
                      : '✨ Ready for free-form chat & chart screenshot analysis!'}
                  </p>
                  <p className="text-dim">
                    {isFa
                      ? 'وارد حساب کاربری شوید (یا در ربات تلگرام @Dollarino_bot پیام دهید) تا بین مدل‌های متصل انتخاب کنید، عکس چارت بفرستید و ستاپ کامل با Entry / SL / TP1-3 بگیرید.'
                      : 'Sign in or open @Dollarino_bot on Telegram to switch AI models, upload chart screenshots, and get Entry/SL/3-TP setups.'}
                  </p>
                </div>

                <div className="surface-soft rounded-2xl p-3.5 space-y-1.5 border hairline text-[11px]">
                  <p className="font-black text-main">
                    {isFa ? '👨‍💻 سازنده و طراح پروژه: آوید کیا (Avid Kiya)' : '👨‍💻 Creator: Avid Kiya'}
                  </p>
                  <div className="flex flex-wrap gap-3 text-dim" dir="ltr">
                    <a href="https://t.me/avidkiya" target="_blank" rel="noreferrer" className="underline hover:text-main">
                      Telegram: @avidkiya
                    </a>
                    <a href="https://instagram.com/avid_kiya" target="_blank" rel="noreferrer" className="underline hover:text-main">
                      IG: @avid_kiya
                    </a>
                    <a href="https://x.com/avid_kiya" target="_blank" rel="noreferrer" className="underline hover:text-main">
                      X: @avid_kiya
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                {onGoAuth && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onGoAuth();
                    }}
                    className="btn-cobalt flex-1 py-3 rounded-2xl text-xs font-black"
                  >
                    {isFa ? 'ورود / شروع چت با AI' : 'Sign In & Open AI'}
                  </button>
                )}
                <a
                  href="https://t.me/Dollarino_bot"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-emerald px-4 py-3 rounded-2xl text-xs font-black text-center"
                >
                  {isFa ? 'ربات تلگرام' : 'Telegram Bot'}
                </a>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={isFa ? 'هوش مصنوعی شناور دلارینو' : 'Floating Dollarino AI'}
        className="fixed bottom-24 lg:bottom-6 end-3 sm:end-6 z-[175] h-12 px-4 rounded-full bg-gradient-to-r from-indigo-600 via-blue-600 to-amber-500 text-white shadow-xl hover:scale-[1.03] active:scale-[0.98] transition flex items-center gap-2 border border-white/25"
      >
        <Sparkles className="w-4 h-4 shrink-0" />
        <span className="text-xs font-black whitespace-nowrap">
          {open ? (isFa ? 'بستن چت AI' : 'Close AI') : isFa ? 'چت هوش مصنوعی AI' : 'Dollarino AI'}
        </span>
      </button>
    </>
  );
}

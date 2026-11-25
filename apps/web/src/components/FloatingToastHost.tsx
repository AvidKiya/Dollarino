import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { tgHaptic } from '../lib/telegram';
import {
  subscribeFloatingToasts,
  type FloatingToastPayload,
  type FloatingToastVariant,
} from '../lib/toast';

interface ToastRecord extends FloatingToastPayload {
  closing?: boolean;
  swipeDir?: 'up' | 'left' | 'right';
}

const VARIANT_STYLES: Record<
  FloatingToastVariant,
  { border: string; accent: string; bar: string; iconBg: string }
> = {
  success: {
    border: 'border-emerald-400/40',
    accent: 'text-emerald-300',
    bar: 'bg-emerald-400',
    iconBg: 'bg-emerald-500/20 text-emerald-300',
  },
  error: {
    border: 'border-rose-400/45',
    accent: 'text-rose-300',
    bar: 'bg-rose-400',
    iconBg: 'bg-rose-500/20 text-rose-300',
  },
  warn: {
    border: 'border-amber-400/45',
    accent: 'text-amber-300',
    bar: 'bg-amber-400',
    iconBg: 'bg-amber-500/20 text-amber-300',
  },
  info: {
    border: 'border-sky-400/40',
    accent: 'text-sky-300',
    bar: 'bg-sky-400',
    iconBg: 'bg-sky-500/20 text-sky-300',
  },
};

function ToastIcon({ variant }: { variant: FloatingToastVariant }) {
  if (variant === 'error') return <XCircle className="w-4 h-4" />;
  if (variant === 'warn') return <AlertTriangle className="w-4 h-4" />;
  if (variant === 'info') return <Info className="w-4 h-4" />;
  return <CheckCircle2 className="w-4 h-4" />;
}

function ToastSubtitleItem({
  item,
  onRemove,
}: {
  item: ToastRecord;
  onRemove: (id: string, swipeDir?: 'up' | 'left' | 'right') => void;
}) {
  const [entered, setEntered] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const remainingRef = useRef<number>(item.durationMs);
  const lastStartRef = useRef<number>(Date.now());
  const style = VARIANT_STYLES[item.variant];

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (item.closing || paused || dragging) return;
    lastStartRef.current = Date.now();
    const timer = setTimeout(() => {
      onRemove(item.id);
    }, Math.max(250, remainingRef.current));
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - lastStartRef.current));
    };
  }, [item.id, item.closing, paused, dragging, onRemove]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const rawDy = e.clientY - startRef.current.y;
    const dy = rawDy > 0 ? rawDy * 0.25 : rawDy; // resist downward drag, allow smooth upward swipe
    setDragOffset({ x: dx, y: dy });
  };

  const finishDrag = () => {
    if (!startRef.current) return;
    const { x, y } = dragOffset;
    startRef.current = null;
    setDragging(false);

    if (y < -22) {
      tgHaptic('light');
      onRemove(item.id, 'up');
      return;
    }
    if (Math.abs(x) > 46) {
      tgHaptic('light');
      onRemove(item.id, x > 0 ? 'right' : 'left');
      return;
    }
    setDragOffset({ x: 0, y: 0 });
  };

  let transformStr = `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`;
  let opacity = 1;

  if (!entered) {
    transformStr = 'translate3d(0, -18px, 0) scale(0.95)';
    opacity = 0;
  } else if (item.closing) {
    if (item.swipeDir === 'left') transformStr = 'translate3d(-120px, 0, 0) scale(0.94)';
    else if (item.swipeDir === 'right') transformStr = 'translate3d(120px, 0, 0) scale(0.94)';
    else transformStr = 'translate3d(0, -24px, 0) scale(0.94)';
    opacity = 0;
  } else if (dragging) {
    const dist = Math.max(Math.abs(dragOffset.x) / 110, Math.abs(Math.min(0, dragOffset.y)) / 70);
    opacity = Math.max(0.28, 1 - dist * 0.65);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="floating-toast-item"
      data-toast-variant={item.variant}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => {
        setPaused(false);
        if (dragging) finishDrag();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        transform: transformStr,
        opacity,
        backgroundColor: 'rgba(8, 14, 34, 0.92)',
        transition: dragging
          ? 'none'
          : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease',
      }}
      className={`pointer-events-auto touch-none select-none cursor-grab active:cursor-grabbing w-full rounded-2xl border ${style.border} bg-slate-950/95 text-white backdrop-blur-xl shadow-[0_14px_38px_rgba(2,6,23,0.48)] overflow-hidden`}
    >
      {/* Subtle swipe pill handle */}
      <div className="pt-1.5 pb-0.5 flex justify-center">
        <span className="h-1 w-8 rounded-full bg-white/25" />
      </div>

      <div className="px-3.5 pb-2.5 pt-0.5 flex items-center gap-2.5 text-xs font-extrabold leading-relaxed">
        <span className={`h-7 w-7 rounded-xl grid place-items-center shrink-0 ${style.iconBg}`}>
          <ToastIcon variant={item.variant} />
        </span>

        <span className="flex-1 min-w-0 break-words">{item.text}</span>

        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onRemove(item.id, 'up');
            }}
            className="px-2.5 py-1 rounded-lg bg-[#0D47A1] hover:bg-[#1565C0] text-white text-[11px] font-black shrink-0 transition"
          >
            {item.action.label}
          </button>
        )}

        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onRemove(item.id, 'up')}
          className="h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white/75 hover:text-white shrink-0 transition"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Subtle auto-fade timer line */}
      <div className="h-[2px] w-full bg-white/10 overflow-hidden">
        <div
          className={`h-full ${style.bar}`}
          style={{
            animationName: 'dollarinoToastProgress',
            animationDuration: `${item.durationMs}ms`,
            animationTimingFunction: 'linear',
            animationFillMode: 'forwards',
            animationPlayState: paused || dragging || item.closing ? 'paused' : 'running',
          }}
        />
      </div>
    </div>
  );
}

export function FloatingToastHost({ dir = 'rtl' }: { dir?: 'rtl' | 'ltr' }) {
  const [items, setItems] = useState<ToastRecord[]>([]);

  const removeItem = useCallback((id: string, swipeDir?: 'up' | 'left' | 'right') => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, closing: true, swipeDir } : it)));
    setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.id !== id));
    }, 260);
  }, []);

  useEffect(() => {
    return subscribeFloatingToasts(
      (payload) => {
        setItems((prev) => {
          const withoutSameText = prev.filter((x) => !x.closing && x.text !== payload.text);
          return [payload, ...withoutSameText].slice(0, 3);
        });
      },
      (id) => removeItem(id)
    );
  }, [removeItem]);

  if (typeof document === 'undefined' || items.length === 0) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes dollarinoToastProgress {
          from { transform: scaleX(1); transform-origin: right; }
          to { transform: scaleX(0); transform-origin: right; }
        }
      `}</style>
      <div
        dir={dir}
        data-testid="floating-toast-host"
        className="fixed top-[max(12px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[9999] w-[min(92vw,440px)] flex flex-col items-center gap-2 pointer-events-none"
      >
        {items.map((item) => (
          <ToastSubtitleItem key={item.id} item={item} onRemove={removeItem} />
        ))}
      </div>
    </>,
    document.body
  );
}

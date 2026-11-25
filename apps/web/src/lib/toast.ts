export type FloatingToastVariant = 'success' | 'error' | 'warn' | 'info';

export interface FloatingToastAction {
  label: string;
  onClick: () => void;
}

export interface FloatingToastPayload {
  id: string;
  text: string;
  variant: FloatingToastVariant;
  durationMs: number;
  action?: FloatingToastAction;
  createdAt: number;
}

type Listener = (toast: FloatingToastPayload) => void;
type DismissListener = (id: string) => void;

const listeners = new Set<Listener>();
const dismissListeners = new Set<DismissListener>();
let seq = 0;

export function subscribeFloatingToasts(onPush: Listener, onDismiss: DismissListener): () => void {
  listeners.add(onPush);
  dismissListeners.add(onDismiss);
  return () => {
    listeners.delete(onPush);
    dismissListeners.delete(onDismiss);
  };
}

export function pushFloatingToast(
  text: string,
  variant: FloatingToastVariant = 'success',
  durationMs?: number,
  action?: FloatingToastAction
): string {
  const clean = String(text || '').trim();
  if (!clean) return '';
  const id = `ft_${Date.now()}_${++seq}`;
  const defaultDuration = variant === 'error' ? 5200 : variant === 'warn' ? 4600 : 4000;
  const payload: FloatingToastPayload = {
    id,
    text: clean,
    variant,
    durationMs: durationMs ?? defaultDuration,
    action,
    createdAt: Date.now(),
  };
  for (const fn of listeners) fn(payload);
  return id;
}

export function dismissFloatingToast(id: string): void {
  for (const fn of dismissListeners) fn(id);
}

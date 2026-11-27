import { APP_VERSION } from './version';

const TOKEN_KEY = 'dollarino_token';
const API_BASE_STORAGE_KEY = 'dollarino_api_base';
const ENV_API_BASE = ((import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE || '').replace(/\/+$/, '');
const DEFAULT_CLOUDFLARE_BACKEND = 'https://dollarino.pages.dev';
let memoryToken: string | null = null;

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const bridgeBase = (window as unknown as { DollarinoNative?: { getApiBase?: () => string } }).DollarinoNative?.getApiBase?.();
    if (bridgeBase && /^https?:\/\//i.test(bridgeBase)) {
      return bridgeBase.replace(/\/+$/, '');
    }
    try {
      const override = (localStorage.getItem(API_BASE_STORAGE_KEY) || '').trim();
      if (override && /^https?:\/\//i.test(override)) {
        return override.replace(/\/+$/, '');
      }
    } catch {
      /* ignore */
    }
    if (ENV_API_BASE) return ENV_API_BASE;
    if (
      window.location.hostname === 'appassets.dollarino.local' ||
      Boolean((window as unknown as { DollarinoNative?: unknown }).DollarinoNative)
    ) {
      return DEFAULT_CLOUDFLARE_BACKEND;
    }
  }
  return ENV_API_BASE;
}

export function getStoredToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) memoryToken = saved;
    return saved;
  } catch {
    return memoryToken;
  }
}

export function setStoredToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Restricted iframe storage fallback uses memoryToken
  }
  if (typeof window !== 'undefined') {
    const bridge = (window as unknown as {
      DollarinoNative?: {
        setAuthSession?: (tok: string, apiBase: string, uid: string, uname: string) => void;
        clearAuthSession?: () => void;
      };
    }).DollarinoNative;
    if (bridge) {
      try {
        if (token) bridge.setAuthSession?.(token, getApiBase(), '', '');
        else bridge.clearAuthSession?.();
      } catch {
        /* ignore */
      }
    }
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) {
    if (!headers.Authorization) headers.Authorization = `Bearer ${token}`;
    headers['X-Dollarino-Token'] = token;
  }

  const targetUrl = path.startsWith('http') ? path : `${getApiBase()}${path}`;
  const res = await fetch(targetUrl, {
    ...init,
    credentials: 'include',
    headers,
  });

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    if (res.status === 404) {
      throw new ApiError(
        'سرویس API متصل نیست (404). لطفاً صفحه را رفرش کنید یا مطمئن شوید Worker دلارینو متصل است.',
        404,
        'API_UNREACHABLE'
      );
    }
    throw new ApiError(`Server error (${res.status}): ${text.slice(0, 120)}`, res.status);
  }

  if (!res.ok) {
    const errObj = json as {
      error?: string;
      code?: string;
      workerVersion?: string;
      hint?: string;
      maintenance?: {
        enabled?: boolean;
        titleFa?: string;
        titleEn?: string;
        messageFa?: string;
        messageEn?: string;
        eta?: string;
      };
    };
    const rawMsg = errObj.error || `HTTP ${res.status}`;
    if (res.status === 503 && errObj.code === 'SITE_MAINTENANCE') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('dollarino:site-maintenance', {
            detail: {
              maintenance: true,
              titleFa: errObj.maintenance?.titleFa,
              titleEn: errObj.maintenance?.titleEn,
              messageFa: errObj.maintenance?.messageFa,
              messageEn: errObj.maintenance?.messageEn,
              eta: errObj.maintenance?.eta,
            },
          })
        );
      }
      throw new ApiError(rawMsg, 503, 'SITE_MAINTENANCE');
    }
    if (res.status === 404 && /route not found/i.test(rawMsg)) {
      const serverBuild = errObj.workerVersion ? ` نسخه سرور: ${errObj.workerVersion} / نسخه رابط کاربری: ${APP_VERSION}.` : '';
      throw new ApiError(
        `${rawMsg} — نسخه Worker سرور با رابط کاربری هماهنگ نیست.${serverBuild} برای رفع: npx wrangler d1 migrations apply dollarino-db --remote && npx wrangler deploy`,
        res.status,
        errObj.code || 'WORKER_OUTDATED'
      );
    }
    throw new ApiError(rawMsg, res.status, errObj.code);
  }
  return json as T;
}

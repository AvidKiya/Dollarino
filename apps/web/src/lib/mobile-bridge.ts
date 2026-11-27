import { apiFetch, getApiBase, getStoredToken, setStoredToken } from './api';
import { pushFloatingToast } from './toast';
import type { NavTab } from './types';

export interface DollarinoNativeBridgeApi {
  getBridgeInfo?: () => string;
  getApiBase?: () => string;
  setApiBase?: (url: string) => void;
  setAuthSession?: (token: string, apiBase: string, userId: string, username: string) => void;
  clearAuthSession?: () => void;
  haptic?: (style: string) => void;
  openExternalUrl?: (url: string) => void;
  requestNotificationPermission?: () => void;
  syncNotificationsNow?: () => void;
  copyText?: (text: string) => void;
  shareText?: (title: string, text: string) => void;
  setStatusBarStyle?: (isDark: boolean) => void;
}

export interface AndroidBridgeInfo {
  platform: 'android';
  versionName: string;
  versionCode: number;
  deviceId: string;
  apiBase: string;
  deviceModel?: string;
  osVersion?: string;
  hasNotificationPermission?: boolean;
  fcmToken?: string | null;
}

declare global {
  interface Window {
    DollarinoNative?: DollarinoNativeBridgeApi;
    __dollarinoHandleAndroidBack?: () => boolean;
    __dollarinoHandleAndroidAuth?: (paramsJson: string) => void;
    __dollarinoHandleAndroidDeepLink?: (deepLink: string) => void;
    __dollarinoReceiveAndroidNotifications?: (itemsJson: string) => void;
  }
}

export function getNativeBridge(): DollarinoNativeBridgeApi | null {
  if (typeof window === 'undefined') return null;
  return window.DollarinoNative ?? null;
}

export function isAndroidNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.DollarinoNative) return true;
  if (window.location.hostname === 'appassets.dollarino.local') return true;
  return /DollarinoAndroid/i.test(navigator.userAgent || '');
}

export function getAndroidBridgeInfo(): AndroidBridgeInfo | null {
  const bridge = getNativeBridge();
  if (!bridge?.getBridgeInfo) return null;
  try {
    const raw = bridge.getBridgeInfo();
    return raw ? (JSON.parse(raw) as AndroidBridgeInfo) : null;
  } catch {
    return null;
  }
}

export function triggerNativeHaptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light'): void {
  const bridge = getNativeBridge();
  if (bridge?.haptic) {
    try {
      bridge.haptic(style);
      return;
    } catch {
      /* ignore */
    }
  }
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(style === 'heavy' || style === 'error' ? 28 : style === 'success' ? [12, 30, 14] : 10);
    }
  } catch {
    /* ignore */
  }
}

export function openNativeOrBrowserUrl(url: string): boolean {
  if (typeof window === 'undefined' || !url) return false;
  const bridge = getNativeBridge();
  if (bridge?.openExternalUrl) {
    try {
      bridge.openExternalUrl(url);
      return true;
    } catch {
      /* fallback below */
    }
  }
  return false;
}

export function syncNativeAuthSession(user?: { id?: string; username?: string } | null): void {
  const bridge = getNativeBridge();
  if (!bridge) return;
  const token = getStoredToken();
  const apiBase = getApiBase();
  try {
    if (token) {
      bridge.setAuthSession?.(token, apiBase, user?.id || '', user?.username || '');
    } else {
      bridge.clearAuthSession?.();
    }
  } catch {
    /* ignore */
  }
}

export async function registerAndroidDeviceWithBackend(channels?: Record<string, boolean>): Promise<boolean> {
  if (!isAndroidNativeApp() || !getStoredToken()) return false;
  const info = getAndroidBridgeInfo();
  const deviceId = info?.deviceId || (() => {
    try {
      let id = localStorage.getItem('dollarino_android_device_id');
      if (!id) {
        id = `andr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem('dollarino_android_device_id', id);
      }
      return id;
    } catch {
      return `andr_${Date.now().toString(36)}`;
    }
  })();

  try {
    await apiFetch('/api/mobile/devices/register', {
      method: 'POST',
      body: JSON.stringify({
        deviceId,
        platform: 'android',
        fcmToken: info?.fcmToken || null,
        appVersion: info?.versionName || '11.7.2',
        appBuild: info?.versionCode || 110702,
        deviceModel: info?.deviceModel || 'Android Device',
        osVersion: info?.osVersion || 'Android',
        locale: localStorage.getItem('dollarino_lang') === 'en' ? 'en' : 'fa',
        channels,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendAndroidTestNotification(): Promise<{ ok: boolean; error?: string }> {
  try {
    await registerAndroidDeviceWithBackend();
    await apiFetch('/api/mobile/notifications/test', { method: 'POST', body: '{}' });
    getNativeBridge()?.syncNotificationsNow?.();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Test failed' };
  }
}

export function parseDollarinoDeepLinkTab(rawLink: string): NavTab | null {
  try {
    const clean = (rawLink || '').trim();
    if (!clean) return null;
    const url = new URL(clean.replace(/^dollarino:\/\//, 'https://dollarino.local/'));
    const tab = (url.searchParams.get('tab') || '').toLowerCase();
    const map: Record<string, NavTab> = {
      dashboard: 'overview',
      overview: 'overview',
      positions: 'portfolio',
      portfolio: 'portfolio',
      signals: 'radar',
      radar: 'radar',
      sniper: 'copy',
      copy: 'copy',
      treasury: 'pricing',
      pricing: 'pricing',
      security: 'services',
      services: 'services',
      dex: 'dex',
      markets: 'markets',
      terminal: 'terminal',
      ai: 'aichat',
      aichat: 'aichat',
    };
    return map[tab] || null;
  } catch {
    return null;
  }
}

let foregroundPollerStarted = false;

export function startAndroidForegroundNotificationLoop(onNavigateTab?: (tab: NavTab) => void): () => void {
  if (typeof window === 'undefined' || !isAndroidNativeApp()) return () => {};

  window.__dollarinoHandleAndroidDeepLink = (deepLink: string) => {
    const tab = parseDollarinoDeepLinkTab(deepLink);
    if (tab && onNavigateTab) {
      onNavigateTab(tab);
      triggerNativeHaptic('light');
    }
  };

  window.__dollarinoHandleAndroidAuth = (paramsJson: string) => {
    try {
      const data = JSON.parse(paramsJson) as { google_token?: string; google_2fa?: string; auth_error?: string; token?: string };
      const tok = data.google_token || data.token;
      if (tok) {
        setStoredToken(tok);
        syncNativeAuthSession();
        window.dispatchEvent(new CustomEvent('dollarino:auth-token-updated', { detail: { token: tok } }));
        return;
      }
      if (data.google_2fa) {
        window.dispatchEvent(new CustomEvent('dollarino:auth-2fa-required', { detail: { tempToken: data.google_2fa } }));
        return;
      }
      if (data.auth_error) {
        pushFloatingToast(`Google Auth: ${data.auth_error}`, 'error');
      }
    } catch {
      /* ignore */
    }
  };

  if (foregroundPollerStarted) return () => {};
  foregroundPollerStarted = true;

  let lastCursor = '';
  const poll = async () => {
    if (!getStoredToken() || document.visibilityState !== 'visible') return;
    try {
      const qs = lastCursor ? `?since=${encodeURIComponent(lastCursor)}&limit=10` : '?limit=10';
      const feed = await apiFetch<{
        items?: Array<{ id: string; title: string; body: string; deepLink?: string; category?: string; createdAt?: string; read?: boolean }>;
        cursor?: string;
      }>(`/api/mobile/notifications/feed${qs}`);
      if (feed.cursor) lastCursor = feed.cursor;
      const items = feed.items || [];
      if (lastCursor && items.length > 0 && !items[0]?.read) {
        const latest = items[0]!;
        // Show in-app toast only for fresh live arrivals; native bridge sync handles OS tray notifications
        if (latest.createdAt && Date.now() - Date.parse(latest.createdAt.replace(' ', 'T') + 'Z') < 65_000) {
          pushFloatingToast(
            `${latest.title}: ${latest.body}`,
            latest.category === 'SECURITY' ? 'warn' : 'success'
          );
          triggerNativeHaptic('medium');
        }
      }
    } catch {
      /* ignore transient offline */
    }
  };

  const timer = window.setInterval(poll, 45_000);
  return () => {
    window.clearInterval(timer);
    foregroundPollerStarted = false;
  };
}

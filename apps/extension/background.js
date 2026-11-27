const DEFAULT_BASE = 'https://dollarino.pages.dev';
const ext = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;

function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      if (!ext?.storage?.local) return resolve({});
      if (ext.storage.local.get.length <= 1) {
        Promise.resolve(ext.storage.local.get(keys)).then(resolve).catch(() => resolve({}));
      } else {
        ext.storage.local.get(keys, (res) => resolve(res || {}));
      }
    } catch {
      resolve({});
    }
  });
}

function setBadge(text, color) {
  try {
    const actionApi = ext?.action || ext?.browserAction;
    if (!actionApi) return;
    if (actionApi.setBadgeText) actionApi.setBadgeText({ text });
    if (actionApi.setBadgeBackgroundColor && color) actionApi.setBadgeBackgroundColor({ color });
  } catch {
    // ignore badge errors across browser versions
  }
}

function configureSidePanelBehavior() {
  try {
    if (typeof chrome !== 'undefined' && chrome.sidePanel?.setPanelBehavior) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
  } catch {
    // ignore on Firefox / legacy Chromium
  }
}

async function syncBadgeState() {
  try {
    const stored = await storageGet(['apiBase', 'extKey', 'authToken']);
    const base = (stored.apiBase || DEFAULT_BASE).replace(/\/$/, '');
    const headers = {};
    if (stored.authToken) {
      headers['Authorization'] = `Bearer ${stored.authToken}`;
    } else if (stored.extKey) {
      headers['X-Dollarino-Extension-Key'] = stored.extKey;
    } else {
      setBadge('', '#64748b');
      return;
    }

    const res = await fetch(`${base}/api/trading/dashboard?lite=1`, { headers });
    if (!res.ok) {
      setBadge('!', '#f59e0b');
      return;
    }
    const data = await res.json();
    const isRunning = data?.config?.bot_state?.startsWith?.('RUNNING');
    const openCount =
      (Array.isArray(data?.openTrades) ? data.openTrades.length : 0) +
      (Array.isArray(data?.openDexTrades) ? data.openDexTrades.length : 0) +
      (Array.isArray(data?.openCopyPositionsV2) ? data.openCopyPositionsV2.length : 0);
    if (isRunning) {
      setBadge(openCount > 0 ? String(openCount) : 'ON', '#10b981');
    } else {
      setBadge(openCount > 0 ? String(openCount) : 'OFF', '#64748b');
    }
  } catch {
    // silent when offline
  }
}

if (ext?.runtime?.onInstalled) {
  ext.runtime.onInstalled.addListener(() => {
    configureSidePanelBehavior();
    try {
      ext.alarms?.create?.('dollarino_badge_sync', { periodInMinutes: 1 });
    } catch { /* ignore */ }
    void syncBadgeState();
  });
}

if (ext?.runtime?.onStartup) {
  ext.runtime.onStartup.addListener(() => {
    configureSidePanelBehavior();
    void syncBadgeState();
  });
}

configureSidePanelBehavior();

if (ext?.action?.onClicked) {
  ext.action.onClicked.addListener(async (tab) => {
    try {
      // Chrome / Edge native sidePanel
      if (typeof chrome !== 'undefined' && chrome.sidePanel?.open && tab?.windowId !== undefined) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        return;
      }
      // Firefox native sidebar_action
      if (ext.sidebarAction?.open) {
        await ext.sidebarAction.open();
        return;
      }
      // Fallback tab
      if (ext.tabs?.create && ext.runtime?.getURL) {
        await ext.tabs.create({ url: ext.runtime.getURL('sidepanel.html') });
      }
    } catch {
      // ignore click fallback failures
    }
  });
}

if (ext?.alarms?.onAlarm) {
  ext.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dollarino_badge_sync') void syncBadgeState();
  });
}

if (ext?.runtime?.onMessage) {
  ext.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'SYNC_BADGE_NOW') {
      void syncBadgeState();
    }
  });
}

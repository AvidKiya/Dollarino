const DEFAULT_SITE_URL = 'https://dollarino.pages.dev';

function enableSidePanelOnClick() {
  try {
    if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
    if (chrome.sidePanel && typeof chrome.sidePanel.setOptions === 'function') {
      chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true }).catch(() => {});
    }
  } catch {
    // ignore on non-Chromium browsers
  }
}

enableSidePanelOnClick();

chrome.runtime.onStartup?.addListener(() => {
  enableSidePanelOnClick();
});

chrome.runtime.onInstalled.addListener(() => {
  enableSidePanelOnClick();
  chrome.alarms?.create?.('dollarino-badge-sync', { periodInMinutes: 1 });
  syncBadgeState();
});

chrome.action?.onClicked?.addListener(async (tab) => {
  try {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function' && tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch {
    // openPanelOnActionClick handles the action click on Chrome 116+
  }
});

chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === 'dollarino-badge-sync') {
    syncBadgeState();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'SYNC_BADGE') {
    syncBadgeState().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

async function syncBadgeState() {
  try {
    const cfg = await chrome.storage.local.get(['apiBase', 'siteOrigin', 'extKey']);
    const apiBase = (cfg.siteOrigin || cfg.apiBase || DEFAULT_SITE_URL).replace(/\/+$/, '');
    const extKey = (cfg.extKey || '').trim();
    if (!extKey) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    const res = await fetch(`${apiBase}/api/trading/overview?poll=1`, {
      headers: { 'X-Dollarino-Extension-Key': extKey },
    });
    if (!res.ok) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      return;
    }
    const data = await res.json();
    const state = data?.config?.bot_state || 'STOPPED';
    const isRunning = state === 'RUNNING_PAPER' || state === 'RUNNING_LIVE';
    const openCnt = Array.isArray(data?.openTrades) ? data.openTrades.length : 0;
    await chrome.action.setBadgeText({ text: isRunning ? (openCnt > 0 ? String(openCnt) : 'ON') : 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: isRunning ? '#059669' : '#64748b' });
  } catch {
    // ignore transient offline error
  }
}

const DEFAULT_SITE = 'https://dollarino.pages.dev';
const ext = typeof browser !== 'undefined' ? browser : typeof chrome !== 'undefined' ? chrome : null;

const frame = document.getElementById('sp-frame');
const loader = document.getElementById('sp-loader');
const reloadBtn = document.getElementById('sp-reload');
const openTabLink = document.getElementById('sp-open-tab');
const hostInput = document.getElementById('sp-host-input');
const hostSaveBtn = document.getElementById('sp-host-save');
const hostBar = document.getElementById('sp-host-bar');
const nativePane = document.getElementById('sp-native-pane');
const embedPane = document.getElementById('sp-embed-pane');
const modeNativeBtn = document.getElementById('sp-mode-native');
const modeEmbedBtn = document.getElementById('sp-mode-embed');

let currentView = 'native';

function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      if (ext?.storage?.local) {
        if (ext.storage.local.get.length <= 1) {
          Promise.resolve(ext.storage.local.get(keys)).then((r) => resolve(r || {})).catch(() => resolve({}));
        } else {
          ext.storage.local.get(keys, (res) => resolve(res || {}));
        }
        return;
      }
    } catch { /* fallback */ }
    const out = {};
    for (const k of keys) {
      const v = localStorage.getItem(`dlr_ext_store_${k}`);
      if (v !== null) out[k] = v;
    }
    resolve(out);
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    try {
      if (ext?.storage?.local) {
        if (ext.storage.local.set.length <= 1) {
          Promise.resolve(ext.storage.local.set(obj)).then(resolve).catch(resolve);
        } else {
          ext.storage.local.set(obj, resolve);
        }
        return;
      }
    } catch { /* fallback */ }
    for (const [k, v] of Object.entries(obj)) {
      localStorage.setItem(`dlr_ext_store_${k}`, String(v ?? ''));
    }
    resolve();
  });
}

function buildSimpleUrl(rawBase) {
  const clean = (rawBase || DEFAULT_SITE).trim().replace(/\/+$/, '');
  const u = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
  u.searchParams.set('ui_mode', 'simple');
  u.searchParams.set('embed', 'sidepanel');
  return u.toString();
}

function loadSite(rawBase) {
  try {
    const url = buildSimpleUrl(rawBase);
    if (loader) loader.classList.remove('hidden');
    if (frame) frame.src = url;
    if (openTabLink) openTabLink.href = url.replace('&embed=sidepanel', '');
    if (hostInput) hostInput.value = new URL(url).origin;
  } catch {
    if (loader) loader.classList.remove('hidden');
    if (frame) frame.src = buildSimpleUrl(DEFAULT_SITE);
  }
}

async function switchView(nextView) {
  currentView = nextView === 'embed' ? 'embed' : 'native';
  if (currentView === 'embed') {
    nativePane?.classList.add('hidden');
    embedPane?.classList.remove('hidden');
    hostBar?.classList.remove('hidden');
    modeNativeBtn?.classList.remove('active');
    modeEmbedBtn?.classList.add('active');
    if (frame && !frame.src) {
      const stored = await storageGet(['apiBase']);
      loadSite(stored.apiBase || DEFAULT_SITE);
    }
  } else {
    embedPane?.classList.add('hidden');
    hostBar?.classList.add('hidden');
    nativePane?.classList.remove('hidden');
    modeEmbedBtn?.classList.remove('active');
    modeNativeBtn?.classList.add('active');
  }
}

frame?.addEventListener('load', () => {
  loader?.classList.add('hidden');
});

modeNativeBtn?.addEventListener('click', () => {
  void switchView('native');
});

modeEmbedBtn?.addEventListener('click', () => {
  void switchView('embed');
});

reloadBtn?.addEventListener('click', () => {
  if (currentView === 'embed') {
    loadSite(hostInput?.value || DEFAULT_SITE);
  } else {
    document.querySelector('[data-action="refresh-all"]')?.click();
  }
});

hostSaveBtn?.addEventListener('click', async () => {
  try {
    const url = buildSimpleUrl(hostInput?.value || DEFAULT_SITE);
    const origin = new URL(url).origin;
    await storageSet({ apiBase: origin });
    loadSite(origin);
  } catch {
    loadSite(DEFAULT_SITE);
  }
});

void storageGet(['apiBase']).then((stored) => {
  const origin = stored.apiBase || DEFAULT_SITE;
  if (hostInput) hostInput.value = origin;
  if (openTabLink) openTabLink.href = `${origin.replace(/\/$/, '')}/?ui_mode=simple`;
});

const DEFAULT_SITE_URL = 'https://dollarino.pages.dev';

const frameEl = document.getElementById('simpleFrame');
const loadingEl = document.getElementById('loadingOverlay');
const errorEl = document.getElementById('errorBanner');
const errorDescEl = document.getElementById('errorDesc');
const settingsDrawer = document.getElementById('settingsDrawer');
const siteUrlInput = document.getElementById('siteUrlInput');

let currentBaseUrl = DEFAULT_SITE_URL;
let loadTimer = null;

function sanitizeBaseUrl(raw) {
  const cleaned = String(raw || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[a-zA-Z0-9._:-]+$/i.test(cleaned)) {
    return cleaned;
  }
  return DEFAULT_SITE_URL;
}

function buildSimpleModeUrl(base) {
  const url = new URL(base);
  url.searchParams.set('ui_mode', 'simple');
  url.searchParams.set('embed', 'sidepanel');
  return url.toString();
}

function loadSimpleFrame(baseUrl) {
  currentBaseUrl = sanitizeBaseUrl(baseUrl);
  if (siteUrlInput) siteUrlInput.value = currentBaseUrl;

  loadingEl?.classList.remove('hidden');
  errorEl?.classList.add('hidden');
  if (loadTimer) clearTimeout(loadTimer);

  loadTimer = setTimeout(() => {
    loadingEl?.classList.add('hidden');
  }, 9000);

  if (frameEl) {
    frameEl.src = buildSimpleModeUrl(currentBaseUrl);
  }
}

frameEl?.addEventListener('load', () => {
  if (loadTimer) clearTimeout(loadTimer);
  loadingEl?.classList.add('hidden');
  errorEl?.classList.add('hidden');
});

frameEl?.addEventListener('error', () => {
  if (loadTimer) clearTimeout(loadTimer);
  loadingEl?.classList.add('hidden');
  if (errorDescEl) {
    errorDescEl.textContent = `بارگذاری آدرس ${currentBaseUrl} ناموفق بود. اتصال اینترنت یا آدرس سرور را بررسی کنید.`;
  }
  errorEl?.classList.remove('hidden');
});

document.getElementById('btnReload')?.addEventListener('click', () => {
  loadSimpleFrame(currentBaseUrl);
});

document.getElementById('btnRetry')?.addEventListener('click', () => {
  loadSimpleFrame(currentBaseUrl);
});

document.getElementById('btnSettings')?.addEventListener('click', () => {
  settingsDrawer?.classList.toggle('hidden');
});

document.getElementById('btnOpenSettingsErr')?.addEventListener('click', () => {
  settingsDrawer?.classList.remove('hidden');
});

document.getElementById('btnOpenTab')?.addEventListener('click', () => {
  const fullUrl = `${currentBaseUrl}/?ui_mode=simple`;
  if (chrome?.tabs?.create) {
    chrome.tabs.create({ url: fullUrl });
  } else {
    window.open(fullUrl, '_blank', 'noopener,noreferrer');
  }
});

document.getElementById('btnSaveUrl')?.addEventListener('click', async () => {
  const next = sanitizeBaseUrl(siteUrlInput?.value || DEFAULT_SITE_URL);
  await chrome?.storage?.local?.set?.({ siteOrigin: next, apiBase: next });
  settingsDrawer?.classList.add('hidden');
  loadSimpleFrame(next);
});

document.querySelectorAll('.sp-preset').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const preset = sanitizeBaseUrl(btn.getAttribute('data-url') || DEFAULT_SITE_URL);
    if (siteUrlInput) siteUrlInput.value = preset;
    await chrome?.storage?.local?.set?.({ siteOrigin: preset, apiBase: preset });
    settingsDrawer?.classList.add('hidden');
    loadSimpleFrame(preset);
  });
});

(async () => {
  try {
    const stored = await chrome?.storage?.local?.get?.(['siteOrigin', 'apiBase']);
    const initialUrl = sanitizeBaseUrl(stored?.siteOrigin || stored?.apiBase || DEFAULT_SITE_URL);
    loadSimpleFrame(initialUrl);
  } catch {
    loadSimpleFrame(DEFAULT_SITE_URL);
  }
})();

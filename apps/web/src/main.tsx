import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { APP_VERSION, ASSET_VERSION } from './lib/version';
import './index.css';

if (typeof window !== 'undefined') {
  const SW_CACHE_NAME = `dollarino-pwa-v${APP_VERSION}`;
  const RELOAD_KEY = `dollarino_sw_reloaded_v${ASSET_VERSION}`;

  if ('caches' in window) {
    window.caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SW_CACHE_NAME).map((k) => window.caches.delete(k))))
      .catch(() => {});
  }
  if ('serviceWorker' in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          reg.update().catch(() => {});
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                nw.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        })
        .catch(() => {});
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // Never force a double-reload on initial first-visit SW install
        if (!hadController) return;
        if (reloading || sessionStorage.getItem(RELOAD_KEY)) return;
        reloading = true;
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
      });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

if (typeof window !== 'undefined') {
  // Purge legacy v9/v10 caches immediately so updated UI & transparent 3D icons appear without manual hard-refresh
  if ('caches' in window) {
    window.caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== 'dollarino-pwa-v11.6.5').map((k) => window.caches.delete(k))))
      .catch(() => {});
  }
  if ('serviceWorker' in navigator) {
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
        if (reloading || sessionStorage.getItem('dollarino_sw_reloaded_v1165')) return;
        reloading = true;
        sessionStorage.setItem('dollarino_sw_reloaded_v1165', '1');
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

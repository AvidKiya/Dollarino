// Single source of truth for the frontend-facing release version.
// `scripts/sync-version.mjs` keeps this file, the Worker `/api/health` response,
// the PWA service worker cache name and the Chrome extension manifest in sync,
// and `scripts/version-guard.mjs` verifies that they never drift apart again.

export const APP_VERSION = '11.7.2';

/** Cache-busting suffix used for static assets (`?v=`). */
export const ASSET_VERSION = APP_VERSION.replace(/\./g, '');

// Single source of truth for the runtime release version exposed by the Worker.
// `scripts/sync-version.mjs` keeps this in sync with the web app, PWA cache and extension,
// and `scripts/version-guard.mjs` fails CI if any surface drifts.
export const DOLLARINO_VERSION = '11.7.2';

/** Numeric asset query suffix, e.g. 11.7.2 -> "1172". */
export const DOLLARINO_ASSET_VERSION = DOLLARINO_VERSION.replace(/\./g, '');

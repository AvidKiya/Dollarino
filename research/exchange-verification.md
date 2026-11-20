# Exchange Capabilities Verification Log

- **Toobit (`https://api-docs.toobit.com`)**:
  - Verified base REST URL: `https://api.toobit.com`
  - Verified signing: `X-BB-APIKEY` header + lowercase hex `HMAC-SHA256` over `queryString`, with `timestamp` and `recvWindow`.
  - Verified USDT-M Perpetual endpoints: `/api/v1/futures/balance`, `/api/v1/futures/positions`, `/api/v1/futures/order` (`BUY_OPEN`, `SELL_OPEN`, `SELL_CLOSE`, `BUY_CLOSE`; market requires `type='LIMIT'` + `priceType='MARKET'`), `/api/v1/futures/leverage`, and WebSocket `wss://stream.toobit.com/api/v1/ws/<listenKey>`.
  - Verified Cloudflare Worker mitigation: route through `apps/relay` when Cloudflare egress hits upstream WAF 403.

- **KCEX (`https://blog.kcex.com`)**:
  - Verified Oct 2026 published fee model (`0%` maker / `0.01%` taker on web/app futures).
  - Verified **negative finding**: KCEX does **not** currently expose public third-party bot API keys.
  - Engineering stance: Marked `UNSUPPORTED` for live API keys; implemented transparently as **Signal-Mirror (`0.01%` simulation + deep-links)**.

// Cloudflare Pages Function proxy -> forwards `/api/*` to the Worker Service Binding (`WORKER_API`) or `WORKER_URL`
interface PagesEnv {
  WORKER_API?: { fetch(request: Request): Promise<Response> };
  WORKER_URL?: string;
}

export async function onRequest(context: { request: Request; env: PagesEnv }): Promise<Response> {
  if (context.env.WORKER_API) {
    return context.env.WORKER_API.fetch(context.request);
  }
  if (context.env.WORKER_URL) {
    const incomingUrl = new URL(context.request.url);
    const base = context.env.WORKER_URL.replace(/\/+$/, '');
    const targetUrl = `${base}${incomingUrl.pathname}${incomingUrl.search}`;
    const proxiedReq = new Request(targetUrl, context.request);
    return fetch(proxiedReq);
  }
  return new Response(
    JSON.stringify({
      error: 'Cloudflare Pages Function: WORKER_API binding or WORKER_URL environment variable is not configured yet.',
      docs: 'See DEPLOY-CLOUDFLARE.md in repository root.',
    }),
    {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

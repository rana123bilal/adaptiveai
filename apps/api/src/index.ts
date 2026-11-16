import { API_PREFIX, type ApiError, type HealthResponse } from '@adaptiveai/shared';

export interface Env {
  ALLOWED_ORIGINS: string;
}

/** Step 1 exposes liveness only. CORS is a browser policy, not authentication. */
export function handleRequest(request: Request, env: Env): Response {
  const requestId = crypto.randomUUID();
  const origin = request.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim());
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
    Vary: 'Origin',
  });

  const fail = (status: number, code: string, message: string) => {
    const body: ApiError = { error: { code, message, requestId } };
    return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), { status, headers });
  };

  if (origin && !allowedOrigins.includes(origin)) {
    return fail(403, 'ORIGIN_NOT_ALLOWED', 'This browser origin is not allowed.');
  }
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Expose-Headers', 'X-Request-Id');
  }

  const path = new URL(request.url).pathname;
  if (path !== `${API_PREFIX}/health`) {
    return fail(404, 'NOT_FOUND', 'This endpoint is not available.');
  }

  if (request.method === 'OPTIONS') {
    const method = request.headers.get('Access-Control-Request-Method');
    if (!origin || !method || !['GET', 'HEAD'].includes(method)) {
      return fail(400, 'INVALID_PREFLIGHT', 'Only GET and HEAD are supported here.');
    }
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    return new Response(null, { status: 204, headers });
  }

  if (!['GET', 'HEAD'].includes(request.method)) {
    headers.set('Allow', 'GET, HEAD, OPTIONS');
    return fail(405, 'METHOD_NOT_ALLOWED', 'Use GET or HEAD for this endpoint.');
  }

  const body: HealthResponse = {
    service: 'adaptiveai-api',
    status: 'ok',
    stage: 'foundation',
    dependencies: { gemini: 'not-configured', supabase: 'not-configured' },
  };
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), { status: 200, headers });
}

export default { fetch: handleRequest };

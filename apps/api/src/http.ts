import type { ApiError } from '@adaptiveai/shared';

export class RequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'RequestError';
  }
}

export function createHttpContext(request: Request) {
  const requestId = crypto.randomUUID();
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
    Vary: 'Origin',
  });
  const json = (body: unknown, status = 200) => new Response(
    request.method === 'HEAD' ? null : JSON.stringify(body), { status, headers },
  );
  const fail = (status: number, code: string, message: string) => {
    const body: ApiError = { error: { code, message, requestId } };
    return json(body, status);
  };
  return { requestId, headers, json, fail };
}

export type HttpContext = ReturnType<typeof createHttpContext>;

export function checkOrigin(request: Request, allowedOrigins: readonly string[], http: HttpContext): Response | undefined {
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins.includes(origin)) {
    return http.fail(403, 'ORIGIN_NOT_ALLOWED', 'This browser origin is not allowed.');
  }
  if (origin) {
    http.headers.set('Access-Control-Allow-Origin', origin);
    http.headers.set('Access-Control-Expose-Headers', 'X-Request-Id');
  }
  return undefined;
}

export function preflightResponse(
  request: Request, http: HttpContext, methods: readonly string[], allowedHeaders: readonly string[],
): Response {
  const method = request.headers.get('Access-Control-Request-Method');
  const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') ?? '')
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (!request.headers.get('Origin') || !method || !methods.includes(method)
    || requestedHeaders.some((header) => !allowedHeaders.includes(header))) {
    return http.fail(400, 'INVALID_PREFLIGHT', 'This preflight requests an unsupported method or header.');
  }
  http.headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  http.headers.set('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
  if (allowedHeaders.length) http.headers.set('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  return new Response(null, { status: 204, headers: http.headers });
}

/** Bound wire bytes while reading, even when Content-Length is absent or dishonest. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const [mediaType, ...parameters] = (request.headers.get('Content-Type') ?? '')
    .toLowerCase().split(';').map((part) => part.trim());
  const charset = parameters.find((parameter) => parameter.startsWith('charset='))?.slice(8).replaceAll('"', '');
  if (mediaType !== 'application/json' || (charset !== undefined && charset !== 'utf-8')) {
    throw new RequestError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send UTF-8 application/json.');
  }
  if (request.signal.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
  const tooLarge = () => new RequestError(413, 'BODY_TOO_LARGE', `The request body must not exceed ${maxBytes / 1_024} KiB.`);
  const advertisedLength = request.headers.get('Content-Length');
  if (advertisedLength !== null && Number(advertisedLength) > maxBytes) throw tooLarge();
  if (!request.body) throw new RequestError(400, 'INVALID_JSON', 'Send a valid JSON body.');

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let byteCount = 0;
  let content = '';
  const onAbort = () => { void reader.cancel().catch(() => undefined); };
  request.signal.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (request.signal.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
      if (chunk.done) break;
      byteCount += chunk.value.byteLength;
      if (byteCount > maxBytes) throw tooLarge();
      content += decoder.decode(chunk.value, { stream: true });
    }
    content += decoder.decode();
    return JSON.parse(content) as unknown;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof RequestError || request.signal.aborted) throw error;
    throw new RequestError(400, 'INVALID_JSON', 'Send valid UTF-8 JSON.');
  } finally {
    request.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

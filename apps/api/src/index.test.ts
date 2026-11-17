import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemoChatResponse, type ApiError, type DemoChatResponse } from '@adaptiveai/shared';
import { handleRequest } from './index';
import { MockChatProvider } from './providers/mock';

const env = { ALLOWED_ORIGINS: 'http://localhost:5173', DEMO_ENABLED: 'true' };
const healthUrl = 'http://localhost/api/v1/health';
const chatUrl = 'http://localhost/api/v1/demo/chat';
const input = { clientRequestId: 'b8b3fc83-7368-4fd2-a1a4-e92a466bde08', content: 'How will memory work?' };

function chatRequest(body: unknown = input, extra: RequestInit = {}): Request {
  return new Request(chatUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: env.ALLOWED_ORIGINS },
    body: JSON.stringify(body),
    ...extra,
  });
}

async function completeMock(request: Request): Promise<Response> {
  vi.useFakeTimers();
  const response = handleRequest(request, env);
  await vi.runAllTimersAsync();
  return response;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HTTP route and origin boundary', () => {
  it('reports liveness without claiming connected integrations', async () => {
    const response = await handleRequest(new Request(healthUrl), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: 'adaptiveai-api', status: 'ok', stage: 'chat-shell', mode: 'mock',
      dependencies: { gemini: 'not-configured', supabase: 'not-configured' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('accepts only exact allowed browser origins, including on errors', async () => {
    const allowed = await handleRequest(new Request(healthUrl, { headers: { Origin: env.ALLOWED_ORIGINS } }), env);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(env.ALLOWED_ORIGINS);
    const denied = await handleRequest(chatRequest(input, { headers: { Origin: 'http://localhost:5173.attacker.example' } }), env);
    expect(denied.status).toBe(403);
    expect(denied.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect((await denied.json() as ApiError).error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('allows demo JSON POST preflights but refuses extra headers', async () => {
    const headers = {
      Origin: env.ALLOWED_ORIGINS,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Content-Type',
    };
    const allowed = await handleRequest(new Request(chatUrl, { method: 'OPTIONS', headers }), env);
    expect(allowed.status).toBe(204);
    expect(await allowed.text()).toBe('');
    expect(allowed.headers.get('Access-Control-Allow-Headers')).toBe('content-type');
    expect(allowed.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    const denied = await handleRequest(new Request(chatUrl, {
      method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Headers': 'Content-Type, Authorization' },
    }), env);
    expect(denied.status).toBe(400);
  });

  it('limits preflight methods to each actual route', async () => {
    const response = await handleRequest(new Request(healthUrl, {
      method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGINS, 'Access-Control-Request-Method': 'POST' },
    }), env);
    expect(response.status).toBe(400);
  });

  it('keeps future canonical chat endpoints unavailable', async () => {
    const response = await handleRequest(new Request('http://localhost/api/v1/conversations/123/messages', { method: 'POST' }), env);
    expect(response.status).toBe(404);
    const body = await response.json() as ApiError;
    expect(body.error.requestId).toBe(response.headers.get('X-Request-Id'));
  });

  it('uses HTTP method semantics for HEAD and unsupported requests', async () => {
    const head = await handleRequest(new Request(healthUrl, { method: 'HEAD' }), env);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const get = await handleRequest(new Request(chatUrl), env);
    expect(get.status).toBe(405);
    expect(get.headers.get('Allow')).toBe('POST, OPTIONS');
  });
});

describe('demo request validation', () => {
  it.each([undefined, 'false', 'TRUE', '1', 'true '])('fails closed for demo switch %s', async (flag) => {
    const disabled = await handleRequest(chatRequest(), {
      ALLOWED_ORIGINS: env.ALLOWED_ORIGINS,
      ...(flag === undefined ? {} : { DEMO_ENABLED: flag }),
    });
    expect(disabled.status).toBe(503);
    expect((await disabled.json() as ApiError).error.code).toBe('DEMO_DISABLED');
  });

  it.each(['user_id', 'role', 'model', 'history', 'systemPrompt'])('rejects privileged or unsupported field %s', async (field) => {
    const response = await handleRequest(chatRequest({ ...input, [field]: 'untrusted' }), env);
    expect(response.status).toBe(400);
    expect((await response.json() as ApiError).error.code).toBe('INVALID_REQUEST');
  });

  it.each([
    null, [], { ...input, clientRequestId: 'not-a-uuid' }, { ...input, content: '   ' },
    { ...input, content: 'a'.repeat(4_001) }, { ...input, scenario: 'live' }, { ...input, scenario: ['reply'] },
  ])('rejects invalid payload %# before running the provider', async (body) => {
    const response = await handleRequest(chatRequest(body), env);
    expect(response.status).toBe(400);
    expect((await response.json() as ApiError).error.code).toBe('INVALID_REQUEST');
  });

  it('requires JSON with a supported UTF-8 charset', async () => {
    const type = await handleRequest(chatRequest(input, { headers: { 'Content-Type': 'text/plain' } }), env);
    expect(type.status).toBe(415);
    const charset = await handleRequest(chatRequest(input, { headers: { 'Content-Type': 'application/json; charset=utf-16' } }), env);
    expect(charset.status).toBe(415);
  });

  it('rejects malformed JSON and invalid UTF-8 without exposing decoder errors', async () => {
    for (const body of ['{"content":', new Uint8Array([0xff, 0xfe])]) {
      const response = await handleRequest(chatRequest(input, { body }), env);
      expect(response.status).toBe(400);
      expect((await response.json() as ApiError).error.code).toBe('INVALID_JSON');
    }
  });

  it.each([undefined, '1'])('bounds streamed bytes even with Content-Length=%s', async (length) => {
    const encoded = new TextEncoder().encode(JSON.stringify({ ...input, content: '🙂'.repeat(5_000) }));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 8_000));
        controller.enqueue(encoded.slice(8_000));
        controller.close();
      },
    });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (length !== undefined) headers['Content-Length'] = length;
    const request = new Request(chatUrl, { method: 'POST', body: stream, headers, duplex: 'half' } as RequestInit & { duplex: 'half' });
    const response = await handleRequest(request, env);
    expect(response.status).toBe(413);
    expect((await response.json() as ApiError).error.code).toBe('BODY_TOO_LARGE');
  });

  it('refuses an advertised oversized request before reading its body', async () => {
    const response = await handleRequest(chatRequest(input, {
      headers: { 'Content-Type': 'application/json', 'Content-Length': '20000' },
    }), env);
    expect(response.status).toBe(413);
  });

  it('decodes a multibyte character split between stream chunks', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...input, content: 'Hello 🙂' }));
    const split = bytes.indexOf(0xf0) + 2;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });
    const request = new Request(chatUrl, {
      method: 'POST', body: stream, headers: { 'Content-Type': 'application/json; charset="UTF-8"' }, duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const response = await completeMock(request);
    expect(response.status).toBe(200);
  });

  it('accepts the wire-size boundary and the maximum message length', async () => {
    const json = JSON.stringify({ ...input, content: 'x'.repeat(4_000) });
    const padded = json.padEnd(16 * 1_024, ' ');
    const response = await completeMock(chatRequest(input, { body: padded }));
    expect(response.status).toBe(200);
    expect(isDemoChatResponse(await response.json())).toBe(true);
  });
});

describe('demo provider orchestration', () => {
  it('returns deterministic safe replies and a stable message ID for retries', async () => {
    const first = await completeMock(chatRequest({ ...input, content: `  ${input.content}  ` }));
    expect(first.status).toBe(200);
    expect(first.headers.get('Access-Control-Allow-Origin')).toBe(env.ALLOWED_ORIGINS);
    const firstBody = await first.json() as DemoChatResponse;
    expect(isDemoChatResponse(firstBody)).toBe(true);
    expect(firstBody.message.content).toContain('does not store long-term memory');
    expect(firstBody.requestId).toBe(first.headers.get('X-Request-Id'));
    const secondBody = await (await completeMock(chatRequest())).json() as DemoChatResponse;
    expect(secondBody.message).toEqual(firstBody.message);
    expect(secondBody.requestId).not.toBe(firstBody.requestId);
  });

  it('returns a recognizable simulated provider failure', async () => {
    const response = await completeMock(chatRequest({ ...input, scenario: 'error' }));
    expect(response.status).toBe(503);
    expect((await response.json() as ApiError).error.code).toBe('DEMO_FAILURE');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not expose unexpected provider error details', async () => {
    vi.spyOn(MockChatProvider.prototype, 'generate').mockRejectedValueOnce(new Error('PRIVATE_PROVIDER_DETAIL'));
    const response = await handleRequest(chatRequest(), env);
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).toContain('INTERNAL_ERROR');
    expect(body).not.toContain('PRIVATE_PROVIDER_DETAIL');
  });

  it('stops delayed work when the request is cancelled', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = handleRequest(chatRequest({ ...input, scenario: 'slow' }, { signal: controller.signal }), env);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    const response = await result;
    expect(response.status).toBe(408);
    expect((await response.json() as ApiError).error.code).toBe('REQUEST_CANCELLED');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start work for an already cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    const response = await handleRequest(chatRequest(input, { signal: controller.signal }), env);
    expect(response.status).toBe(408);
  });

  it('cancels an unfinished body read and never starts the provider', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const generate = vi.spyOn(MockChatProvider.prototype, 'generate');
    let notifyReading!: () => void;
    const reading = new Promise<void>((resolve) => { notifyReading = resolve; });
    const stream = new ReadableStream<Uint8Array>({
      pull() { notifyReading(); },
      cancel,
    });
    const request = new Request(chatUrl, {
      method: 'POST', body: stream, signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const result = handleRequest(request, env);
    await reading;
    controller.abort();
    const response = await result;
    expect(response.status).toBe(408);
    expect((await response.json() as ApiError).error.code).toBe('REQUEST_CANCELLED');
    expect(cancel).toHaveBeenCalledOnce();
    expect(request.body?.locked).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DemoChatRequest, type DemoChatResponse } from '@adaptiveai/shared';
import { requestDemoReply } from './api';

const input: DemoChatRequest = { clientRequestId: '00000000-0000-4000-8000-000000000001', content: 'Hello' };
const reply: DemoChatResponse = {
  requestId: '00000000-0000-4000-8000-000000000002',
  clientRequestId: input.clientRequestId,
  mode: 'mock', model: 'adaptiveai-mock-v1',
  message: { id: `mock-${input.clientRequestId}`, role: 'assistant', content: 'Hello from the mock provider.' },
};

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('chat HTTP client', () => {
  it('sends a typed request and accepts a validated reply for that turn', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(reply));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestDemoReply(input, new AbortController().signal)).resolves.toEqual(reply);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/demo/chat', expect.objectContaining({
      method: 'POST', body: JSON.stringify(input), signal: expect.any(AbortSignal),
    }));
  });

  it('rejects valid-looking replies belonging to another turn', async () => {
    const other = '00000000-0000-4000-8000-000000000099';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...reply, clientRequestId: other, message: { ...reply.message, id: `mock-${other}` } })));
    await expect(requestDemoReply(input, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects successful HTML responses instead of treating them as assistant text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy error</html>')));
    await expect(requestDemoReply(input, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('shows an allowlisted error without leaking an upstream error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'private diagnostic', requestId: reply.requestId } }, { status: 500 })));
    await expect(requestDemoReply(input, new AbortController().signal)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR', message: 'The response did not complete. Please try again.', requestId: reply.requestId,
    });
  });

  it('distinguishes a broken connection from a deliberate cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(requestDemoReply(input, new AbortController().signal)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    const stopped = new AbortController();
    stopped.abort();
    await expect(requestDemoReply(input, stopped.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('reports a deadline separately from a user cancellation', async () => {
    const deadline = new AbortController();
    deadline.abort();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')));
    await expect(requestDemoReply(input, new AbortController().signal)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

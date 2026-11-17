import { API_PREFIX, isDemoChatResponse, type DemoChatRequest, type DemoChatResponse } from '@adaptiveai/shared';

export class ChatRequestError extends Error {
  constructor(message: string, public readonly code: string, public readonly requestId?: string) {
    super(message);
    this.name = 'ChatRequestError';
  }
}

const errorMessages: Record<string, string> = {
  DEMO_FAILURE: 'The demo response failed. Please try again.',
  DEMO_DISABLED: 'The demo is disabled on this server.',
  BODY_TOO_LARGE: 'This message is too large. Shorten it and start a new message.',
  INVALID_REQUEST: 'The server could not accept this message. Please start a new message.',
  RATE_LIMITED: 'Too many requests. Give it a moment, then try again.',
};

export async function requestDemoReply(input: DemoChatRequest, signal: AbortSignal): Promise<DemoChatResponse> {
  const timeout = AbortSignal.timeout(12_000);
  const combined = AbortSignal.any([signal, timeout]);
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  try {
    const response = await fetch(`${base}${API_PREFIX}/demo/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(input),
      signal: combined,
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      let code = 'REQUEST_FAILED';
      let requestId: string | undefined;
      if (body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object') {
        if ('code' in body.error && typeof body.error.code === 'string') code = body.error.code;
        if ('requestId' in body.error && typeof body.error.requestId === 'string') requestId = body.error.requestId;
      }
      throw new ChatRequestError(errorMessages[code] ?? 'The response did not complete. Please try again.', code, requestId);
    }
    if (!isDemoChatResponse(body) || body.clientRequestId !== input.clientRequestId) {
      throw new ChatRequestError('The server returned an unexpected response. Please try again.', 'INVALID_RESPONSE');
    }
    return body;
  } catch (error) {
    if (signal.aborted) throw new DOMException('Response stopped.', 'AbortError');
    if (timeout.aborted) throw new ChatRequestError('The response took too long. You can try again.', 'TIMEOUT');
    if (error instanceof ChatRequestError) throw error;
    throw new ChatRequestError('Could not reach the chat server. Check your connection and try again.', 'NETWORK_ERROR');
  }
}

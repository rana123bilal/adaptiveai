import {
  MAX_DEMO_BODY_BYTES, parseDemoChatRequest, type DemoChatResponse, type HealthResponse,
} from '@adaptiveai/shared';
import type { AppConfig } from './config';
import { readJson, type HttpContext } from './http';
import { MockChatProvider } from './providers/mock';
import { ProviderUnavailableError } from './providers/provider';

export function healthResponse(http: HttpContext): Response {
  const body: HealthResponse = {
    service: 'adaptiveai-api',
    status: 'ok',
    stage: 'chat-shell',
    mode: 'mock',
    dependencies: { gemini: 'not-configured', supabase: 'not-configured' },
  };
  return http.json(body);
}

export async function demoChatResponse(request: Request, config: AppConfig, http: HttpContext): Promise<Response> {
  if (!config.demoEnabled) {
    return http.fail(503, 'DEMO_DISABLED', 'The demo endpoint is disabled in this environment.');
  }
  const input = parseDemoChatRequest(await readJson(request, MAX_DEMO_BODY_BYTES));
  if (!input.success) return http.fail(400, 'INVALID_REQUEST', input.message);

  const provider = new MockChatProvider(input.data.scenario);
  try {
    const result = await provider.generate({ content: input.data.content, signal: request.signal });
    const body: DemoChatResponse = {
      requestId: http.requestId,
      clientRequestId: input.data.clientRequestId,
      mode: 'mock',
      model: provider.model,
      message: { id: `mock-${input.data.clientRequestId}`, role: 'assistant', content: result.content },
    };
    return http.json(body);
  } catch (error) {
    if (error instanceof ProviderUnavailableError && !request.signal.aborted) {
      return http.fail(503, 'DEMO_FAILURE', 'This is a simulated provider failure. Please try again.');
    }
    throw error;
  }
}

export const MAX_MESSAGE_LENGTH = 4_000;
export const MAX_DEMO_BODY_BYTES = 16 * 1_024;

export type DemoScenario = 'reply' | 'error' | 'slow';

/** Demo-only input. Live chat will load canonical history on the server. */
export interface DemoChatRequest {
  clientRequestId: string;
  content: string;
  scenario?: DemoScenario;
}

export interface DemoChatResponse {
  requestId: string;
  clientRequestId: string;
  mode: 'mock';
  model: 'adaptiveai-mock-v1';
  message: { id: string; role: 'assistant'; content: string };
}

type RequestValidation =
  | { success: true; data: DemoChatRequest }
  | { success: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** TypeScript checks code; this function checks untrusted network input. */
export function parseDemoChatRequest(value: unknown): RequestValidation {
  if (!isRecord(value)) return { success: false, message: 'Send a JSON object.' };
  if (Object.keys(value).some((key) => !['clientRequestId', 'content', 'scenario'].includes(key))) {
    return { success: false, message: 'The request contains unsupported fields.' };
  }
  if (typeof value.clientRequestId !== 'string' || !UUID_PATTERN.test(value.clientRequestId)) {
    return { success: false, message: 'A valid client request ID is required.' };
  }
  if (typeof value.content !== 'string') {
    return { success: false, message: 'Message content must be text.' };
  }
  const content = value.content.trim();
  if (!content || content.length > MAX_MESSAGE_LENGTH) {
    return { success: false, message: 'Use between 1 and 4,000 characters.' };
  }
  if (value.scenario !== undefined && (typeof value.scenario !== 'string'
    || !['reply', 'error', 'slow'].includes(value.scenario))) {
    return { success: false, message: 'Choose a supported demo scenario.' };
  }
  return {
    success: true,
    data: {
      clientRequestId: value.clientRequestId,
      content,
      ...(value.scenario === undefined ? {} : { scenario: value.scenario as DemoScenario }),
    },
  };
}

/** Reject malformed provider/API replies before they enter the conversation. */
export function isDemoChatResponse(value: unknown): value is DemoChatResponse {
  if (!isRecord(value) || !isRecord(value.message)) return false;
  return typeof value.requestId === 'string'
    && UUID_PATTERN.test(value.requestId)
    && typeof value.clientRequestId === 'string'
    && UUID_PATTERN.test(value.clientRequestId)
    && value.mode === 'mock'
    && value.model === 'adaptiveai-mock-v1'
    && value.message.id === `mock-${value.clientRequestId}`
    && value.message.role === 'assistant'
    && typeof value.message.content === 'string'
    && value.message.content.trim().length > 0
    && value.message.content.length <= 8_000;
}

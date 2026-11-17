import { describe, expect, it } from 'vitest';
import { isDemoChatResponse, parseDemoChatRequest } from './demo-chat';

const id = 'b8b3fc83-7368-4fd2-a1a4-e92a466bde08';

describe('shared runtime contracts', () => {
  it('normalizes content and accepts the optional scenario', () => {
    expect(parseDemoChatRequest({ clientRequestId: id, content: '  Hello  ', scenario: 'slow' })).toEqual({
      success: true, data: { clientRequestId: id, content: 'Hello', scenario: 'slow' },
    });
  });

  it('rejects arbitrary replies, empty answers, and mismatched reply IDs', () => {
    const valid = {
      requestId: id, clientRequestId: id, mode: 'mock', model: 'adaptiveai-mock-v1',
      message: { id: `mock-${id}`, role: 'assistant', content: 'A scripted reply.' },
    };
    expect(isDemoChatResponse(valid)).toBe(true);
    expect(isDemoChatResponse({ ...valid, mode: 'live' })).toBe(false);
    expect(isDemoChatResponse({ ...valid, message: { ...valid.message, content: '  ' } })).toBe(false);
    expect(isDemoChatResponse({ ...valid, message: { ...valid.message, id: 'wrong-request' } })).toBe(false);
    expect(isDemoChatResponse({ ...valid, message: { ...valid.message, content: 'x'.repeat(8_001) } })).toBe(false);
    expect(isDemoChatResponse(null)).toBe(false);
  });
});

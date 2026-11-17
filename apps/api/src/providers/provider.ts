/** The transport knows this interface; it does not know a provider's SDK. */
export interface ChatProvider {
  readonly model: string;
  generate(input: { content: string; signal: AbortSignal }): Promise<{ content: string }>;
}

export class ProviderUnavailableError extends Error {
  constructor() {
    super('The demo provider is temporarily unavailable.');
    this.name = 'ProviderUnavailableError';
  }
}

export function cancellationError(): DOMException {
  return new DOMException('The request was cancelled.', 'AbortError');
}

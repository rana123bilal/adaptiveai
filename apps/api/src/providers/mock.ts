import type { DemoScenario } from '@adaptiveai/shared';
import { cancellationError, ProviderUnavailableError, type ChatProvider } from './provider';

/** Fixed scripted replies only. This adapter makes no network or model calls. */
export class MockChatProvider implements ChatProvider {
  readonly model = 'adaptiveai-mock-v1' as const;

  constructor(private readonly scenario: DemoScenario = 'reply') {}

  async generate({ content, signal }: { content: string; signal: AbortSignal }): Promise<{ content: string }> {
    await wait(this.scenario === 'slow' ? 5_000 : 600, signal);
    if (this.scenario === 'error') throw new ProviderUnavailableError();
    return { content: createReply(content) };
  }
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(cancellationError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(cancellationError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function createReply(content: string): string {
  const question = content.toLowerCase();

  if (/\b(memory|memories|remember|learn|learning|correction|feedback)\b/.test(question)) {
    return 'AdaptiveAI is designed to remember useful information through a careful review loop.\n\n1. You submit a correction or preference.\n2. It is validated and approved.\n3. The approved information becomes private memory.\n4. Relevant memory is retrieved to help with future answers.\n\nThis demo does not store long-term memory or change model weights. For now, it lets you try the conversation experience.';
  }
  if (/\b(architectur\w*|stack|built|build|technolog\w*|cloudflare|supabase|react|gemini)\b/.test(question)) {
    return 'The planned stack has three clear responsibilities:\n\n• React, TypeScript, and Tailwind provide the interface on Cloudflare Pages.\n• A Cloudflare Worker handles requests, verification, and the future Gemini integration.\n• Supabase Auth and PostgreSQL will provide identity, conversation history, and private vector memory.\n\nRight now, your message reaches a real Worker endpoint and a scripted mock provider. No Gemini API call is made.';
  }
  if (/\b(evaluat\w*|measur\w*|improv\w*|benchmark\w*|accurac\w*)\b/.test(question)) {
    return 'Improvement needs a fair comparison. The evaluation plan runs the same held-out questions twice: once without long-term memory, and once with approved memory.\n\nWe will compare task success, retrieval quality, latency, and failures while keeping the model and settings consistent.\n\nNo evaluation results exist yet. This response is a scripted preview of how AdaptiveAI will explain its work.';
  }
  if (/\b(privacy|private|secure|security|data|save|stored)\b/.test(question)) {
    return 'Your conversations in this demo live in this browser tab’s memory and disappear when you refresh. The Worker processes each message without saving it to a database or sending it to Gemini.\n\nThe planned live version will use verified identity and database permissions to isolate each user’s history and approved memories. Those features have not been connected yet.';
  }
  if (/\b(hello|hi|hey|welcome)\b/.test(question)) {
    return 'Hello! Welcome to AdaptiveAI.\n\nYou can explore the planned architecture, ask how validated memory will work, or learn how improvement will be measured.\n\nThese are scripted replies while the AI integration is being built.';
  }
  if (/\b(help|can you|capabilit\w*|demo|test|cancel|retry)\b/.test(question)) {
    return 'Here are a few things to explore:\n\n• Ask how AdaptiveAI’s memory will work.\n• Explore the React, Worker, and Supabase architecture.\n• Ask how improvements will be measured.\n\nThese are deterministic demo replies. Real AI answers arrive in a later milestone.';
  }
  return 'I received your message. This milestone uses a scripted provider, so I can’t generate a general AI answer yet.\n\nTry asking “How will memory work?”, “What is the architecture?”, or “How will you measure improvement?” to explore the project.';
}

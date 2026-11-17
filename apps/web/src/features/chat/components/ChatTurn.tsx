import { useEffect, useState } from 'react';
import { Icon } from '../../../components/Icon';
import type { Turn } from '../model';

function CopyResponse({ content }: { content: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2_500);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <button className="copy-button" aria-label="Copy response" onClick={() => void copy()}>
      <Icon name={state === 'copied' ? 'check' : 'copy'} size={14} />
      <span aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Could not copy' : 'Copy'}
      </span>
    </button>
  );
}

interface ChatTurnProps {
  turn: Turn;
  busy: boolean;
  onRetry: () => void;
}

export function ChatTurn({ turn, busy, onRetry }: ChatTurnProps) {
  return (
    <div className="chat-turn">
      <article className="user-message message-enter" aria-label="Your message">
        <div className="message-meta"><span>You</span></div>
        <div className="user-bubble">{turn.content}</div>
      </article>

      {turn.status === 'completed' ? (
        <article className="assistant-message message-enter" aria-label="AdaptiveAI response">
          <div className="message-meta">
            <span className="assistant-avatar"><Icon name="spark" size={15} /></span>
            <span>AdaptiveAI</span>
          </div>
          <div className="assistant-copy">{turn.response}</div>
          <CopyResponse content={turn.response ?? ''} />
        </article>
      ) : turn.status === 'sending' ? (
        <div className="assistant-message message-enter" role="status" aria-label="AdaptiveAI is responding">
          <div className="message-meta">
            <span className="assistant-avatar thinking-avatar"><Icon name="spark" size={15} /></span>
            <span>AdaptiveAI</span>
          </div>
          <div className="thinking-line">
            <span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>
            <span>Thinking…</span>
          </div>
        </div>
      ) : (
        <div className={`response-notice message-enter ${turn.status}`}>
          <Icon name={turn.status === 'cancelled' ? 'stop' : 'info'} size={17} />
          <div>
            <p role={turn.status === 'failed' ? 'alert' : 'status'}>
              {turn.status === 'cancelled' ? 'Response stopped.' : turn.error}
            </p>
            <button className="retry-button" onClick={onRetry} disabled={busy} aria-label="Retry response">
              <Icon name="retry" size={14} />Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

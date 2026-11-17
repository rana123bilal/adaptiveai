import { useEffect, type RefObject } from 'react';
import { MAX_MESSAGE_LENGTH } from '@adaptiveai/shared';
import { Icon, type IconName } from '../../../components/Icon';

const starters: { icon: IconName; title: string; prompt: string }[] = [
  { icon: 'code', title: 'Architecture', prompt: 'Explain the AdaptiveAI architecture.' },
  { icon: 'memory', title: 'Memory', prompt: 'How will validated memory work?' },
  { icon: 'chart', title: 'Evaluation', prompt: 'How will we evaluate improvement?' },
];

interface ChatComposerProps {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  conversationId: string;
  draft: string;
  sending: boolean;
  showStarters: boolean;
  onDraftChange: (draft: string) => void;
  onSend: (text?: string) => void;
  onStop: () => void;
}

export function ChatComposer({
  inputRef, conversationId, draft, sending, showStarters, onDraftChange, onSend, onStop,
}: ChatComposerProps) {
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  }, [draft, conversationId, inputRef]);

  return (
    <div className="composer-dock">
      <div className={`composer-frame ${sending ? 'is-sending' : ''}`}>
        <form className="composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
          <label className="sr-only" htmlFor="message-input">Message AdaptiveAI</label>
          <textarea
            ref={inputRef}
            id="message-input"
            placeholder="Ask anything…"
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={2}
            aria-describedby="composer-hint"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (!sending) onSend();
              }
            }}
          />
          <div className="composer-toolbar">
            <div className="composer-right">
              <span className={`character-count ${draft.length > 3_600 ? 'visible' : ''}`}>
                {draft.length.toLocaleString()} / 4,000
              </span>
              {sending ? (
                <button type="button" className="send-button stop-button" aria-label="Stop response" onClick={onStop}>
                  <Icon name="stop" size={17} />
                </button>
              ) : (
                <button type="submit" className="send-button" aria-label="Send message" disabled={!draft.trim()}>
                  <Icon name="arrow" size={21} />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      {showStarters && (
        <div className="starter-grid" aria-label="Conversation starters">
          {starters.map((item, index) => (
            <button
              className="starter-card"
              key={item.title}
              style={{ animationDelay: `${120 + index * 70}ms` }}
              onClick={() => onSend(item.prompt)}
            >
              <div className="starter-title"><Icon name={item.icon} size={17} /><span>{item.title}</span></div>
            </button>
          ))}
        </div>
      )}
      <p className="composer-footnote" id="composer-hint">Demo replies · Chats clear on refresh.</p>
    </div>
  );
}

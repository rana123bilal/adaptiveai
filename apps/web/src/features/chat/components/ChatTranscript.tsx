import { useEffect, useRef } from 'react';
import type { Conversation, Turn } from '../model';
import { ChatTurn } from './ChatTurn';

interface ChatTranscriptProps {
  conversation: Conversation;
  busy: boolean;
  onRetry: (turn: Turn) => void;
}

export function ChatTranscript({ conversation, busy, onRetry }: ChatTranscriptProps) {
  const transcript = useRef<HTMLDivElement>(null);
  const endOfMessages = useRef<HTMLDivElement>(null);
  const lastTurn = conversation.turns.at(-1);

  useEffect(() => {
    const container = transcript.current;
    container?.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
  }, [conversation.id]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'end',
    });
  }, [conversation.turns.length, lastTurn?.status]);

  return (
    <div ref={transcript} className="transcript-scroll" aria-label="Conversation">
      <div className="transcript-inner" key={conversation.id}>
        {conversation.turns.map((turn) => (
          <ChatTurn key={turn.id} turn={turn} busy={busy} onRetry={() => onRetry(turn)} />
        ))}
        <div ref={endOfMessages} className="scroll-anchor" />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_MESSAGE_LENGTH } from '@adaptiveai/shared';
import { ChatRequestError, requestDemoReply } from './api';
import { createConversation, type Conversation, type Turn } from './model';

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>(() => [createConversation()]);
  const [activeId, setActiveId] = useState<string>('');
  const [announcement, setAnnouncement] = useState('');
  const active = conversations.find((item) => item.id === activeId) ?? conversations[0]!;
  const activeRequest = useRef<{ controller: AbortController; conversationId: string; turnId: string } | null>(null);

  const updateTurn = useCallback((conversationId: string, turnId: string, update: Partial<Turn>) => {
    setConversations((items) => items.map((item) => item.id === conversationId
      ? { ...item, turns: item.turns.map((turn) => turn.id === turnId ? { ...turn, ...update } : turn) }
      : item));
  }, []);

  const stop = useCallback(() => {
    const pending = activeRequest.current;
    if (!pending) return;
    activeRequest.current = null;
    pending.controller.abort();
    updateTurn(pending.conversationId, pending.turnId, { status: 'cancelled' });
  }, [updateTurn]);

  useEffect(() => () => {
    activeRequest.current?.controller.abort();
    activeRequest.current = null;
  }, []);

  const generate = useCallback(async (conversationId: string, turn: Turn) => {
    if (activeRequest.current) return;
    const operation = { controller: new AbortController(), conversationId, turnId: turn.id };
    activeRequest.current = operation;
    setAnnouncement('');
    updateTurn(conversationId, turn.id, { status: 'sending' });
    try {
      const result = await requestDemoReply({ clientRequestId: turn.id, content: turn.content }, operation.controller.signal);
      // A stopped, switched, or superseded request must never insert a late reply.
      if (activeRequest.current !== operation) return;
      updateTurn(conversationId, turn.id, { status: 'completed', response: result.message.content });
      setAnnouncement(`AdaptiveAI replied. ${result.message.content}`);
    } catch (error) {
      if (activeRequest.current !== operation) return;
      updateTurn(conversationId, turn.id, {
        status: operation.controller.signal.aborted ? 'cancelled' : 'failed',
        error: error instanceof ChatRequestError ? error.message : 'Something went wrong. Please try again.',
      });
    } finally {
      if (activeRequest.current === operation) activeRequest.current = null;
    }
  }, [updateTurn]);

  function setDraft(draft: string) {
    setConversations((items) => items.map((item) => item.id === active.id ? { ...item, draft } : item));
  }

  function send(text = active.draft) {
    const content = text.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH || activeRequest.current) return;
    const turn: Turn = { id: crypto.randomUUID(), content, status: 'sending' };
    setConversations((items) => items.map((item) => item.id === active.id ? {
      ...item,
      draft: '',
      title: item.turns.length === 0 ? content.slice(0, 48) : item.title,
      turns: [...item.turns, turn],
    } : item));
    void generate(active.id, turn);
  }

  function retry(turn: Turn) {
    if (turn.status !== 'failed' && turn.status !== 'cancelled') return;
    void generate(active.id, turn);
  }

  function newConversation() {
    stop();
    setAnnouncement('');
    const existingEmpty = conversations.find((item) => item.turns.length === 0 && !item.draft);
    if (existingEmpty) { setActiveId(existingEmpty.id); return; }
    const created = createConversation();
    setConversations((items) => [created, ...items]);
    setActiveId(created.id);
  }

  function selectConversation(id: string) {
    if (id === active.id) return;
    stop();
    setAnnouncement('');
    setActiveId(id);
  }

  return {
    conversations, active, announcement, setDraft, send, retry, stop, newConversation, selectConversation,
    sending: active.turns.some((turn) => turn.status === 'sending'),
  };
}

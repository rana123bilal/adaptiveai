import { useRef } from 'react';
import { Icon } from '../../components/Icon';
import { Orb } from '../../components/Orb';
import { ChatComposer } from './components/ChatComposer';
import { ChatTranscript } from './components/ChatTranscript';
import { ConversationDrawer } from './components/ConversationDrawer';
import type { Turn } from './model';
import { useChat } from './useChat';

export function ChatWorkspace() {
  const chat = useChat();
  const drawer = useRef<HTMLDialogElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const isEmpty = chat.active.turns.length === 0;

  function newChat() {
    chat.newConversation();
    drawer.current?.close();
    requestAnimationFrame(() => composer.current?.focus());
  }

  function send(text?: string) {
    chat.send(text);
    composer.current?.focus();
  }

  function retry(turn: Turn) {
    chat.retry(turn);
    composer.current?.focus();
  }

  function stop() {
    chat.stop();
    composer.current?.focus();
  }

  return (
    <div className="app-outer">
      <a className="skip-link" href="#message-input">Skip to message</a>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{chat.announcement}</div>
      <div className="app-shell">
        <nav className="icon-rail" aria-label="Workspace">
          <div className="brand-mark" aria-label="AdaptiveAI"><span>A</span><i /></div>
          <div className="rail-group">
            <button className="rail-button selected" aria-label="New chat" onClick={newChat}>
              <Icon name="plus" /><span className="rail-tooltip">New chat</span>
            </button>
            <button className="rail-button" aria-label="Open sidebar" onClick={() => drawer.current?.showModal()}>
              <Icon name="history" /><span className="rail-tooltip">Your chats</span>
            </button>
          </div>
        </nav>

        <section className="workspace" aria-label="AdaptiveAI chat">
          <header className="workspace-header">
            <div className="header-brand">
              <span>Adaptive<span className="brand-ai">AI</span></span>
              {!isEmpty && <><span className="header-divider" /><span className="header-context">{chat.active.title}</span></>}
            </div>
          </header>
          <main className={`chat-content ${isEmpty ? 'is-empty' : 'has-messages'}`}>
            {isEmpty ? (
              <div className="welcome">
                <Orb />
                <div className="welcome-copy"><h1>How can I help today?</h1></div>
              </div>
            ) : <ChatTranscript conversation={chat.active} busy={chat.sending} onRetry={retry} />}
            <ChatComposer
              inputRef={composer}
              conversationId={chat.active.id}
              draft={chat.active.draft}
              sending={chat.sending}
              showStarters={isEmpty}
              onDraftChange={chat.setDraft}
              onSend={send}
              onStop={stop}
            />
          </main>
        </section>
      </div>

      <ConversationDrawer
        dialogRef={drawer}
        conversations={chat.conversations}
        activeId={chat.active.id}
        onNewChat={newChat}
        onSelect={chat.selectConversation}
      />
    </div>
  );
}

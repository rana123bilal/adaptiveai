import type { RefObject } from 'react';
import { Icon } from '../../../components/Icon';
import type { Conversation } from '../model';

interface ConversationDrawerProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  conversations: Conversation[];
  activeId: string;
  onNewChat: () => void;
  onSelect: (id: string) => void;
}

export function ConversationDrawer({
  dialogRef, conversations, activeId, onNewChat, onSelect,
}: ConversationDrawerProps) {
  return (
    <dialog
      ref={dialogRef}
      className="history-dialog"
      aria-labelledby="history-title"
      onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
    >
      <div className="history-panel">
        <div className="modal-heading">
          <h2 id="history-title">Conversations</h2>
          <button className="icon-button" aria-label="Close sidebar" onClick={() => dialogRef.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <button className="new-chat-button" onClick={onNewChat}><Icon name="plus" size={18} />New chat</button>
        <div className="history-list">
          {conversations.map((item) => (
            <button
              key={item.id}
              aria-label={`Open conversation: ${item.title}`}
              aria-current={activeId === item.id ? 'true' : undefined}
              className={`history-item ${activeId === item.id ? 'active' : ''}`}
              onClick={() => { onSelect(item.id); dialogRef.current?.close(); }}
            >
              <Icon name="chat" size={17} /><span>{item.title}</span><Icon name="chevron" size={13} />
            </button>
          ))}
        </div>
        <p className="history-privacy">Chats clear when you refresh.</p>
      </div>
    </dialog>
  );
}

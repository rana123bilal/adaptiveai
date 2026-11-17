/** Local tab state; server conversation records will have a separate contract. */
export interface Turn {
  id: string;
  content: string;
  status: 'sending' | 'completed' | 'failed' | 'cancelled';
  response?: string;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  draft: string;
  turns: Turn[];
}

export function createConversation(): Conversation {
  return { id: crypto.randomUUID(), title: 'New conversation', draft: '', turns: [] };
}

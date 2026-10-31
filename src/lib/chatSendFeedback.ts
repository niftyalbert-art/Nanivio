/** Only display application-owned messages, never raw provider responses. */
export class ChatSendError extends Error {
  constructor(public readonly code: 'connection' | 'session' | 'access' | 'unavailable' | 'unconfirmed' | 'conversation') {
    super(code);
    this.name = 'ChatSendError';
  }
}

export function chatSendFeedback(error: unknown): string {
  const code = error instanceof ChatSendError ? error.code : undefined;
  const detail = {
    connection: 'Chat is reconnecting. Please try again in a moment.',
    session: 'Your session has expired. Sign in again to send messages.',
    access: 'You no longer have access to this conversation.',
    unavailable: 'Chat is temporarily unavailable. Please try again shortly.',
    unconfirmed: 'Delivery is not confirmed yet. Check the conversation before retrying to avoid sending twice.',
    conversation: 'Choose a registered contact or conversation first.',
  };
  return `${code ? detail[code] : 'Message not sent. Please try again.'} Your draft is still here.`;
}

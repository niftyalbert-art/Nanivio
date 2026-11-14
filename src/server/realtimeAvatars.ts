import { createHash } from 'node:crypto';

export const MAX_SIGNAL_AVATAR_LENGTH = 2048;

/** Keep large photos on the existing HTTP directory path, not the control socket. */
export function avatarForSignaling(avatar?: string): { avatar?: string; avatarRevision?: string } {
  if (!avatar) return {};
  if (avatar.length <= MAX_SIGNAL_AVATAR_LENGTH) return { avatar };
  return { avatarRevision: createHash('sha256').update(avatar).digest('hex') };
}

export function connectedAvatarForSignaling(user: { avatar?: string; avatarRevision?: string }) {
  return user.avatarRevision ? { avatarRevision: user.avatarRevision } : avatarForSignaling(user.avatar);
}

/** Older clients keep their existing photo payload until they opt into references. */
export function callControlForClient(message: any, references: boolean) {
  if (!references) return message;
  const key = message.type === 'call:accepted' ? 'responder'
    : ['call:incoming', 'call:connected'].includes(message.type) ? 'caller' : undefined;
  const subject = key && message.payload?.[key];
  if (!key || !subject) return message;
  const { avatar: _avatar, ...identity } = subject;
  return { ...message, payload: { ...message.payload,
    [key]: { ...identity, ...connectedAvatarForSignaling(subject) } } };
}

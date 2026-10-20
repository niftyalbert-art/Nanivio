import { authClient } from './authClient';

export const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export async function uploadChatAttachment(channelId: string, file: Blob, fileName: string): Promise<string> {
  if (!file.size || file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    throw new Error('Choose a non-empty file smaller than 20 MB.');
  }
  const token = authClient.getToken();
  if (!token) throw new Error('Sign in again before uploading a file.');
  const response = await fetch(`/api/stream/channels/${encodeURIComponent(channelId)}/attachments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(fileName),
      'X-File-Type': file.type.split(';')[0] || 'application/octet-stream',
    },
    body: file,
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.url !== 'string' || !result.url.startsWith('https://')) {
    throw new Error(result.error || 'The attachment could not upload. Your message was not sent.');
  }
  return result.url;
}

// A blob URL only exists on its creator's device. Never publish it to another user.
export async function durableChatMedia(channelId: string, source: string, fileName: string): Promise<string> {
  if (/^https:\/\//i.test(source)) return source;
  if (!source.startsWith('blob:') && !source.startsWith('data:')) {
    throw new Error('Choose a real file or recording before sending.');
  }
  const response = await fetch(source);
  const file = await response.blob();
  const audioExtensions: Record<string, string> = { 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };
  const extension = audioExtensions[file.type.split(';')[0]];
  const name = extension ? fileName.replace(/\.[^.]+$/, `.${extension}`) : fileName;
  return uploadChatAttachment(channelId, file, name);
}

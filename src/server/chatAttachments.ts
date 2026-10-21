export const MAX_CHAT_UPLOAD_BYTES = 20 * 1024 * 1024;

const supportedFiles: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'image/gif': ['gif'],
  'video/mp4': ['mp4'], 'video/webm': ['webm'], 'video/quicktime': ['mov'],
  'audio/webm': ['webm'], 'audio/mp4': ['m4a', 'mp4'], 'audio/mpeg': ['mp3'], 'audio/ogg': ['ogg'],
  'audio/wav': ['wav'], 'audio/x-wav': ['wav'],
  'application/pdf': ['pdf'], 'text/plain': ['txt'], 'text/csv': ['csv'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.ms-powerpoint': ['ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
};

export function validateChatUpload(bytes: Buffer, requestedName: string, requestedType: string) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_CHAT_UPLOAD_BYTES) {
    throw new Error('Choose a non-empty file smaller than 20 MB.');
  }
  const name = requestedName.replace(/[/\\\x00-\x1f\x7f]/g, '_').slice(-180);
  const extension = name.split('.').pop()?.toLowerCase() || '';
  // Some browsers omit MIME types for Office files. Infer only an allowlisted extension.
  const type = requestedType === 'application/octet-stream'
    ? Object.keys(supportedFiles).find(key => supportedFiles[key].includes(extension))
    : requestedType;
  if (!name || !type || !supportedFiles[type]?.includes(extension)) {
    throw new Error('Supported files: photos, MP4/WebM/MOV video, audio, PDF, Office documents, TXT and CSV.');
  }
  return { name, type };
}

export function privateMessageMedia(message: any) {
  const secureUrl = (value: unknown) => {
    if (typeof value !== 'string' || value.length > 8192) return undefined;
    try { const url = new URL(value); return url.protocol === 'https:' ? value : undefined; }
    catch { return undefined; }
  };
  const text = (value: unknown, limit = 2000) => typeof value === 'string' ? value.slice(0, limit) : undefined;
  const mediaType = ['image', 'video', 'document'].includes(message.mediaType) ? message.mediaType : undefined;
  const mediaUrl = secureUrl(message.mediaUrl);
  const voice = message.isVoiceNote && message.voiceNote;
  const audioUrl = secureUrl(voice?.audioBlobUrl);
  if ((mediaType && !mediaUrl) || (voice && !audioUrl)) {
    throw new Error('Attachments must finish uploading before sending.');
  }
  const voiceNote = audioUrl ? {
    id: text(voice.id, 180), duration: Math.max(0, Math.min(3600, Number(voice.duration) || 0)),
    audioBlobUrl: audioUrl, translatedAudioUrl: secureUrl(voice.translatedAudioUrl),
    transcript: text(voice.transcript), translatedTranscript: text(voice.translatedTranscript),
    hasLangpretation: Boolean(voice.hasLangpretation && secureUrl(voice.translatedAudioUrl)),
    sourceLang: text(voice.sourceLang, 25), targetLang: text(voice.targetLang, 25), waveform: [],
  } : undefined;
  return {
    translationStatus: ['translated', 'unavailable'].includes(message.translationStatus) ? message.translationStatus : undefined,
    translationTargetLang: text(message.translationTargetLang, 25),
    translatedText: message.translationStatus === 'unavailable' ? undefined : text(message.translatedText, 20000),
    mediaType: mediaUrl ? mediaType : undefined, mediaUrl,
    mediaCaption: text(message.mediaCaption), mediaFileName: text(message.mediaFileName, 180),
    mediaFileSize: text(message.mediaFileSize, 40),
    isVoiceNote: Boolean(voiceNote), voiceNote,
    replyTo: message.replyTo && { id: text(message.replyTo.id, 180),
      senderName: text(message.replyTo.senderName, 180), text: text(message.replyTo.text) },
  };
}

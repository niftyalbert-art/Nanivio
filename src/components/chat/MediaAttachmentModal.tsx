import React, { useEffect, useRef, useState } from 'react';
import { Camera, FileText, Image, Paperclip, Send, X } from 'lucide-react';
import { MAX_CHAT_ATTACHMENT_BYTES } from '../../lib/chatAttachments';

interface MediaAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMedia: (media: {
    type: 'image' | 'video' | 'document'; url: string; caption?: string; fileName?: string; fileSize?: string;
  }) => void | Promise<void>;
  onOpenLiveCamera?: () => void;
  userTier?: 'free' | 'pro';
}

export const MediaAttachmentModal: React.FC<MediaAttachmentModalProps> = ({ isOpen, onClose, onSendMedia, onOpenLiveCamera }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!isOpen) { setFile(null); setCaption(''); setError(''); }
  }, [isOpen]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!isOpen) return null;
  const kind = file?.type.startsWith('image/') ? 'image' : file?.type.startsWith('video/') ? 'video' : 'document';
  const choose = (accept: string) => {
    if (input.current) { input.current.accept = accept; input.current.click(); }
  };
  const send = async () => {
    if (!file || !preview || sending) return;
    setSending(true); setError('');
    try {
      await onSendMedia({ type: kind, url: preview, caption: caption.trim(), fileName: file.name, fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB` });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send this attachment. Please retry.');
    } finally { setSending(false); }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="attachment-title">
      <section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-5 text-slate-100 shadow-2xl">
        <header className="mb-5 flex items-center justify-between">
          <h2 id="attachment-title" className="flex items-center gap-2 text-lg font-semibold"><Paperclip size={20} /> Attach a file</h2>
          <button type="button" aria-label="Close attachments" disabled={sending} onClick={onClose} className="rounded-lg p-2 hover:bg-slate-800"><X size={20} /></button>
        </header>
        <input ref={input} type="file" className="hidden" aria-label="Choose attachment" onChange={e => {
          const next = e.target.files?.[0]; e.target.value = '';
          if (!next) return;
          if (!next.size || next.size > MAX_CHAT_ATTACHMENT_BYTES) { setError('Choose a non-empty file smaller than 20 MB.'); return; }
          setFile(next); setError('');
        }} />
        <div className="mb-4 grid grid-cols-3 gap-2">
          <button type="button" disabled={sending} onClick={() => choose('image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime')} className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 p-3 hover:bg-slate-800"><Image size={23} /><span className="text-xs">Photos & videos</span></button>
          <button type="button" disabled={sending} onClick={() => choose('.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv')} className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 p-3 hover:bg-slate-800"><FileText size={23} /><span className="text-xs">Document</span></button>
          <button type="button" disabled={sending || !onOpenLiveCamera} onClick={() => { onClose(); onOpenLiveCamera?.(); }} className="flex flex-col items-center gap-2 rounded-xl border border-slate-700 p-3 hover:bg-slate-800 disabled:opacity-40"><Camera size={23} /><span className="text-xs">Camera</span></button>
        </div>
        {file ? (
          <div className="space-y-3">
            {kind === 'image' && <img src={preview} alt="Selected attachment preview" className="max-h-56 w-full rounded-lg object-contain" />}
            {kind === 'video' && <video src={preview} controls className="max-h-56 w-full rounded-lg" />}
            <p className="break-all text-sm">{file.name} <span className="text-slate-400">({(file.size / 1024 / 1024).toFixed(2)} MB)</span></p>
            <input aria-label="Attachment caption" placeholder="Add a caption (optional)" value={caption} maxLength={2000} disabled={sending} onChange={e => setCaption(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-3 text-base text-white" />
          </div>
        ) : <p className="py-8 text-center text-sm text-slate-400">Choose your own photo, video or document.<br />Up to 20 MB per file.</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <button type="button" onClick={send} disabled={!file || sending} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f0b90b] font-semibold text-slate-950 hover:bg-[#ffd54a] disabled:opacity-40">
          <Send size={18} /> {sending ? 'Uploading & sending…' : 'Send attachment'}
        </button>
      </section>
    </div>
  );
};

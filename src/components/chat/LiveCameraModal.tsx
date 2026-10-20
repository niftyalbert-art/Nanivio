import React, { useEffect, useRef, useState } from 'react';
import { Camera, Send, Square, Video, X } from 'lucide-react';

interface Props {
  isOpen: boolean; onClose: () => void; userTier?: 'free' | 'pro';
  onSendMedia: (media: { type: 'image' | 'video'; url: string; caption?: string; fileName?: string; fileSize?: string }) => void | Promise<void>;
}

export const LiveCameraModal: React.FC<Props> = ({ isOpen, onClose, onSendMedia }) => {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const capture = useRef<{ blob: Blob; url: string; kind: 'image' | 'video'; name: string } | null>(null);
  const [preview, setPreview] = useState('');
  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false; setError(''); setReady(false);
    navigator.mediaDevices?.getUserMedia({ video: true, audio: true }).then(media => {
      if (cancelled) { media.getTracks().forEach(t => t.stop()); return; }
      stream.current = media;
      if (video.current) { video.current.srcObject = media; video.current.play().catch(() => {}); }
      setReady(true);
    }).catch(() => setError('Camera or microphone access was denied or unavailable. Allow access in your browser, or attach an existing file.'));
    if (!navigator.mediaDevices?.getUserMedia) setError('Camera capture requires a supported browser and HTTPS.');
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current?.state === 'recording') { recorder.current.onstop = null; recorder.current.stop(); }
      stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
      if (capture.current) URL.revokeObjectURL(capture.current.url);
      capture.current = null; setPreview(''); setRecording(false);
    };
  }, [isOpen]);
  const save = (blob: Blob, type: 'image' | 'video', name: string) => {
    if (capture.current) URL.revokeObjectURL(capture.current.url);
    const url = URL.createObjectURL(blob); capture.current = { blob, url, kind: type, name };
    setPreview(url); setKind(type);
  };
  const photo = () => {
    const element = video.current;
    if (!element?.videoWidth || !ready) return;
    const canvas = document.createElement('canvas'); canvas.width = element.videoWidth; canvas.height = element.videoHeight;
    canvas.getContext('2d')?.drawImage(element, 0, 0);
    canvas.toBlob(blob => { if (blob) save(blob, 'image', `photo-${Date.now()}.jpg`); }, 'image/jpeg', 0.9);
  };
  const record = () => {
    if (recording) { recorder.current?.stop(); if (timer.current) clearTimeout(timer.current); return; }
    if (!stream.current || typeof MediaRecorder === 'undefined') { setError('Video recording is unavailable in this browser.'); return; }
    try {
      const type = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream.current, { mimeType: type }); recorder.current = rec;
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = () => { setRecording(false); save(new Blob(chunks, { type }), 'video', `video-${Date.now()}.${type.endsWith('webm') ? 'webm' : 'mp4'}`); };
      rec.start(250); setRecording(true);
      timer.current = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 60000);
    } catch { setError('Unable to start video recording. Try attaching an existing video.'); }
  };
  const send = async () => {
    if (!capture.current || sending) return;
    setSending(true); setError('');
    try {
      await onSendMedia({ type: capture.current.kind, url: capture.current.url, fileName: capture.current.name, fileSize: `${(capture.current.blob.size / 1024 / 1024).toFixed(2)} MB` });
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : 'Capture could not be sent. Please retry.'); }
    finally { setSending(false); }
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="camera-title">
      <section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-4 text-white">
        <header className="mb-3 flex items-center justify-between"><h2 id="camera-title" className="font-semibold">Camera</h2><button type="button" disabled={sending} aria-label="Close camera" onClick={onClose} className="p-2"><X /></button></header>
        <video ref={video} autoPlay playsInline muted hidden={!!preview} className="aspect-video w-full rounded-xl bg-black object-contain" />
        {preview && (kind === 'image' ? <img src={preview} alt="Your captured photo" className="max-h-80 w-full object-contain" /> : <video src={preview} controls className="max-h-80 w-full" />)}
        {error && <p role="alert" className="my-3 text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {preview ? <>
            <button type="button" disabled={sending} onClick={() => { if (capture.current) URL.revokeObjectURL(capture.current.url); capture.current = null; setPreview(''); }} className="rounded-xl border border-slate-600 px-4 py-3">Retake</button>
            <button type="button" disabled={sending} onClick={send} className="flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-3 font-semibold text-slate-950"><Send size={18} />{sending ? 'Sending…' : 'Send capture'}</button>
          </> : <>
            <button type="button" disabled={!ready || recording} onClick={photo} className="flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 disabled:opacity-40"><Camera size={18} />Photo</button>
            <button type="button" disabled={!ready} onClick={record} className="flex items-center gap-2 rounded-xl border border-slate-600 px-4 py-3 disabled:opacity-40">{recording ? <Square size={18} /> : <Video size={18} />}{recording ? 'Stop recording' : 'Record video'}</button>
          </>}
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">Videos up to 60 seconds. Attachments up to 20 MB.</p>
      </section>
    </div>
  );
};

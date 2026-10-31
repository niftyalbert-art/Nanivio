import React from 'react';

export const VoiceNoteRecorder: React.FC<{ onCancel: () => void; onSend: (payload: any) => void }> = ({ onCancel }) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-700 p-3 text-sm text-slate-300">
    <span>Voice recording is disabled in this sample preview.</span>
    <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-amber-300">Back</button>
  </div>
);

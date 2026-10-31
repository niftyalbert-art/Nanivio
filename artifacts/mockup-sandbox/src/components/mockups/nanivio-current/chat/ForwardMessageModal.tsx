import React from 'react';

export const ForwardMessageModal: React.FC<any> = ({ isOpen, onClose }) => isOpen ? (
  <div role="dialog" aria-label="Sample preview forwarding notice" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
    <div className="max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-200">
      <p>Forwarding is disabled in this sample preview.</p>
      <button className="mt-4 rounded-lg px-3 py-2 text-amber-300" onClick={onClose}>Close</button>
    </div>
  </div>
) : null;

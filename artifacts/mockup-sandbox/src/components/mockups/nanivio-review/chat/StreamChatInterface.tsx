import React from 'react';

export const StreamChatInterface: React.FC<{ onCategorySelect: (category: any) => void }> = ({ onCategorySelect }) => (
  <div className="m-4 rounded-2xl border border-slate-700 bg-slate-900 p-6 text-sm text-slate-300">
    <p>Community channels are not connected in this isolated sample.</p>
    <button className="mt-3 rounded-lg border border-slate-600 px-3 py-2" onClick={() => onCategorySelect('conversations')}>Back to chats</button>
  </div>
);

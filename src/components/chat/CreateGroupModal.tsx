import React, { useState } from 'react';
import {
  Users,
  X,
  Search,
  CheckCircle2,
  Sparkles,
  Shield,
  Plus,
} from 'lucide-react';
import { SavedContact, Participant } from '../../types';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts?: SavedContact[];
  onCreateGroup?: (title: string, description: string, participantIds: string[], avatar?: string) => Promise<void | any>;
}

const GROUP_AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=150&auto=format&fit=crop&q=80',
];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  contacts = [],
  onCreateGroup,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(GROUP_AVATAR_PRESETS[0]);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const safeContacts = contacts || [];
  const filteredContacts = safeContacts.filter((c) =>
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.nvId && c.nvId.includes(searchTerm))
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      if (onCreateGroup) {
        await onCreateGroup(title.trim(), description.trim(), selectedContactIds, selectedAvatar);
      }
      setTitle('');
      setDescription('');
      setSelectedContactIds([]);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b1424] border border-slate-700/80 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Create New Group</h3>
              <p className="text-xs text-slate-400">Collaborate with contacts with live multilingual translation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Avatar selection */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-500/60 shrink-0 bg-slate-900 shadow-md">
              <img
                src={selectedAvatar}
                alt="Group preview"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-300">Choose Group Icon:</span>
              <div className="flex items-center gap-2">
                {GROUP_AVATAR_PRESETS.map((av, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAvatar(av)}
                    className={`w-8 h-8 rounded-xl overflow-hidden border transition-all ${
                      selectedAvatar === av ? 'border-emerald-500 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={av} alt="preset" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Group Title */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Group Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Accra Logistics & Trade Alliance"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Group Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Group Description</label>
            <textarea
              rows={2}
              placeholder="Brief description or purpose of this group..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Select Members */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300">Add Members from Contacts</label>
              <span className="text-[11px] text-emerald-400 font-mono font-bold">
                {selectedContactIds.length} selected
              </span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {filteredContacts.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-3">No contacts available to add.</p>
              ) : (
                filteredContacts.map((contact) => {
                  const isSelected = selectedContactIds.includes(contact.id);
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => toggleSelect(contact.id)}
                      className={`w-full p-2 rounded-xl border flex items-center justify-between text-left transition-all ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-500 text-white'
                          : 'bg-slate-900/40 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                          {contact.avatar ? (
                            <img
                              src={contact.avatar}
                              alt={contact.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-xs font-bold text-emerald-400 font-mono">
                              {contact.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{contact.name}</p>
                          <span className="text-[10px] font-mono text-emerald-400">NV-{contact.nvId}</span>
                        </div>
                      </div>

                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
                          isSelected
                            ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                            : 'border-slate-700 bg-slate-950 text-transparent'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-900/80 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 flex items-center justify-between mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100 flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Creating...' : 'Create Group'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

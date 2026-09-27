import React, { useState } from 'react';
import {
  Users,
  X,
  Shield,
  ShieldAlert,
  UserPlus,
  UserMinus,
  Crown,
  BellOff,
  LogOut,
  Edit2,
  Check,
  Search,
  Flag,
} from 'lucide-react';
import { Conversation, Participant, SavedContact } from '../../types';

interface GroupDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversation?: Conversation | null;
  currentUserId?: string;
  allContacts?: SavedContact[];
  onUpdateGroup?: (updates: { title?: string; description?: string }) => void;
  onAddMembers?: (participantIds: string[]) => void;
  onRemoveMember?: (participantId: string) => void;
  onPromoteAdmin?: (participantId: string) => void;
  onDismissAdmin?: (participantId: string) => void;
  onMuteGroup?: () => void;
  onReportGroup?: () => void;
  onExitGroup?: () => void;
}

export const GroupDetailsModal: React.FC<GroupDetailsModalProps> = ({
  isOpen,
  onClose,
  conversation,
  currentUserId = '',
  allContacts = [],
  onUpdateGroup,
  onAddMembers,
  onRemoveMember,
  onPromoteAdmin,
  onDismissAdmin,
  onMuteGroup,
  onReportGroup,
  onExitGroup,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'add'>('info');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descText, setDescText] = useState(conversation?.groupDescription || '');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleText, setTitleText] = useState(conversation?.title || '');
  const [selectedToAdd, setSelectedToAdd] = useState<string[]>([]);
  const [searchMember, setSearchMember] = useState('');

  // Sync state if conversation changes
  React.useEffect(() => {
    if (conversation) {
      setDescText(conversation.groupDescription || '');
      setTitleText(conversation.title || '');
    }
  }, [conversation?.id, conversation?.groupDescription, conversation?.title]);

  if (!isOpen || !conversation) return null;

  const isCurrentUserAdmin =
    (Boolean(currentUserId) && conversation.groupAdmins?.includes(currentUserId)) ||
    (Boolean(currentUserId) && conversation.groupCreatedBy === currentUserId) ||
    !conversation.groupAdmins ||
    conversation.groupAdmins.length === 0;

  const existingParticipantIds = (conversation.participants || []).map((p) => p.id);
  const safeContacts = allContacts || [];
  const availableToAdd = safeContacts.filter(
    (c) => !existingParticipantIds.includes(c.id) && !existingParticipantIds.includes(c.nvId)
  );

  const filteredMembers = (conversation.participants || []).filter((p) =>
    p.name.toLowerCase().includes(searchMember.toLowerCase()) ||
    p.username?.toLowerCase().includes(searchMember.toLowerCase())
  );

  const handleSaveDescription = () => {
    onUpdateGroup?.({ description: descText });
    setIsEditingDesc(false);
  };

  const handleSaveTitle = () => {
    if (titleText.trim()) {
      onUpdateGroup?.({ title: titleText.trim() });
      setIsEditingTitle(false);
    }
  };

  const handleAddConfirm = () => {
    if (selectedToAdd.length > 0) {
      onAddMembers?.(selectedToAdd);
      setSelectedToAdd([]);
      setActiveTab('members');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b1424] border border-slate-700/80 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-emerald-500/40 bg-slate-800 flex items-center justify-center shrink-0">
              {conversation.avatar ? (
                <img
                  src={conversation.avatar}
                  alt={conversation.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <Users className="w-6 h-6 text-emerald-400" />
              )}
            </div>
            <div className="min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={titleText}
                    onChange={(e) => setTitleText(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white"
                  />
                  <button onClick={handleSaveTitle} className="text-emerald-400 hover:text-emerald-300">
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white truncate">{conversation.title}</h3>
                  {isCurrentUserAdmin && (
                    <button onClick={() => setIsEditingTitle(true)} className="text-slate-500 hover:text-slate-300">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-400">
                {conversation.participants.length} members • {conversation.groupAdmins?.length || 1} admin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="p-2 bg-slate-950/60 border-b border-slate-800/80 flex gap-2">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'info' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Overview &amp; Safety
          </button>
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'members' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Members ({conversation.participants.length})
          </button>
          {isCurrentUserAdmin && (
            <button
              onClick={() => setActiveTab('add')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'add' ? 'bg-emerald-500 text-slate-950' : 'text-emerald-400 hover:text-emerald-300'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add Member</span>
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'info' && (
            <div className="space-y-4">
              {/* Description */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                    Group Description
                  </span>
                  {isCurrentUserAdmin && !isEditingDesc && (
                    <button
                      onClick={() => setIsEditingDesc(true)}
                      className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  )}
                </div>

                {isEditingDesc ? (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={descText}
                      onChange={(e) => setDescText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditingDesc(false)}
                        className="px-3 py-1 rounded-lg text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveDescription}
                        className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {conversation.groupDescription || 'No description provided for this group.'}
                  </p>
                )}
              </div>

              {/* Quick Actions */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onMuteGroup}
                  className="w-full p-3 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white flex items-center justify-between text-xs font-medium transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <BellOff className="w-4 h-4 text-amber-400" />
                    <span>{conversation.isMuted ? 'Unmute Group Notifications' : 'Mute Group Notifications'}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{conversation.isMuted ? 'Muted' : 'Sound ON'}</span>
                </button>

                <button
                  type="button"
                  onClick={onReportGroup}
                  className="w-full p-3 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-rose-500/50 text-slate-300 hover:text-rose-400 flex items-center justify-between text-xs font-medium transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Flag className="w-4 h-4 text-rose-400" />
                    <span>Report Group</span>
                  </div>
                  <span className="text-[10px] text-slate-500">Spam or Abuse</span>
                </button>

                <button
                  type="button"
                  onClick={onExitGroup}
                  className="w-full p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 flex items-center justify-between text-xs font-bold transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <LogOut className="w-4 h-4" />
                    <span>Exit Group</span>
                  </div>
                  <span className="text-[10px]">Leave conversation</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'members' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search group members..."
                  value={searchMember}
                  onChange={(e) => setSearchMember(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2">
                {filteredMembers.map((member) => {
                  const isMe = member.id === currentUserId;
                  const isAdmin =
                    conversation.groupAdmins?.includes(member.id) ||
                    conversation.groupCreatedBy === member.id;

                  return (
                    <div
                      key={member.id}
                      className="p-2.5 rounded-2xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                          {member.avatar ? (
                            <img
                              src={member.avatar}
                              alt={member.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-xs font-bold text-emerald-400 font-mono">
                              {member.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-white truncate">
                              {member.name} {isMe && '(You)'}
                            </p>
                            {isAdmin && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold border border-emerald-500/30 flex items-center gap-1">
                                <Crown className="w-2.5 h-2.5" />
                                Admin
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono">
                            {member.username ? `@${member.username}` : member.nvId ? `NV-${member.nvId}` : 'Member'}
                          </p>
                        </div>
                      </div>

                      {/* Admin controls for member */}
                      {isCurrentUserAdmin && !isMe && (
                        <div className="flex items-center gap-1 shrink-0">
                          {isAdmin ? (
                            <button
                              onClick={() => onDismissAdmin(member.id)}
                              className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-[10px] font-medium"
                              title="Dismiss as Admin"
                            >
                              Dismiss Admin
                            </button>
                          ) : (
                            <button
                              onClick={() => onPromoteAdmin(member.id)}
                              className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-[10px] font-bold border border-emerald-500/30"
                              title="Make Group Admin"
                            >
                              Make Admin
                            </button>
                          )}
                          <button
                            onClick={() => onRemoveMember(member.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30"
                            title="Remove from group"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'add' && (
            <div className="space-y-3">
              <span className="text-xs text-slate-400">Select contacts to invite into this group:</span>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {availableToAdd.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 py-6">All your contacts are already in this group.</p>
                ) : (
                  availableToAdd.map((contact) => {
                    const isSelected = selectedToAdd.includes(contact.id);
                    return (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() =>
                          setSelectedToAdd((prev) =>
                            prev.includes(contact.id)
                              ? prev.filter((i) => i !== contact.id)
                              : [...prev, contact.id]
                          )
                        }
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
                          <Check className="w-3 h-3" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={handleAddConfirm}
                  disabled={selectedToAdd.length === 0}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs disabled:opacity-40"
                >
                  Add {selectedToAdd.length} Member{selectedToAdd.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

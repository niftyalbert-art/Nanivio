import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Phone,
  Video,
  MessageSquare,
  Star,
  Trash2,
  Edit2,
  Copy,
  Check,
  Globe,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter,
  Heart,
  Briefcase,
  Stethoscope,
  Building,
  UserCheck,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { SavedContact, SUPPORTED_LANGUAGES, SupportedLanguageCode, Participant } from '../../types';
import { normalizeNanivioNumber, lookupNanivioUser } from '../../utils/userLookup';
import { CountryCallingCodeSelector } from '../common/CountryCallingCodeSelector';
import confetti from 'canvas-confetti';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContact?: SavedContact | null;
  onSave: (contact: Omit<SavedContact, 'id' | 'createdAt'>) => Promise<void>;
}

const ContactFormModal: React.FC<ContactModalProps> = ({
  isOpen,
  onClose,
  initialContact,
  onSave,
}) => {
  const [name, setName] = useState(initialContact?.name || '');
  const [nvId, setNvId] = useState(initialContact?.nvId || '');
  const [callingCode, setCallingCode] = useState('+233');
  const [localPhone, setLocalPhone] = useState('');
  const [preferredLang, setPreferredLang] = useState<SupportedLanguageCode>(
    initialContact?.preferredLanguage || 'en'
  );
  const [category, setCategory] = useState<'Personal' | 'Work' | 'Medical' | 'Business' | 'Family'>(
    initialContact?.category || 'Personal'
  );
  const [notes, setNotes] = useState(initialContact?.notes || '');
  const [isFavorite, setIsFavorite] = useState(initialContact?.isFavorite || false);
  const [isVerifyingNv, setIsVerifyingNv] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<Participant | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize or reset
  React.useEffect(() => {
    if (initialContact) {
      setName(initialContact.name);
      setNvId(initialContact.nvId);
      setPreferredLang(initialContact.preferredLanguage || 'en');
      setCategory(initialContact.category || 'Personal');
      setNotes(initialContact.notes || '');
      setIsFavorite(initialContact.isFavorite || false);
      if (initialContact.phone) {
        setLocalPhone(initialContact.phone);
      }
    } else {
      setName('');
      setNvId('');
      setLocalPhone('');
      setPreferredLang('en');
      setCategory('Personal');
      setNotes('');
      setIsFavorite(false);
      setVerifiedUser(null);
      setLookupError(null);
    }
  }, [initialContact, isOpen]);

  // Live NV ID verification helper
  const handleVerifyNvId = async (inputVal: string) => {
    setNvId(inputVal);
    const clean = normalizeNanivioNumber(inputVal);
    if (clean.length >= 7) {
      setIsVerifyingNv(true);
      setLookupError(null);
      try {
        const found = await lookupNanivioUser(clean);
        if (found) {
          setVerifiedUser(found);
          if (!name.trim()) setName(found.name);
          if (found.myLanguage) setPreferredLang(found.myLanguage);
        } else {
          setVerifiedUser(null);
          setLookupError('Number not registered yet (can still save as external)');
        }
      } catch {
        setVerifiedUser(null);
      } finally {
        setIsVerifyingNv(false);
      }
    } else {
      setVerifiedUser(null);
      setLookupError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !nvId.trim()) return;

    setIsSubmitting(true);
    try {
      const fullPhone = localPhone.trim()
        ? localPhone.startsWith('+')
          ? localPhone.trim()
          : `${callingCode} ${localPhone.trim()}`
        : undefined;

      const avatar =
        verifiedUser?.avatar ||
        initialContact?.avatar ||
        '';

      const initials =
        name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2) || 'NV';

      await onSave({
        name: name.trim(),
        nvId: normalizeNanivioNumber(nvId),
        phone: fullPhone,
        avatar,
        initials,
        preferredLanguage: preferredLang,
        category,
        notes: notes.trim() || undefined,
        isFavorite,
      });

      onClose();
    } catch (err) {
      console.error('Error saving contact:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0c1424] border border-slate-700/80 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {initialContact ? 'Edit Nanivio Contact' : 'Save New Nanivio Contact'}
              </h2>
              <p className="text-xs text-slate-400">
                Directory entry with permanent NV ID for quick-dial &amp; chat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Nanivio User Number */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-300">
              Nanivio User Number (NV ID) <span className="text-emerald-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="e.g. 0486482190 or NV-0486204918"
                value={nvId}
                onChange={(e) => handleVerifyNvId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-emerald-400 font-mono tracking-wider placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
              {isVerifyingNv && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-cyan-400 animate-pulse">
                  Checking directory...
                </span>
              )}
              {verifiedUser && !isVerifyingNv && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                  <Check className="w-3 h-3" />
                  Verified User
                </span>
              )}
            </div>
            {lookupError && <p className="text-[11px] text-amber-400">{lookupError}</p>}
            {verifiedUser && (
              <div className="p-2.5 bg-emerald-950/30 border border-emerald-500/20 rounded-xl flex items-center gap-2.5 text-[11px] text-emerald-200">
                <img
                  src={verifiedUser.avatar}
                  alt={verifiedUser.name}
                  className="w-7 h-7 rounded-full object-cover border border-emerald-500/40"
                />
                <div>
                  <span className="font-bold">{verifiedUser.name}</span>
                  <span className="text-slate-400 ml-1.5 font-mono">
                    (Speaks:{' '}
                    {SUPPORTED_LANGUAGES.find((l) => l.code === verifiedUser.myLanguage)?.name ||
                      verifiedUser.myLanguage}
                    )
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-300">
              Contact Full Name <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Phone Number with International Calling Code */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-300">Mobile Phone (Optional)</label>
            <div className="flex gap-2">
              <div className="w-40 shrink-0">
                <CountryCallingCodeSelector
                  selectedCallingCode={callingCode}
                  onSelect={(code) => setCallingCode(code)}
                />
              </div>
              <input
                type="tel"
                placeholder="24 412 3456"
                value={localPhone}
                onChange={(e) => setLocalPhone(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Category & Preferred Language Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block font-bold text-slate-300">Category Tag</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="Personal">Personal</option>
                <option value="Work">Work</option>
                <option value="Business">Business</option>
                <option value="Medical">Medical / Health</option>
                <option value="Family">Family</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold text-slate-300">Primary Language</label>
              <select
                value={preferredLang}
                onChange={(e) => setPreferredLang(e.target.value as SupportedLanguageCode)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.name} ({l.nativeName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-300">Relationship Notes (Optional)</label>
            <input
              type="text"
              placeholder="e.g. Export logistics manager, pediatrician, lawyer"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Favorite VIP checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="chk-fav"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-500 bg-slate-950 border-slate-700 focus:ring-emerald-500"
            />
            <label htmlFor="chk-fav" className="text-xs text-slate-300 font-medium cursor-pointer flex items-center gap-1.5">
              <Star className={`w-3.5 h-3.5 ${isFavorite ? 'text-amber-400 fill-amber-400' : 'text-slate-400'}`} />
              <span>Mark as Favorite VIP for Quick-Dial priority</span>
            </label>
          </div>

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !nvId.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold hover:scale-105 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>{initialContact ? 'Update Contact' : 'Save to Directory'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const ContactsView: React.FC = () => {
  const {
    contacts,
    addContact,
    updateContact,
    deleteContact,
    toggleFavoriteContact,
    start1on1Call,
    startDirectChatWithUser,
    setActiveTab,
  } = useNanivio();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<SavedContact | null>(null);
  const [copiedNvId, setCopiedNvId] = useState<string | null>(null);

  // Filter contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.nvId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.phone && c.phone.includes(searchTerm)) ||
        (c.notes && c.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchSearch) return false;

      if (selectedCategory === 'ALL') return true;
      if (selectedCategory === 'FAVORITES') return !!c.isFavorite;
      return c.category === selectedCategory;
    });
  }, [contacts, searchTerm, selectedCategory]);

  const favoritesCount = contacts.filter((c) => c.isFavorite).length;

  const handleCopyNv = (id: string, nvId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(nvId);
    setCopiedNvId(id);
    setTimeout(() => setCopiedNvId(null), 2000);
  };

  const handleQuickCall = (contact: SavedContact, type: 'audio' | 'video') => {
    const participant: Participant = {
      id: contact.id,
      nvId: contact.nvId,
      name: contact.name,
      avatar: contact.avatar || '',
      initials: contact.initials || 'NV',
      myLanguage: contact.preferredLanguage || 'en',
      role: 'user',
    };
    start1on1Call(participant, type);
  };

  const handleQuickChat = (contact: SavedContact) => {
    const participant: Participant = {
      id: contact.id,
      nvId: contact.nvId,
      name: contact.name,
      avatar: contact.avatar || '',
      initials: contact.initials || 'NV',
      myLanguage: contact.preferredLanguage || 'en',
      role: 'user',
    };
    startDirectChatWithUser(participant);
  };

  const handleSaveContact = async (data: Omit<SavedContact, 'id' | 'createdAt'>) => {
    if (editingContact) {
      updateContact(editingContact.id, data);
    } else {
      await addContact(data);
      try {
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
      } catch (_) {}
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Header & Quick Action */}
      <div className="bg-gradient-to-r from-[#0a1426] via-[#09182d] to-[#071324] border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <span>Nanivio Contacts &amp; Quick-Dial</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {contacts.length} Saved
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Direct lookup directory with one-click Audio, Video, and Translated Chat shortcuts
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            id="btn-add-new-contact"
            onClick={() => {
              setEditingContact(null);
              setIsModalOpen(true);
            }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs hover:scale-105 transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Contact</span>
          </button>
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-2xl p-4 shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by contact name, Nanivio Number (0486...), phone, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Quick Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none touch-pan-x w-full sm:w-auto">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedCategory === 'ALL'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              All ({contacts.length})
            </button>

            <button
              onClick={() => setSelectedCategory('FAVORITES')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                selectedCategory === 'FAVORITES'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>Favorites ({favoritesCount})</span>
            </button>

            {['Business', 'Work', 'Medical', 'Personal', 'Family'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  selectedCategory === cat
                    ? 'bg-cyan-500 text-slate-950 shadow'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contacts Cards Grid */}
      {filteredContacts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => {
            const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === contact.preferredLanguage);

            return (
              <div
                key={contact.id}
                className="bg-[#0c1424] hover:bg-[#0f192d] border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 sm:p-5 transition-all shadow-md flex flex-col justify-between space-y-4 group relative overflow-hidden"
              >
                {/* Top Row: Avatar, Name, Category & Star */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {contact.avatar ? (
                        <img
                          src={contact.avatar}
                          alt={contact.name}
                          className="w-12 h-12 rounded-2xl object-cover border border-slate-700 bg-slate-800"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-950 to-slate-900 border border-emerald-500/40 flex items-center justify-center text-sm font-bold text-emerald-400 font-mono">
                          {contact.initials || contact.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      {langObj && (
                        <span
                          className="absolute -bottom-1 -right-1 text-xs bg-slate-950 rounded-full px-1 border border-slate-800 shadow"
                          title={`Speaks ${langObj.name}`}
                        >
                          {langObj.flag}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-white truncate">{contact.name}</h3>
                      </div>
                      {contact.notes && (
                        <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{contact.notes}</p>
                      )}
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        {contact.category && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-[10px] font-medium text-cyan-300">
                            {contact.category}
                          </span>
                        )}
                        {langObj && (
                          <span className="text-[10px] text-emerald-400 font-mono">
                            {langObj.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Favorite Toggle Button */}
                  <button
                    onClick={() => toggleFavoriteContact(contact.id)}
                    className={`p-1.5 rounded-lg transition-all ${
                      contact.isFavorite
                        ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                    }`}
                    title={contact.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star className={`w-4 h-4 ${contact.isFavorite ? 'fill-amber-400' : ''}`} />
                  </button>
                </div>

                {/* Middle Row: NV User Number Pill & Phone */}
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 font-mono text-emerald-300">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold border border-emerald-500/30">
                        NV NO
                      </span>
                      <strong className="tracking-wide">{contact.nvId}</strong>
                    </div>

                    <button
                      onClick={(e) => handleCopyNv(contact.id, contact.nvId, e)}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-[10px]"
                      title="Copy Nanivio number"
                    >
                      {copiedNvId === contact.id ? (
                        <span className="text-emerald-400 flex items-center gap-1 font-sans">
                          <Check className="w-3 h-3" /> Copied
                        </span>
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {contact.phone && (
                    <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between border-t border-slate-900 pt-1">
                      <span>Tel: {contact.phone}</span>
                    </div>
                  )}
                </div>

                {/* Bottom Row: Quick-Dial Shortcuts (Audio, Video, Chat, Edit, Delete) */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    {/* Quick Audio Call */}
                    <button
                      onClick={() => handleQuickCall(contact, 'audio')}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all hover:scale-105 shadow-sm"
                      title="Quick Audio Call with Langpretation"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Call</span>
                    </button>

                    {/* Quick Video Call */}
                    <button
                      onClick={() => handleQuickCall(contact, 'video')}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all hover:scale-105 shadow-sm"
                      title="Quick Video Call with Langpretation"
                    >
                      <Video className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Video</span>
                    </button>

                    {/* Quick Direct Chat */}
                    <button
                      onClick={() => handleQuickChat(contact)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold transition-all hover:scale-105 shadow-sm"
                      title="Open Direct Chat Thread"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                      <span>Chat</span>
                    </button>
                  </div>

                  {/* Edit & Delete Controls */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingContact(contact);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Edit contact details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${contact.name} from saved contacts?`)) {
                          deleteContact(contact.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete contact"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
            <Users className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-white">No contacts found</h3>
            <p className="text-xs text-slate-400">
              {searchTerm
                ? `No saved contacts matched "${searchTerm}". Try a different keyword or Nanivio number.`
                : 'Your Nanivio directory is empty. Add other users by their NV User ID to enable fast quick-dial shortcuts.'}
            </p>
          </div>
          <button
            onClick={() => {
              setEditingContact(null);
              setIsModalOpen(true);
            }}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all inline-flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add First Contact</span>
          </button>
        </div>
      )}

      {/* Modal for Add / Edit */}
      <ContactFormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingContact(null);
        }}
        initialContact={editingContact}
        onSave={handleSaveContact}
      />
    </div>
  );
};

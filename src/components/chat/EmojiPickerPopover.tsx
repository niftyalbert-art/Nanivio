import React, { useState, useMemo } from 'react';
import {
  Smile,
  Search,
  X,
  Flame,
  Globe,
  Car,
  CreditCard,
  Utensils,
  Heart,
  Sparkles,
} from 'lucide-react';

interface EmojiItem {
  char: string;
  name: string;
  category: 'quick' | 'smileys' | 'gestures' | 'flags' | 'places' | 'tech' | 'food';
}

const EMOJI_DATABASE: EmojiItem[] = [
  // Quick / Trending Reactions
  { char: '❤️', name: 'red heart love', category: 'quick' },
  { char: '👍', name: 'thumbs up agree', category: 'quick' },
  { char: '😂', name: 'face with tears of joy laugh', category: 'quick' },
  { char: '🔥', name: 'fire lit hot', category: 'quick' },
  { char: '🚀', name: 'rocket ship fast launch', category: 'quick' },
  { char: '🇬🇭', name: 'ghana flag accra west africa', category: 'quick' },
  { char: '👏', name: 'clapping hands applause', category: 'quick' },
  { char: '💯', name: 'hundred points perfect 100', category: 'quick' },
  { char: '✨', name: 'sparkles clean magic', category: 'quick' },
  { char: '🤝', name: 'handshake deal agreement', category: 'quick' },
  { char: '🎉', name: 'party popper celebrate', category: 'quick' },
  { char: '🙏', name: 'folded hands pray thank you', category: 'quick' },

  // Smileys & Emotions
  { char: '😀', name: 'grinning face smile happy', category: 'smileys' },
  { char: '😃', name: 'smiling face with open mouth', category: 'smileys' },
  { char: '😄', name: 'smiling face with open mouth and smiling eyes', category: 'smileys' },
  { char: '😁', name: 'beaming face with smiling eyes', category: 'smileys' },
  { char: '😆', name: 'grinning squinting face laugh', category: 'smileys' },
  { char: '😅', name: 'grinning face with sweat relief', category: 'smileys' },
  { char: '🤣', name: 'rolling on the floor laughing', category: 'smileys' },
  { char: '😂', name: 'face with tears of joy', category: 'smileys' },
  { char: '🙂', name: 'slightly smiling face pleasant', category: 'smileys' },
  { char: '🙃', name: 'upside-down face playful', category: 'smileys' },
  { char: '😉', name: 'winking face playful', category: 'smileys' },
  { char: '😊', name: 'smiling face with smiling eyes blush', category: 'smileys' },
  { char: '😇', name: 'smiling face with halo angel innocent', category: 'smileys' },
  { char: '🥰', name: 'smiling face with hearts adore', category: 'smileys' },
  { char: '😍', name: 'heart eyes love enamored', category: 'smileys' },
  { char: '🤩', name: 'star-struck excited amazing', category: 'smileys' },
  { char: '😘', name: 'face blowing a kiss love', category: 'smileys' },
  { char: '😋', name: 'face savoring food delicious yum', category: 'smileys' },
  { char: '😛', name: 'face with tongue out playful', category: 'smileys' },
  { char: '😜', name: 'winking face with tongue crazy funny', category: 'smileys' },
  { char: '🤪', name: 'zany face wild goofy', category: 'smileys' },
  { char: '🤑', name: 'money-mouth face rich cash profit', category: 'smileys' },
  { char: '🤗', name: 'smiling face with open hands hug warmth', category: 'smileys' },
  { char: '🤔', name: 'thinking face wondering hmm pondering', category: 'smileys' },
  { char: '🤫', name: 'shushing face quiet secret silence', category: 'smileys' },
  { char: '🤐', name: 'zipper-mouth face secret locked', category: 'smileys' },
  { char: '🤨', name: 'face with raised eyebrow suspicious skeptical', category: 'smileys' },
  { char: '😎', name: 'smiling face with sunglasses cool boss', category: 'smileys' },
  { char: '🤓', name: 'nerd face smart geek tech', category: 'smileys' },
  { char: '🧐', name: 'face with monocle examining inspecting', category: 'smileys' },
  { char: '🥳', name: 'partying face celebrate horn confetti', category: 'smileys' },
  { char: '😴', name: 'sleeping face tired goodnight zzz', category: 'smileys' },
  { char: '🤯', name: 'exploding head mind blown wow', category: 'smileys' },

  // Gestures & People
  { char: '👋', name: 'waving hand hello goodbye', category: 'gestures' },
  { char: '🤚', name: 'raised back of hand stop', category: 'gestures' },
  { char: '🖐️', name: 'hand with fingers splayed five', category: 'gestures' },
  { char: '✋', name: 'raised hand stop high five', category: 'gestures' },
  { char: '👌', name: 'ok hand perfect ok good', category: 'gestures' },
  { char: '🤌', name: 'pinched fingers italian what do you want', category: 'gestures' },
  { char: '✌️', name: 'victory hand peace two', category: 'gestures' },
  { char: '🤞', name: 'crossed fingers good luck hope', category: 'gestures' },
  { char: '🫰', name: 'hand with index finger and thumb crossed finger heart', category: 'gestures' },
  { char: '🤟', name: 'love-you gesture rock on', category: 'gestures' },
  { char: '🤘', name: 'sign of the horns rock metal', category: 'gestures' },
  { char: '🤙', name: 'call me hand phone shaka', category: 'gestures' },
  { char: '👍', name: 'thumbs up like approve yes', category: 'gestures' },
  { char: '👎', name: 'thumbs down dislike no', category: 'gestures' },
  { char: '👊', name: 'oncoming fist fist bump power', category: 'gestures' },
  { char: '👏', name: 'clapping hands applause bravo', category: 'gestures' },
  { char: '🙌', name: 'raising hands praise celebration', category: 'gestures' },
  { char: '🫶', name: 'heart hands love care', category: 'gestures' },
  { char: '🤝', name: 'handshake deal contract partner', category: 'gestures' },
  { char: '🙏', name: 'folded hands pray thank respect', category: 'gestures' },
  { char: '💪', name: 'flexed biceps strong muscle power', category: 'gestures' },

  // Flags (Pan-African & Global)
  { char: '🇬🇭', name: 'ghana accra gold coast kente black star', category: 'flags' },
  { char: '🇳🇬', name: 'nigeria abuja lagos naija', category: 'flags' },
  { char: '🇰🇪', name: 'kenya nairobi east africa', category: 'flags' },
  { char: '🇿🇦', name: 'south africa johannesburg cape town', category: 'flags' },
  { char: '🇨🇮', name: 'cote divoire ivory coast abidjan', category: 'flags' },
  { char: '🇸🇳', name: 'senegal dakar', category: 'flags' },
  { char: '🇪🇬', name: 'egypt cairo pyramids', category: 'flags' },
  { char: '🇲🇦', name: 'morocco rabat casablanca', category: 'flags' },
  { char: '🇺🇸', name: 'united states america usa', category: 'flags' },
  { char: '🇬🇧', name: 'united kingdom uk britain london', category: 'flags' },
  { char: '🇨🇦', name: 'canada ottawa toronto', category: 'flags' },
  { char: '🇫🇷', name: 'france paris french', category: 'flags' },
  { char: '🇩🇪', name: 'germany berlin deutschland', category: 'flags' },
  { char: '🇨🇳', name: 'china beijing shanghai', category: 'flags' },
  { char: '🇯🇵', name: 'japan tokyo', category: 'flags' },
  { char: '🇦🇪', name: 'united arab emirates uae dubai', category: 'flags' },
  { char: '🌐', name: 'globe with meridians internet world global network', category: 'flags' },

  // Travel, Cars & Places (Nanivio Drive Theme)
  { char: '🚗', name: 'automobile car vehicle ride trip drive', category: 'places' },
  { char: '🚕', name: 'taxi cab ride hailing trip', category: 'places' },
  { char: '🚙', name: 'sport utility vehicle suv prado 4x4', category: 'places' },
  { char: '🚌', name: 'bus trotro transport', category: 'places' },
  { char: '🏎️', name: 'racing car speed fast luxury', category: 'places' },
  { char: '🚓', name: 'police car security', category: 'places' },
  { char: '🚑', name: 'ambulance emergency hospital clinic', category: 'places' },
  { char: '✈️', name: 'airplane flight kotoka airport transfer', category: 'places' },
  { char: '🛫', name: 'airplane departure takeoff travel', category: 'places' },
  { char: '🛬', name: 'airplane arrival landing', category: 'places' },
  { char: '🏢', name: 'office building tower headquarters nanivio ghana', category: 'places' },
  { char: '🏥', name: 'hospital clinic medical healthcare', category: 'places' },
  { char: '🏦', name: 'bank momo financial exchange gcb ecobank', category: 'places' },
  { char: '🏪', name: 'convenience store shop supermarket provisions', category: 'places' },
  { char: '🏬', name: 'department store mall accra plaza', category: 'places' },
  { char: '🏖️', name: 'beach with umbrella resort labadi coast', category: 'places' },
  { char: '📍', name: 'round pushpin location map gps pin spot', category: 'places' },
  { char: '🗺️', name: 'world map navigation route', category: 'places' },

  // Tech, Business & Objects
  { char: '💻', name: 'laptop computer tech coding ai developer', category: 'tech' },
  { char: '📱', name: 'mobile phone smartphone calling message', category: 'tech' },
  { char: '💳', name: 'credit card payment debit visa momo fintech', category: 'tech' },
  { char: '💰', name: 'money bag cash wealth ghs usd funds', category: 'tech' },
  { char: '🪙', name: 'coin currency gold pesewa', category: 'tech' },
  { char: '💎', name: 'gem stone diamond premium vip luxury', category: 'tech' },
  { char: '⚖️', name: 'balance scale law legal attorney barrister justice', category: 'tech' },
  { char: '🔒', name: 'locked padlock security encrypted privacy safe', category: 'tech' },
  { char: '🔑', name: 'key security rental access password', category: 'tech' },
  { char: '🛡️', name: 'shield protection secure verified safety', category: 'tech' },
  { char: '📞', name: 'telephone receiver call contact phone line', category: 'tech' },
  { char: '💡', name: 'light bulb idea innovation solution energy', category: 'tech' },
  { char: '⚡', name: 'high voltage lightning bolt fast instant power', category: 'tech' },
  { char: '🏆', name: 'trophy champion award victory best', category: 'tech' },

  // Food & Drinks
  { char: '🍗', name: 'poultry leg fried chicken meat food', category: 'food' },
  { char: '🥩', name: 'cut of meat beef steak chops', category: 'food' },
  { char: '🍔', name: 'hamburger fast food burger', category: 'food' },
  { char: '🍕', name: 'pizza slice italian food', category: 'food' },
  { char: '🍲', name: 'pot of food stew jollof soup ghanaian', category: 'food' },
  { char: '🍚', name: 'cooked rice jollof fried rice grain', category: 'food' },
  { char: '☕', name: 'hot beverage coffee tea morning breakfast', category: 'food' },
  { char: '🥤', name: 'cup with straw drink soda juice beverage', category: 'food' },
  { char: '🍉', name: 'watermelon fruit fresh sweet', category: 'food' },
  { char: '🍍', name: 'pineapple tropical sweet juicy', category: 'food' },
  { char: '🥥', name: 'coconut tropical beach refreshing water', category: 'food' },
];

const CATEGORY_TABS = [
  { id: 'all', label: 'All', icon: Sparkles },
  { id: 'quick', label: 'Quick', icon: Flame },
  { id: 'smileys', label: 'Smileys', icon: Smile },
  { id: 'gestures', label: 'Hands', icon: Heart },
  { id: 'flags', label: 'Flags', icon: Globe },
  { id: 'places', label: 'Drive', icon: Car },
  { id: 'tech', label: 'Tech & Fin', icon: CreditCard },
  { id: 'food', label: 'Food', icon: Utensils },
];

interface EmojiPickerPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
}

export const EmojiPickerPopover: React.FC<EmojiPickerPopoverProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');

  const filteredEmojis = useMemo(() => {
    let list = EMOJI_DATABASE;
    if (activeTab !== 'all') {
      list = list.filter((e) => e.category === activeTab);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((e) => e.name.toLowerCase().includes(q) || e.char.includes(q));
    }
    return list;
  }, [activeTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      id="emoji-picker-panel"
      className="absolute bottom-16 left-3 sm:left-4 z-40 w-[92vw] sm:w-80 max-w-sm rounded-3xl bg-[#09101f] border border-slate-700/80 shadow-2xl shadow-black/80 backdrop-blur-md overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      {/* Header with Search and Close */}
      <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search emojis (ghana, love, car, money...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
            className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-slate-400 hover:text-white text-xs"
            >
              ×
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          title="Close emoji tray"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Categories Bar */}
      <div className="flex items-center gap-1 p-1.5 bg-slate-950/60 border-b border-slate-800/80 overflow-x-auto no-scrollbar text-xs">
        {CATEGORY_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSearchQuery('');
              }}
              className={`px-2.5 py-1 rounded-xl font-bold flex items-center gap-1.5 shrink-0 transition-all text-[11px] ${
                isActive
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Quick Trending Bar */}
      {!searchQuery && activeTab === 'all' && (
        <div className="px-3 pt-2.5 pb-1">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
            Quick Expressions &amp; Ghana Vibes:
          </span>
          <div className="flex items-center justify-between gap-1 p-1.5 bg-slate-900/60 border border-slate-800 rounded-2xl">
            {EMOJI_DATABASE.slice(0, 8).map((em, idx) => (
              <button
                key={idx}
                onClick={() => {
                  onSelectEmoji(em.char);
                }}
                className="w-8 h-8 flex items-center justify-center text-lg hover:scale-125 transition-transform rounded-xl hover:bg-slate-800/80 cursor-pointer"
                title={em.name}
              >
                {em.char}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Emoji Grid Area */}
      <div className="p-3 max-h-56 overflow-y-auto grid grid-cols-7 sm:grid-cols-8 gap-1.5">
        {filteredEmojis.map((em, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectEmoji(em.char)}
            className="w-9 h-9 flex items-center justify-center text-xl hover:scale-125 active:scale-95 transition-transform rounded-xl hover:bg-slate-800/90 text-center cursor-pointer select-none"
            title={em.name}
          >
            {em.char}
          </button>
        ))}

        {filteredEmojis.length === 0 && (
          <div className="col-span-full py-8 text-center text-xs text-slate-500">
            No emojis found matching "{searchQuery}"
          </div>
        )}
      </div>

      {/* Bottom Footer Tip */}
      <div className="px-3 py-1.5 bg-slate-950 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between font-mono">
        <span>Click any emoji to insert into chat</span>
        <span className="text-emerald-400">✨ Nanivio Modern Suite</span>
      </div>
    </div>
  );
};

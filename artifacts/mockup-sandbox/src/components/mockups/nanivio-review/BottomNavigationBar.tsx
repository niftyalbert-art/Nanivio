import React, { useRef, useEffect, useState } from 'react';
import {
  Globe,
  MessageSquare,
  PhoneCall,
  Users,
  Fingerprint,
  User,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Bot,
  CreditCard,
  MoreHorizontal,
} from 'lucide-react';
import { useNanivio } from './NanivioContext';

export const BottomNavigationBar: React.FC = () => {
  const { activeTab, setActiveTab, callLogs, conversations } = useNanivio();
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!showMore) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !navRef.current?.contains(target)) setShowMore(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMore(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showMore]);

  // Auto-scroll active tab into view inside the bottom bar if it is partially offscreen on small phones
  useEffect(() => {
    if (navScrollRef.current) {
      const activeEl = navScrollRef.current.querySelector(`#nav-tab-${activeTab}`) as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activeTab]);

  // Determine indicator status for calls:
  // User requirement: Notification dot MUST ONLY appear when there is a missed call.
  const missedCalls = callLogs.filter((l) => l.direction === 'missed');
  const hasMissedCall = missedCalls.length > 0;

  // Determine indicator status for chat:
  const unreadChatCount = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId as any);
    setShowMore(false);
  };

  // Section 24: Navigation simplified around communication-first identity
  // Primary navigation: Home, Chat, Calls, Contacts, NV Number, Account (plus Malvi AI & Admin)
  const navItems = [
    {
      id: 'home',
      mobileLabel: 'Home',
      desktopLabel: 'Home',
      icon: Globe,
      color: 'emerald',
      activeClass: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/20',
      iconClass: 'text-emerald-400',
    },
    {
      id: 'chat',
      mobileLabel: 'Chat',
      desktopLabel: 'Chat',
      icon: MessageSquare,
      color: 'emerald',
      activeClass: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/20',
      iconClass: 'text-emerald-400',
      indicator: unreadChatCount > 0 ? 'red' : null,
      indicatorCount: unreadChatCount > 0 ? unreadChatCount : null,
    },
    {
      id: 'calls',
      mobileLabel: 'Calls',
      desktopLabel: 'Calls',
      icon: PhoneCall,
      color: 'emerald',
      activeClass: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/20',
      iconClass: 'text-emerald-400',
      indicator: hasMissedCall ? 'red' : null,
      indicatorCount: hasMissedCall ? missedCalls.length : null,
    },
    {
      id: 'contacts',
      mobileLabel: 'Contacts',
      desktopLabel: 'Contacts',
      icon: Users,
      color: 'emerald',
      activeClass: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/20',
      iconClass: 'text-emerald-400',
    },
    {
      id: 'nvnumber',
      mobileLabel: 'NV ID',
      desktopLabel: 'NV Number',
      icon: Fingerprint,
      color: 'cyan',
      activeClass: 'bg-cyan-500/25 text-cyan-300 border-cyan-500/50 shadow-md shadow-cyan-500/20',
      iconClass: 'text-cyan-400',
    },
    {
      id: 'malvi',
      mobileLabel: 'Malvi AI',
      desktopLabel: 'Malvi AI',
      icon: Bot,
      color: 'cyan',
      activeClass: 'bg-gradient-to-r from-cyan-500/30 to-teal-500/30 text-cyan-300 border-cyan-400/60 shadow-md shadow-cyan-500/20',
      iconClass: 'text-cyan-400',
    },
    {
      id: 'billing',
      mobileLabel: 'Billing',
      desktopLabel: 'Billing & Meter',
      icon: CreditCard,
      color: 'emerald',
      activeClass: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/20',
      iconClass: 'text-emerald-400',
    },
    {
      id: 'services',
      mobileLabel: 'Services',
      desktopLabel: 'Services',
      icon: Sparkles,
      color: 'amber',
      activeClass: 'bg-amber-500/25 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/20',
      iconClass: 'text-amber-400',
    },
    {
      id: 'account',
      mobileLabel: 'Account',
      desktopLabel: 'Account',
      icon: User,
      color: 'slate',
      activeClass: 'bg-slate-700/80 text-white border-slate-500/60 shadow-md',
      iconClass: 'text-slate-200',
    },
  ];

  const handleScrollLeft = () => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollBy({ left: -140, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollBy({ left: 140, behavior: 'smooth' });
    }
  };

  return (
    <nav
      ref={navRef}
      id="nanivio-bottom-navigation"
      aria-label="Bottom Navigation"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-[#d9d4c8] bg-[#fbf9f2] pb-1 sm:pb-2 pt-1 select-none max-w-full overflow-visible"
    >
      {/* Mobile Dedicated Drag Bar & Indicator */}
      <div className="w-full flex items-center justify-center sm:hidden pb-0.5">
        <div className="w-9 h-1 bg-[#c7d5cb] rounded-full" />
      </div>

      <div className="max-w-6xl mx-auto px-1 sm:px-4 relative flex items-center">
        {/* Left Scroll Assist Arrow (Mobile/Small Screen) */}
        <button
          onClick={handleScrollLeft}
          className="hidden sm:hidden p-1 text-slate-500 hover:text-slate-200 shrink-0"
          aria-label="Scroll navigation left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Primary destinations stay visible; less-used destinations live under More. */}
        <div
          ref={navScrollRef}
          className="flex items-center justify-around sm:justify-center gap-1 sm:gap-3 overflow-x-auto scrollbar-none touch-pan-x snap-x snap-mandatory w-full px-1 py-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {navItems.filter((item) => ['home', 'chat', 'calls', 'contacts'].includes(item.id)).map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => handleTabClick(item.id)}
                className={`shrink-0 group flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl text-[12px] sm:text-[13px] font-bold transition-all border min-w-[52px] sm:min-w-0 min-h-[48px] snap-center active:scale-95 touch-manipulation cursor-pointer select-none ${
                   isActive
                    ? 'bg-[#174e3c] text-white border-[#174e3c] shadow-sm scale-105 sm:scale-100'
                      : 'border-transparent text-[#68736d] hover:text-[#18231f] hover:bg-[#f0ece2]'
                }`}
                title={item.desktopLabel}
              >
                <div className="relative shrink-0 flex items-center justify-center">
                  {Icon && (
                    <Icon
                      className={`w-5 h-5 shrink-0 transition-transform ${
                         isActive ? 'text-[#e5b84e]' : 'text-[#8a9087] group-hover:text-[#174e3c]'
                      }`}
                    />
                  )}
                    {/* Status Indicator Light (Green Pulse / Red Missed Call / None) */}
                    {item.indicator === 'green-pulse' && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-sm shadow-emerald-400"></span>
                      </span>
                    )}
                    {item.indicator === 'green' && (
                        <span className="absolute -top-0.5 -right-0.5 inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-white"></span>
                    )}
                    {item.indicator === 'red' && (
                        <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-rose-600 ring-2 ring-white text-[10px] text-white font-bold">
                        {item.indicatorCount && item.indicatorCount > 0 ? (item.indicatorCount > 9 ? '9+' : item.indicatorCount) : '!'}
                      </span>
                    )}
                  </div>
                <span className="leading-tight whitespace-nowrap">
                  <span className="sm:hidden">{item.mobileLabel}</span>
                  <span className="hidden sm:inline">{item.desktopLabel}</span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            aria-expanded={showMore}
            aria-haspopup="menu"
            onClick={() => setShowMore((value) => !value)}
            className={`relative shrink-0 group flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl text-[12px] sm:text-[13px] font-bold transition-all border min-w-[52px] sm:min-w-0 min-h-[48px] cursor-pointer ${
              showMore || (!['home', 'chat', 'calls', 'contacts'].includes(activeTab))
                ? 'bg-[#174e3c] text-white border-[#174e3c]'
                : 'border-transparent text-[#68736d] hover:text-[#18231f] hover:bg-[#f0ece2]'
            }`}
          >
            <MoreHorizontal className={`w-5 h-5 ${showMore ? 'text-[#e5b84e]' : 'text-[#8a9087]'}`} />
            <span>More</span>
          </button>
        </div>

        {showMore && (
          <div role="menu" aria-label="More destinations" className="absolute bottom-full right-3 mb-2 w-56 max-w-[calc(100vw-1rem)] max-h-[min(22rem,60dvh)] overflow-y-auto rounded-2xl border border-[#d9d4c8] bg-[#fbf9f2] p-1.5 shadow-[0_12px_36px_rgba(24,35,31,.18)]">
            {navItems.filter((item) => !['home', 'chat', 'calls', 'contacts'].includes(item.id)).map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  type="button"
                  role="menuitem"
                  key={item.id}
                  onClick={() => { handleTabClick(item.id); setShowMore(false); }}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${
                    isActive ? 'bg-[#174e3c] text-white' : 'text-[#34443a] hover:bg-[#f0ece2]'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-[#e5b84e]' : 'text-[#65736a]'}`} />
                  <span className="flex-1">{item.desktopLabel}</span>
                  {item.id === 'chat' && unreadChatCount > 0 && <span>{unreadChatCount}</span>}
                </button>
              );
            })}
          </div>
        )}
        {/* Right Scroll Assist Arrow (Mobile/Small Screen) */}
        <button
          onClick={handleScrollRight}
          className="hidden sm:hidden p-1 text-slate-500 hover:text-slate-200 shrink-0"
          aria-label="Scroll navigation right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

    </nav>
  );
};

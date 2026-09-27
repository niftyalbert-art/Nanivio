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
} from 'lucide-react';
import { useNanivio } from '../context/NanivioContext';
import { MissedCallsModal } from './calls/MissedCallsModal';

export const BottomNavigationBar: React.FC = () => {
  const { activeTab, setActiveTab, activeCall, incomingCall, callLogs, conversations, adminFeatures } = useNanivio();
  const navScrollRef = useRef<HTMLDivElement | null>(null);
  const [showMissedModal, setShowMissedModal] = useState(false);

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
  const hasChatActivity = conversations.length > 0;

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId as any);
    if (tabId === 'calls' && hasMissedCall) {
      setShowMissedModal(true);
    }
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
      indicator: unreadChatCount > 0 ? 'red' : hasChatActivity ? 'green' : null,
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
      id="nanivio-bottom-navigation"
      aria-label="Bottom Navigation"
      className="fixed bottom-0 inset-x-0 z-40 bg-[#070d18]/95 backdrop-blur-xl border-t border-slate-800/90 shadow-2xl pb-1 sm:pb-2 pt-1 select-none max-w-full overflow-hidden"
    >
      {/* Mobile Dedicated Drag Bar & Indicator */}
      <div className="w-full flex items-center justify-center sm:hidden pb-0.5">
        <div className="w-9 h-1 bg-slate-700/80 rounded-full" />
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

        {/* Scrollable Nav Track */}
        <div
          ref={navScrollRef}
          className="flex items-center justify-around sm:justify-center gap-1 sm:gap-2 overflow-x-auto scrollbar-none touch-pan-x snap-x snap-mandatory w-full px-1 py-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => handleTabClick(item.id)}
                className={`shrink-0 group flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl text-[10px] sm:text-xs font-bold transition-all border min-w-[48px] sm:min-w-0 min-h-[46px] snap-center active:scale-95 touch-manipulation cursor-pointer select-none ${
                  isActive
                    ? `${item.activeClass} border scale-105 sm:scale-100`
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
                title={item.desktopLabel}
              >
                <div className="relative shrink-0 flex items-center justify-center">
                  {Icon && (
                    <Icon
                      className={`w-4 h-4 sm:w-4 sm:h-4 shrink-0 transition-transform ${
                        isActive ? item.iconClass : 'text-slate-400 group-hover:text-slate-200'
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
                      <span className="absolute -top-0.5 -right-0.5 inline-flex rounded-full h-2 w-2 bg-emerald-400 ring-2 ring-[#070d18] shadow-sm shadow-emerald-400/80"></span>
                    )}
                    {item.indicator === 'red' && (
                      <span className="absolute -top-1 -right-1 flex items-center justify-center h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#070d18] shadow-sm shadow-rose-500/80">
                        {item.indicatorCount && item.indicatorCount > 0 && (
                          <span className="text-[7px] text-white font-bold">{item.indicatorCount > 9 ? '9+' : item.indicatorCount}</span>
                        )}
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
        </div>

        {/* Right Scroll Assist Arrow (Mobile/Small Screen) */}
        <button
          onClick={handleScrollRight}
          className="hidden sm:hidden p-1 text-slate-500 hover:text-slate-200 shrink-0"
          aria-label="Scroll navigation right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Missed Calls Details Overlay */}
      <MissedCallsModal
        isOpen={showMissedModal}
        onClose={() => setShowMissedModal(false)}
      />
    </nav>
  );
};

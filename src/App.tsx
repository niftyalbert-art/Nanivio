import React, { useState, useCallback } from 'react';
import { NanivioProvider, useNanivio } from './context/NanivioContext';
import { OpeningAnimation } from './components/OpeningAnimation';
import { NanivioCelebrationVideoEffect } from './components/common/NanivioCelebrationVideoEffect';
import { NanivioAuthScreen } from './components/auth/NanivioAuthScreen';
import { Navbar } from './components/Navbar';
import { BottomNavigationBar } from './components/BottomNavigationBar';
import { LanguageSelectorModal } from './components/LanguageSelectorModal';
import { NewUserInstallPrompt } from './components/common/NewUserInstallPrompt';
import { ActiveCallModal } from './components/calls/ActiveCallModal';
import { IncomingCallBanner } from './components/calls/IncomingCallBanner';
import { ChatToastNotification } from './components/chat/ChatToastNotification';
import { ChatView } from './components/chat/ChatView';
import { CallsView } from './components/calls/CallsView';
import { ContactsView } from './components/contacts/ContactsView';
import { ServicesView } from './components/services/ServicesView';
import { AccountView } from './components/account/AccountView';
import { AdminControlCenter } from './components/admin/AdminControlCenter';
import { UniversalBillingHub } from './components/billing/UniversalBillingHub';
import { HomeView } from './components/home/HomeView';
import { NVNumberView } from './components/nvnumber/NVNumberView';
import { NanivioRidePreview } from './components/ride/NanivioRidePreview';
import { MalviView } from './components/malvi/MalviView';
import { MalviFloatingWidget } from './components/malvi/MalviFloatingWidget';
import { ErrorBoundary } from './components/common/ErrorBoundary';

const MainLayout: React.FC = () => {
  const { activeTab, incomingCall, acceptIncomingCall, declineIncomingCall } = useNanivio();

  return (
    <div className="min-h-screen bg-[#070d18] text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200 w-full max-w-full overflow-x-hidden relative">
      <Navbar />

      {/* Real-time Incoming Call Banner Overlay */}
      {incomingCall && (
        <IncomingCallBanner
          caller={incomingCall.caller}
          callType={incomingCall.callType}
          onAccept={() => acceptIncomingCall(incomingCall.callId)}
          onDecline={() => declineIncomingCall(incomingCall.callId)}
        />
      )}

      <main className="flex-1 pb-24 sm:pb-28 w-full max-w-full overflow-x-hidden">
        <ErrorBoundary
          key={activeTab}
          fallbackTitle={`Nanivio ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Workspace`}
        >
          {activeTab === 'home' && <HomeView />}
          {activeTab === 'chat' && <ChatView />}
          {activeTab === 'calls' && <CallsView />}
          {activeTab === 'contacts' && <ContactsView />}
          {activeTab === 'nvnumber' && <NVNumberView />}
          {activeTab === 'ride' && <NanivioRidePreview />}
          {activeTab === 'services' && <ServicesView />}
          {activeTab === 'billing' && <UniversalBillingHub />}
          {activeTab === 'account' && <AccountView />}
          {activeTab === 'admin' && <AdminControlCenter />}
          {activeTab === 'malvi' && <MalviView />}
        </ErrorBoundary>
      </main>

      {/* Malvi AI Floating Assistant Widget */}
      <MalviFloatingWidget />

      {/* Bottom Unified Navigation Bar */}
      <BottomNavigationBar />

      {/* Global Modals */}
      <ChatToastNotification />
      <ActiveCallModal />
      <LanguageSelectorModal />
      <NewUserInstallPrompt />
    </div>
  );
};

const AppOrchestrator: React.FC = () => {
  const {
    isAuthenticated,
    isAuthModalOpen,
    setIsAuthModalOpen,
    activeCelebrationEffect,
    clearCelebrationEffect,
  } = useNanivio();
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname === '/admin';

  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      const seen = typeof window !== 'undefined' ? sessionStorage?.getItem('nanivio_intro_seen') : 'true';
      return !seen;
    } catch {
      return false;
    }
  });

  const handleIntroComplete = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage?.setItem('nanivio_intro_seen', 'true');
      }
    } catch {}
    setShowIntro(false);
  }, []);

  // Phase 1: Nanivio Signature Opening Effect
  if (showIntro) {
    return <OpeningAnimation onComplete={handleIntroComplete} />;
  }

  // Phase 2: Active Cinematic Video Celebration for Sign In / Sign Up
  if (activeCelebrationEffect?.show) {
    return (
      <NanivioCelebrationVideoEffect
        mode={activeCelebrationEffect.mode}
        onComplete={clearCelebrationEffect}
        autoCloseDuration={3300}
      />
    );
  }

  // Protected Super Admin Gateway
  if (isAdminRoute && !isAuthenticated) {
    return (
      <>
        <NanivioAuthScreen onSuccess={() => setIsAuthModalOpen(false)} />
        <NewUserInstallPrompt />
      </>
    );
  }

  // Phase 3: Nanivio Authentication & Identity Entry
  if (!isAuthenticated) {
    return (
      <>
        <NanivioAuthScreen onSuccess={() => setIsAuthModalOpen(false)} />
        <NewUserInstallPrompt />
      </>
    );
  }

  // Phase 3: Main Nanivio Application (with modal support for switching identities)
  return (
    <>
      <MainLayout />
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md">
          <div className="min-h-screen relative flex flex-col justify-center">
            <button
              onClick={() => setIsAuthModalOpen(false)}
              className="absolute top-6 right-6 z-50 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-bold shadow-lg"
            >
              âœ• Close Switcher
            </button>
            <NanivioAuthScreen onSuccess={() => setIsAuthModalOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
};

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="Nanivio Platform Experience">
      <NanivioProvider>
        <AppOrchestrator />
      </NanivioProvider>
    </ErrorBoundary>
  );
}


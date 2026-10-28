import React from 'react';
import { NanivioProvider, useNanivio } from './context/NanivioContext';
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
import { MalviLiveAssistantProvider } from './components/malvi/MalviLiveAssistant';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { NanivioLandingPage } from './components/landing/NanivioLandingPage';

const MainLayout: React.FC = () => {
  const { activeTab, incomingCall, acceptIncomingCall, declineIncomingCall } = useNanivio();

  return (
    <MalviLiveAssistantProvider>
    <div className={`nanivio-app nv-theme-dark ${activeTab === 'chat' ? 'chat-app-shell h-[100dvh] max-h-[100dvh]' : 'min-h-[100dvh]'} flex flex-col selection:bg-amber-200 selection:text-slate-900 w-full max-w-full overflow-x-hidden relative`}>
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

      <main className={`nanivio-main ${activeTab === 'chat' ? 'chat-main flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'flex-1 pb-24 sm:pb-28'} w-full max-w-full overflow-x-hidden`}>
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
    </MalviLiveAssistantProvider>
  );
};

const AppOrchestrator: React.FC = () => {
  const {
    isAuthenticated,
    isAuthModalOpen,
    setIsAuthModalOpen,
    activeCelebrationEffect,
    clearCelebrationEffect,
    setAuthMode,
  } = useNanivio();
  const [showPublicAuth, setShowPublicAuth] = React.useState(false);
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname === '/admin';

  // The signature belongs only to a successful authentication, never app startup.
  if (isAuthenticated && activeCelebrationEffect?.show) {
    return (
      <NanivioCelebrationVideoEffect
        mode={activeCelebrationEffect.mode}
        onComplete={clearCelebrationEffect}
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
    if (!showPublicAuth) {
      return (
        <NanivioLandingPage
          onSignIn={() => {
            setAuthMode('signin');
            setShowPublicAuth(true);
            window.scrollTo(0, 0);
          }}
          onGetStarted={() => {
            setAuthMode('personal');
            setShowPublicAuth(true);
            window.scrollTo(0, 0);
          }}
        />
      );
    }
    return (
      <>
        <div className="bg-[#121417] px-5 py-3">
          <button
            type="button"
            onClick={() => setShowPublicAuth(false)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-[#e2bb62] hover:bg-[#202329] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e2bb62]"
          >
            <span aria-hidden="true">←</span> Back to Nanivio
          </button>
        </div>
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


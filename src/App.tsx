import React from 'react';
import { AccountDeletionPage } from './components/settings/AccountDeletionRequest';
import { PasswordResetPage } from './components/auth/PasswordResetPage';
import { NanivioProvider, useNanivio } from './context/NanivioContext';
import { NanivioCelebrationVideoEffect } from './components/common/NanivioCelebrationVideoEffect';
import { prepareNanivioSignature } from './lib/nanivioSignatureMedia';
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
import { BillingPaymentConfirmation } from './components/billing/BillingPaymentConfirmation';

const MainLayout: React.FC = () => {
  const { activeTab, incomingCall, acceptIncomingCall, declineIncomingCall, isAdmin, authUser, refreshBilling, setActiveTab, setPendingBillingAction } = useNanivio();
  const adminWorkspace = isAdmin && activeTab === 'admin';

  return (
    <MalviLiveAssistantProvider>
    <div className={`nanivio-app nv-theme-dark ${activeTab === 'chat' || activeTab === 'home' ? 'chat-app-shell h-[100dvh] max-h-[100dvh]' : 'min-h-[100dvh]'} flex flex-col selection:bg-amber-200 selection:text-slate-900 w-full max-w-full overflow-x-hidden relative`}>
      {!adminWorkspace && <Navbar compact={activeTab==='chat'} />}

      {/* Real-time Incoming Call Banner Overlay */}
      {incomingCall && (
        <IncomingCallBanner
          caller={incomingCall.caller}
          callType={incomingCall.callType}
          onAccept={() => acceptIncomingCall(incomingCall.callId)}
          onDecline={() => declineIncomingCall(incomingCall.callId)}
        />
      )}

      <main className={`nanivio-main ${adminWorkspace ? 'flex-1' : activeTab === 'chat' ? 'chat-main flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : activeTab === 'home' ? 'home-main flex min-h-0 flex-1 overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'flex-1 pb-24 sm:pb-28'} w-full max-w-full overflow-x-hidden`}>
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
      {!adminWorkspace && <MalviFloatingWidget />}

      {/* Bottom Unified Navigation Bar */}
      {!adminWorkspace && <BottomNavigationBar />}

      {/* Global Modals */}
      <ChatToastNotification />
      <BillingPaymentConfirmation key={authUser?.id || 'signed-out'} owner={authUser?.id || ''} refresh={refreshBilling} onViewBilling={purpose => {
        setPendingBillingAction({ purpose: purpose as any, subTab: purpose === 'MALVI_SUBSCRIPTION' ? 'malvi' : purpose === 'SUBSCRIPTION' ? 'plans' : 'overview' });
        setActiveTab('billing');
      }}/>
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
  } = useNanivio();
  const [socialCallbackPending, setSocialCallbackPending] = React.useState(() => typeof window !== 'undefined' && window.location.pathname === '/auth/callback');
  const isAdminRoute = typeof window !== 'undefined' && window.location.pathname === '/admin';
  React.useEffect(() => {
    if (!isAuthenticated) prepareNanivioSignature();
  }, [isAuthenticated]);

  // Finish the selected provider even if another stored account is still
  // restoring. Never accidentally replace this callback with that dashboard.
  if (socialCallbackPending) return <NanivioAuthScreen onSuccess={() => {
    setSocialCallbackPending(false); setIsAuthModalOpen(false);
  }} />;

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

  // Public app entry is authentication-first. The signature effect is only
  // displayed by the successful-authentication branch above.
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
  if (typeof window !== 'undefined' && window.location.pathname.replace(/\/$/, '') === '/reset-password') {
    return <ErrorBoundary fallbackTitle="Nanivio password recovery"><PasswordResetPage /></ErrorBoundary>;
  }
  if (typeof window !== 'undefined' && window.location.pathname === '/delete-account') {
    return <ErrorBoundary fallbackTitle="Nanivio account deletion"><AccountDeletionPage /></ErrorBoundary>;
  }
  return (
    <ErrorBoundary fallbackTitle="Nanivio Platform Experience">
      <NanivioProvider>
        <AppOrchestrator />
      </NanivioProvider>
    </ErrorBoundary>
  );
}


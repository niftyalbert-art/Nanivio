import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { StreamChatProvider } from '@/contexts/stream-chat';
import { AgoraCallProvider } from '@/contexts/agora-call';
import { AppErrorBoundary } from '@/components/error-boundary';
import { AppLayout } from '@/components/layout/app-layout';
import Dashboard from '@/pages/dashboard';
import Send from '@/pages/send';
import Transactions from '@/pages/transactions';
import TransactionDetail from '@/pages/transaction-detail';
import Countries from '@/pages/countries';
import Wallets from '@/pages/wallets';
import Stats from '@/pages/stats';
import Deposit from '@/pages/deposit';
import Withdraw from '@/pages/withdraw';
import Account from '@/pages/account';
import KycPage from '@/pages/kyc';
import Chat from '@/pages/chat';
import CryptoPage from '@/pages/crypto';
import CryptoPaymentPage from '@/pages/crypto-payment';
import CryptoDepositPage from '@/pages/crypto-deposit';
import Admin from '@/pages/admin';
import Install from '@/pages/install';
import Login from '@/pages/login';
import SignUp from '@/pages/signup';
import VerifyEmail from '@/pages/verify-email';
import ForgotPassword from '@/pages/forgot-password';
import ResetPassword from '@/pages/reset-password';
import NotFound from '@/pages/not-found';
import { InstallBanner } from '@/components/install-banner';

const queryClient = new QueryClient();

function Router() {
  const { isAuthenticated } = useAuth();

  // Unauthenticated: show auth pages + always-public standalone pages
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/admin" component={Admin} />
        <Route path="/install" component={Install} />
        <Route path="/signup" component={SignUp} />
        <Route path="/verify-email" component={VerifyEmail} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        {/* Catch-all → login */}
        <Route component={Login} />
      </Switch>
    );
  }

  // Authenticated: full app — both providers keep persistent clients alive for
  // the entire session so real-time events work from any page, not just /chat.
  return (
    <AppErrorBoundary label="Chat">
    <StreamChatProvider>
    <AppErrorBoundary label="Video">
    <AgoraCallProvider>
    <Switch>
      {/* Standalone pages — no app chrome */}
      <Route path="/admin" component={Admin} />
      <Route path="/install" component={Install} />

      {/* Main app */}
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/send" component={Send} />
            <Route path="/transactions" component={Transactions} />
            <Route path="/transactions/:id" component={TransactionDetail} />
            <Route path="/countries" component={Countries} />
            <Route path="/wallets" component={Wallets} />
            <Route path="/stats" component={Stats} />
            <Route path="/deposit" component={Deposit} />
            <Route path="/withdraw" component={Withdraw} />
            <Route path="/account" component={Account} />
            <Route path="/kyc" component={KycPage} />
            <Route path="/communication" component={Chat} />
            <Route path="/call" component={Chat} />
            <Route path="/chat" component={Chat} />
            <Route path="/crypto" component={CryptoPage} />
            <Route path="/crypto/:id" component={CryptoPaymentPage} />
            <Route path="/crypto/deposit" component={CryptoDepositPage} />
            <Route path="/crypto/deposit/:id" component={CryptoDepositPage} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
    </AgoraCallProvider>
    </AppErrorBoundary>
    </StreamChatProvider>
    </AppErrorBoundary>
  );
}

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
              <InstallBanner />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

export default App;

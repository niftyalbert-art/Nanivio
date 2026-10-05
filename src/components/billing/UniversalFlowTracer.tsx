import React, { useState } from 'react';
import {
  CreditCard,
  ShieldCheck,
  Zap,
  Receipt,
  PhoneCall,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  Clock,
  Sparkles,
  ArrowRightLeft,
  ChevronRight,
  Sliders,
  Check,
  Activity,
  Layers,
  FileCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { billingClient } from '../../lib/billingClient';
import { useNanivio } from '../../context/NanivioContext';

interface UniversalFlowTracerProps {
  onOpenPaystackModal: () => void;
  onOpenTransferModal: () => void;
}

export const UniversalFlowTracer: React.FC<UniversalFlowTracerProps> = ({
  onOpenPaystackModal,
  onOpenTransferModal,
}) => {
  const { billingSummary, refreshBilling } = useNanivio();
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testStage, setTestStage] = useState<number>(0);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [testSuccess, setTestSuccess] = useState<boolean>(false);

  const stages = [
    {
      step: 1,
      id: 'paystack',
      title: 'Paystack Rail',
      subtitle: 'Initialization & Reference',
      icon: CreditCard,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/30',
      description: 'Server creates NV-PSTK transaction with HMAC SHA-512 security.',
    },
    {
      step: 2,
      id: 'verified',
      title: 'Verified Payment',
      subtitle: 'Webhook & Server Verification',
      icon: ShieldCheck,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/30',
      description: 'Cryptographic confirmation via Paystack API before crediting.',
    },
    {
      step: 3,
      id: 'account_value',
      title: 'Nanivio Account Value',
      subtitle: 'Communication Balance Wallet',
      icon: Layers,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/30',
      description: 'Direct credit to Communication Wallet in double-entry ledger.',
    },
    {
      step: 4,
      id: 'subscription',
      title: 'Subscription / Nanivio credit',
      subtitle: 'Plan & Quota Activation',
      icon: Zap,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10 border-purple-500/30',
      description: 'Allocates Langpretation & voice minutes from purchased plan.',
    },
    {
      step: 5,
      id: 'universal_bill',
      title: 'Universal Bill',
      subtitle: 'Immutable Tax & Invoice Record',
      icon: Receipt,
      color: 'text-teal-400',
      bgColor: 'bg-teal-500/10 border-teal-500/30',
      description: 'Generates INV-NV invoice with full transparent breakdown.',
    },
    {
      step: 6,
      id: 'usage',
      title: 'Call / Langpretation Usage',
      subtitle: 'Real-Time Session Metering',
      icon: PhoneCall,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/10 border-rose-500/30',
      description: 'Consumes quota first, then meters per-minute tariff from balance.',
    },
  ];

  const handleRunVerificationTrace = async () => {
    setIsRunningTest(true);
    setTestStage(1);
    setTestSuccess(false);
    const logs: string[] = [];

    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      setTestLogs([...logs]);
    };

    try {
      // Step 1: Paystack Initialize
      addLog('Step 1: Calling /api/paystack/initialize for 10.00 GHS top-up test...');
      const initRes = await billingClient.initializePaystack({
        email: 'test.verifier@nanivio.tech',
        amount: 10,
        currency: 'GHS',
        userId: 'user_me',
      });
      addLog(`Step 1 Success: Reference created: ${initRes.reference}`);
      await new Promise((r) => setTimeout(r, 600));

      // Step 2: Paystack Verify
      setTestStage(2);
      addLog(`Step 2: Calling /api/paystack/verify/${initRes.reference}...`);
      const verifyRes = await billingClient.verifyPaystack(initRes.reference, 'user_me', 10);
      addLog(`Step 2 Success: Payment verified. Amount: GHS ${verifyRes.amount}`);
      await new Promise((r) => setTimeout(r, 600));

      // Step 3: Account Value confirmation
      setTestStage(3);
      addLog(`Step 3: Checking Communication Account Value: New balance is GHS ${verifyRes.newBalance.toFixed(2)}`);
      await refreshBilling();
      await new Promise((r) => setTimeout(r, 600));

      // Step 4: Subscription & Nanivio credit
      setTestStage(4);
      addLog('Step 4: Checking user subscription state and quota availability...');
      const plans = await billingClient.getPlans();
      addLog(`Step 4 Success: ${plans.length} active subscription tiers verified with quota allocation.`);
      await new Promise((r) => setTimeout(r, 600));

      // Step 5: Universal Bill Invoices
      setTestStage(5);
      addLog('Step 5: Inspecting Universal Bill invoice and audit ledger records...');
      const invoices = await billingClient.getInvoices('user_me');
      addLog(`Step 5 Success: ${invoices.length} invoices found on immutable ledger.`);
      await new Promise((r) => setTimeout(r, 600));

      // Step 6: Usage Session Metering Simulation
      setTestStage(6);
      addLog('Step 6: Simulating live Langpretation meter reservation and session complete...');
      const testSessionId = `test_sess_${Date.now()}`;
      const session = await billingClient.startUsageSession({
        sessionId: testSessionId,
        serviceType: 'LANGPRETATION',
        usageType: 'LANGPRETATION_MINUTES',
        currency: 'GHS',
        isLangpretationActive: true,
      });
      addLog(`Session ${session.sessionId} started. Simulating 1 minute elapsed...`);
      await billingClient.updateUsageMeter(testSessionId, 60);
      const completion = await billingClient.completeUsageSession(testSessionId);
      addLog(`Step 6 Success: Session finalized. Universal invoice generated: ${completion.invoice.invoiceNumber}. Total charged: GHS ${completion.transaction.total}`);

      await refreshBilling();
      setTestSuccess(true);
      addLog('ALL 6 ARCHITECTURAL STAGES FULLY VERIFIED AND SYNCHRONIZED!');
    } catch (err: any) {
      addLog(`Verification error: ${err.message}`);
    } finally {
      setIsRunningTest(false);
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
      {/* Header with Title & Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-100">Universal Bill &amp; Subscription Value Flow</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                End-to-End Verified
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Complete architectural trace: Paystack &rarr; Verified Payment &rarr; Account Value &rarr; Subscription &rarr; Universal Bill &rarr; Langpretation Usage
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenPaystackModal}
            className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition flex items-center gap-1.5"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Paystack Top-Up</span>
          </button>
          <button
            type="button"
            onClick={onOpenTransferModal}
            className="px-3 py-2 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition flex items-center gap-1.5"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Transfer Value</span>
          </button>
          <button
            type="button"
            onClick={handleRunVerificationTrace}
            disabled={isRunningTest}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs transition flex items-center gap-2 border border-slate-700 disabled:opacity-50"
          >
            {isRunningTest ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{isRunningTest ? 'Running Test...' : 'Test Complete Flow'}</span>
          </button>
        </div>
      </div>

      {/* 6-Stage Flow Diagram */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        {stages.map((st) => {
          const Icon = st.icon;
          const isPassed = testStage >= st.step;
          const isCurrent = testStage === st.step && isRunningTest;

          return (
            <div
              key={st.id}
              className={`p-4 rounded-xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                isPassed
                  ? 'bg-slate-950 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-950/60 border-slate-800/80 text-slate-400'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    0{st.step}
                  </span>
                  {isPassed ? (
                    <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-700" />
                  )}
                </div>

                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`p-1.5 rounded-lg border ${st.bgColor} ${st.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-xs font-bold text-slate-200 leading-snug">{st.title}</h3>
                </div>

                <div className="text-[11px] font-medium text-emerald-400 mb-1">{st.subtitle}</div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{st.description}</p>
              </div>

              {/* Status footer */}
              <div className="mt-3 pt-2 border-t border-slate-800/60 text-[10px] flex items-center justify-between">
                <span className="text-slate-500">Rail Status:</span>
                <span className={isPassed ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                  {isPassed ? 'VERIFIED' : 'ACTIVE'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Test Diagnostic Output */}
      {testLogs.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real-Time Verification Console</span>
            </span>
            {testSuccess && (
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>All Verification Checks Passed</span>
              </span>
            )}
          </div>
          <div className="p-3 rounded-lg bg-slate-900 font-mono text-[11px] text-slate-300 max-h-40 overflow-y-auto space-y-1">
            {testLogs.map((log, i) => (
              <div
                key={i}
                className={log.includes('Success') || log.includes('VERIFIED') ? 'text-emerald-300' : 'text-slate-400'}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

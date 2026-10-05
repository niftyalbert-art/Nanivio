import React, { useState } from 'react';
import {
  X,
  Send,
  ArrowRightLeft,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { billingClient } from '../../lib/billingClient';
import { FinancialAccountType, PeerToPeerTransferResult } from '../../types/billing';

interface TransferValueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultMode?: 'P2P' | 'INTERNAL';
  communicationBalance?: number;
  fintechBalance?: number;
  currency?: string;
}

export const TransferValueModal: React.FC<TransferValueModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultMode = 'P2P',
  communicationBalance = 3450.0,
  fintechBalance = 1255.5,
  currency = 'GHS',
}) => {
  const [transferMode, setTransferMode] = useState<'P2P' | 'INTERNAL'>(defaultMode);
  const [accountType, setAccountType] = useState<FinancialAccountType>('COMMUNICATION');
  const [toIdentifier, setToIdentifier] = useState<string>('');
  const [amount, setAmount] = useState<number>(25);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PeerToPeerTransferResult | null>(null);

  // Suggested contacts for quick selection
  const quickContacts = [
    { name: 'Ama Serwaa', identifier: '0486829104', role: 'Trader / Personal' },
    { name: 'Expert Amina', identifier: '0486484804', role: 'Langpretation Provider' },
    { name: 'Yaw Boateng', identifier: '0486910243', role: 'Driver' },
  ];

  const currentAvailableBalance = accountType === 'COMMUNICATION' ? communicationBalance : fintechBalance;

  const handleAmountChange = (val: string) => {
    setCustomAmount(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (amount <= 0) {
      setErrorMessage('Please enter a valid transfer amount.');
      return;
    }

    if (amount > currentAvailableBalance) {
      setErrorMessage(
        `Insufficient ${accountType} Balance. Available: ${currency} ${currentAvailableBalance.toFixed(2)}, Requested: ${currency} ${amount.toFixed(2)}`
      );
      return;
    }

    setIsProcessing(true);

    try {
      if (transferMode === 'P2P') {
        if (!toIdentifier.trim()) {
          setErrorMessage('Please provide the recipient’s Nanivio ID, phone number, or email.');
          setIsProcessing(false);
          return;
        }

        const result = await billingClient.transferPeerToPeer({
          fromUserId: 'user_me',
          toIdentifier: toIdentifier.trim(),
          amount,
          currency,
          accountType,
          note: note.trim() || undefined,
        });

        setReceipt(result);
      } else {
        // INTERNAL TRANSFER (Fintech -> Communication)
        await billingClient.transferFintechToCommunication({
          amount,
          currency,
          notes: note.trim() || 'Internal Account Value movement',
        });

        setReceipt({
          transferId: `tx_internal_${Date.now()}`,
          referenceId: `REF-NV-INT-${Math.floor(100000 + Math.random() * 900000)}`,
          fromUserId: 'user_me',
          toUserId: 'user_me',
          toUserName: 'Communication Account',
          amount,
          currency,
          accountType: 'COMMUNICATION',
          senderBalanceAfter: fintechBalance - amount,
          recipientBalanceAfter: communicationBalance + amount,
          timestamp: Date.now(),
          status: 'COMPLETED',
          note: 'Internal transfer from Fintech Account to Communication Account',
        });
      }

      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Transfer failed to process.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setReceipt(null);
    setErrorMessage(null);
    setToIdentifier('');
    setNote('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Transfer Nanivio Value</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Instant Rail
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Move value peer-to-peer or between internal accounts
              </p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          {receipt ? (
            /* RECEIPT VIEW */
            <div className="space-y-4">
              <div className="py-4 flex flex-col items-center text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-100">Transfer Completed Successfully</h3>
                <p className="text-xs text-emerald-400 font-medium">
                  {currency} {receipt.amount.toFixed(2)} transferred instantly
                </p>
              </div>

              {/* Itemized Receipt Bento */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Reference:</span>
                  <span className="text-emerald-400 font-bold">{receipt.referenceId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Recipient:</span>
                  <span className="text-slate-200 font-sans">
                    {receipt.toUserName} {receipt.toNvId ? `(${receipt.toNvId})` : ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Source Account:</span>
                  <span className="text-slate-200 font-sans">{receipt.accountType} Balance</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Your New Balance:</span>
                  <span className="text-slate-100 font-bold">
                    {currency} {receipt.senderBalanceAfter.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Platform Transfer Fee:</span>
                  <span className="text-emerald-400 font-sans">0.00 GHS (Free Rail)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Ledger Posting:</span>
                  <span className="text-emerald-300 font-sans">APPENDED (ATOMIC DOUBLE-ENTRY)</span>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-xs transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print</span>
                </button>
              </div>
            </div>
          ) : (
            /* TRANSFER FORM */
            <form onSubmit={handleExecuteTransfer} className="space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Mode Selector */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setTransferMode('P2P')}
                  className={`py-2 rounded-lg font-bold transition flex items-center justify-center gap-2 ${
                    transferMode === 'P2P'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>To Another User</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTransferMode('INTERNAL')}
                  className={`py-2 rounded-lg font-bold transition flex items-center justify-center gap-2 ${
                    transferMode === 'INTERNAL'
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>Between My Wallets</span>
                </button>
              </div>

              {/* Source Wallet Selector */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="block text-xs font-semibold text-slate-300">Select Source Account</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAccountType('COMMUNICATION')}
                    className={`p-3 rounded-xl border text-left transition ${
                      accountType === 'COMMUNICATION'
                        ? 'bg-emerald-500/10 border-emerald-500/60 text-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-emerald-400 uppercase">Communication Wallet</div>
                    <div className="text-sm font-bold font-mono mt-0.5 text-slate-200">
                      {currency} {communicationBalance.toFixed(2)}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccountType('FINTECH')}
                    className={`p-3 rounded-xl border text-left transition ${
                      accountType === 'FINTECH'
                        ? 'bg-blue-500/10 border-blue-500/60 text-slate-100'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-blue-400 uppercase">Fintech Wallet</div>
                    <div className="text-sm font-bold font-mono mt-0.5 text-slate-200">
                      {currency} {fintechBalance.toFixed(2)}
                    </div>
                  </button>
                </div>
              </div>

              {/* Recipient Input (P2P Mode) */}
              {transferMode === 'P2P' ? (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Recipient Identifier (Nanivio ID, Phone, or Email)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 0486829104, 0244123456, or user@nanivio.tech"
                    value={toIdentifier}
                    onChange={(e) => setToIdentifier(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none text-slate-100 text-xs font-mono"
                  />

                  {/* Quick Select Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 self-center mr-1">Quick:</span>
                    {quickContacts.map((contact) => (
                      <button
                        key={contact.identifier}
                        type="button"
                        onClick={() => setToIdentifier(contact.identifier)}
                        className="px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition"
                      >
                        {contact.name} ({contact.identifier.slice(-4)})
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Internal Transfer Destination Info */
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                  <span className="text-slate-400">Destination:</span>
                  <span className="font-semibold text-emerald-400">
                    {accountType === 'FINTECH' ? 'Communication Account (Langpretation / Calls)' : 'Fintech Account (Withdrawal / Banking)'}
                  </span>
                </div>
              )}

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Transfer Amount</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">
                    {currency}
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="25"
                    value={customAmount || amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    className="w-full pl-12 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none text-slate-100 font-mono text-sm"
                  />
                </div>
              </div>

              {/* Transfer Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Note or Purpose (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. For voice call minutes or translation assistance"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 focus:border-blue-500 focus:outline-none text-slate-200 text-xs"
                />
              </div>

              {/* Fee & Instant Settlement Disclaimer */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Platform Fee:</span>
                <span className="text-emerald-400 font-bold font-mono">0.00 GHS (Free Instant Settlement)</span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:opacity-50"
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Processing Ledger Transfer...</span>
                  </span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send {currency} {amount.toFixed(2)}</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};

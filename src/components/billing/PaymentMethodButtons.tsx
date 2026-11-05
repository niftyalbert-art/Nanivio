import React from 'react';
import { CreditCard, WalletCards, Users } from 'lucide-react';

export type PaymentMethod = 'PAYSTACK' | 'USDT' | 'NANIVIO_CREDIT';

export function PaymentMethodButtons({ onSelect, disabled = false, creditEnabled = true, disabledMethods = {} }: {
  onSelect: (method: PaymentMethod) => void;
  disabled?: boolean;
  creditEnabled?: boolean;
  disabledMethods?: Partial<Record<PaymentMethod, boolean>>;
}) {
  return <div className="space-y-2" aria-label="Payment methods">
    <p className="text-xs font-semibold text-slate-300">Pay with:</p>
    <div className="grid gap-2 sm:grid-cols-3">
      <button type="button" disabled={disabled || disabledMethods.PAYSTACK} onClick={() => onSelect('PAYSTACK')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400 disabled:opacity-50"><CreditCard size={16} />Paystack</button>
      <button type="button" disabled={disabled || disabledMethods.USDT} onClick={() => onSelect('USDT')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"><WalletCards size={16} />USDT</button>
      {creditEnabled && <button type="button" disabled={disabled || disabledMethods.NANIVIO_CREDIT} onClick={() => onSelect('NANIVIO_CREDIT')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-slate-900 px-3 py-2 text-xs font-semibold text-cyan-100 hover:border-cyan-300 disabled:opacity-50"><Users size={16} />Nanivio credit · P2P</button>}
    </div>
  </div>;
}

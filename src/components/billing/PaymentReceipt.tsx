import React from 'react';

export function PaymentReceipt({ result }: { result: any }) {
  const purchase = result.purchase;
  const subscription = purchase?.purpose === 'MALVI_SUBSCRIPTION' || purchase?.purpose === 'SUBSCRIPTION';
  return <div className="space-y-4 text-left">
    <div role="status">
      <h2 className="text-xl font-semibold text-white">{result.alreadyFulfilled ? 'Payment previously confirmed' : subscription ? 'Your subscription is active' : 'Payment successful'}</h2>
      <p className="mt-2 text-sm text-slate-200">{purchase?.name || 'Your Nanivio purchase'} — paid and activated.</p>
      {result.alreadyFulfilled && <p className="mt-2 text-xs text-slate-400">This original purchase was already activated. No second charge or extra allowance was added. View billing for its current remaining allowance and expiry.</p>}
    </div>
    <dl className="space-y-2 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm">
      <div><dt className="text-slate-400">Amount paid</dt><dd className="text-white">{result.currency} {Number(result.amount).toFixed(2)}</dd></div>
      {subscription && <div><dt className="text-slate-400">Purchased term</dt><dd className="text-white">{purchase.billingCycle === 'ANNUAL' ? 'Annual' : 'Monthly'} · one-time payment, no automatic renewal</dd></div>}
      {purchase?.purpose === 'MALVI_SUBSCRIPTION' && <div><dt className="text-slate-400">Purchased allowances</dt><dd className="text-white">{purchase.voiceMinutes} voice minutes · {purchase.videoMinutes} live avatar minutes</dd></div>}
      {purchase?.purpose === 'COMMUNICATION_MINUTES' && <div><dt className="text-slate-400">Purchased allowance</dt><dd className="text-white">{purchase.minutes} communication minutes · {purchase.validityDays} days</dd></div>}
      {purchase?.purpose === 'SUBSCRIPTION' && <div><dt className="text-slate-400">Purchased allowances</dt><dd className="text-white">{purchase.voiceMinutes} voice minutes · {purchase.langpretationMinutes} Langpretation minutes</dd></div>}
      {purchase?.purpose === 'COMMUNICATION_TOPUP' && <p className="text-slate-200">Your communication wallet was credited.</p>}
      <div><dt className="text-slate-400">Payment reference</dt><dd className="break-all font-mono text-xs text-white">{result.reference}</dd></div>
    </dl>
  </div>;
}

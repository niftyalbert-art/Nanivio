import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Share2,
  Star,
  Car,
  MapPin,
  Clock,
  Navigation,
  Wallet,
  Sparkles,
  ShieldCheck,
  X,
  Heart,
  FileText,
} from 'lucide-react';
import { NanivioDriver } from '../../types/drive';

export interface RideReceiptData {
  tripId: string;
  date: string;
  driver: NanivioDriver;
  pickupLabel: string;
  dropoffLabel: string;
  tierTitle: string;
  distanceKm: number;
  durationMins: number;
  fareGHS: number;
  paymentMethod: 'wallet' | 'momo' | 'cash';
  otpPin: string;
}

interface RidePaymentReceiptModalProps {
  receipt: RideReceiptData;
  onClose: () => void;
  onTipAdded?: (tipAmount: number) => void;
  onRateDriver?: (stars: number, compliments: string[]) => void;
}

export const RidePaymentReceiptModal: React.FC<RidePaymentReceiptModalProps> = ({
  receipt,
  onClose,
  onTipAdded,
  onRateDriver,
}) => {
  const [selectedTip, setSelectedTip] = useState<number>(0);
  const [customTip, setCustomTip] = useState<string>('');
  const [rating, setRating] = useState<number>(5);
  const [selectedCompliments, setSelectedCompliments] = useState<string[]>(['Safe Driving', 'Clean Car']);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const complimentsList = [
    'Safe Driving',
    'Clean Car',
    'Great Conversation',
    'Punctual',
    'Smooth Navigation',
    'Fluent Langpretation',
  ];

  const handleToggleCompliment = (item: string) => {
    setSelectedCompliments((prev) =>
      prev.includes(item) ? prev.filter((c) => c !== item) : [...prev, item]
    );
  };

  const activeTip = selectedTip === -1 ? Number(customTip) || 0 : selectedTip;
  const totalPaid = receipt.fareGHS + activeTip;
  const totalUSD = (totalPaid / 15.5).toFixed(2);

  const handleShare = () => {
    const text = `Nanivio Ride Receipt #${receipt.tripId}\nTrip to: ${receipt.dropoffLabel}\nTotal: GH₵ ${totalPaid.toFixed(2)} ($${totalUSD})\nDriver: ${receipt.driver.name}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    }
  };

  const handleSubmitRatingAndDone = () => {
    if (onTipAdded && activeTip > 0) onTipAdded(activeTip);
    if (onRateDriver) onRateDriver(rating, selectedCompliments);
    setIsSubmitted(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const driver = receipt.driver;
  const vehicleName = `${driver.vehicleMake || (driver as any).vehicle?.make || 'Toyota'} ${
    driver.vehicleModel || (driver as any).vehicle?.model || 'Corolla'
  }`;
  const plateNumber = driver.plateNumber || (driver as any).vehicle?.plateNumber || 'GN 4821-24';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-emerald-500/40 shadow-2xl overflow-hidden my-6">
        {/* Receipt Top Header / Badge */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-5 sm:p-6 text-slate-950 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-950/20 hover:bg-slate-950/30 flex items-center justify-center text-slate-950 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="p-1 rounded-lg bg-slate-950/20 text-slate-950">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <span className="text-xs font-mono uppercase tracking-widest font-bold">
              Official Trip Receipt
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-950">GH₵ {totalPaid.toFixed(2)}</h2>
              <p className="text-xs text-slate-900/80 font-medium">≈ ${totalUSD} USD · Paid &amp; Settled</p>
            </div>
            <div className="text-right font-mono text-xs">
              <span className="font-bold">Trip #{receipt.tripId}</span>
              <div className="text-[10px] text-slate-900/80">{receipt.date}</div>
            </div>
          </div>
        </div>

        {/* Receipt Content Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Driver & Vehicle Summary */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center gap-3">
              {driver.avatar ? (
                <img
                  src={driver.avatar}
                  alt={driver.name}
                  className="w-12 h-12 rounded-2xl object-cover border border-emerald-500/40"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
                  {driver.name.charAt(0)}
                </div>
              )}
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>{driver.name}</span>
                  <span className="text-[10px] font-mono text-emerald-400">NV {driver.nvId}</span>
                </h4>
                <div className="text-xs text-slate-400">
                  {vehicleName} · <span className="font-mono text-emerald-300 font-bold">{plateNumber}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-amber-400 mt-0.5">
                  <Star className="w-3 h-3 fill-amber-400" />
                  <span>{driver.rating}</span>
                  <span className="text-slate-500">· {receipt.tierTitle}</span>
                </div>
              </div>
            </div>

            <div className="text-right text-xs">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                Completed
              </span>
            </div>
          </div>

          {/* Route Info */}
          <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800/80 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Pickup Location</div>
                <div className="text-xs text-white font-medium">{receipt.pickupLabel}</div>
              </div>
            </div>

            <div className="ml-3 pl-3 border-l border-dashed border-slate-700 h-2" />

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <Navigation className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Dropoff Destination</div>
                <div className="text-xs text-white font-medium">{receipt.dropoffLabel}</div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                <span>Distance: <strong className="text-white">{receipt.distanceKm} km</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Trip Time: <strong className="text-white">{receipt.durationMins} mins</strong></span>
              </div>
            </div>
          </div>

          {/* Itemized Fare Breakdown */}
          <div className="p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800 space-y-2 text-xs">
            <h4 className="font-bold text-slate-300 text-xs mb-2">Itemized Fare Breakdown</h4>
            <div className="flex justify-between text-slate-400">
              <span>Base Booking Fare</span>
              <span className="font-mono text-slate-200">GH₵ 12.00</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Distance &amp; Time Charge ({receipt.distanceKm} km · {receipt.durationMins}m)</span>
              <span className="font-mono text-slate-200">GH₵ {(receipt.fareGHS - 12).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-emerald-400">
              <span>Nanivio Direct Pass Discount</span>
              <span className="font-mono font-bold">-GH₵ 0.00</span>
            </div>
            {activeTip > 0 && (
              <div className="flex justify-between text-amber-400 font-semibold">
                <span className="flex items-center gap-1">
                  <Heart className="w-3 h-3 fill-amber-400" />
                  <span>Driver Gratitude Tip</span>
                </span>
                <span className="font-mono font-bold">+GH₵ {activeTip.toFixed(2)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-bold text-white">
              <span>Total Paid</span>
              <span className="font-mono text-emerald-400">GH₵ {totalPaid.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Status */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Wallet className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-white">
                  {receipt.paymentMethod === 'wallet'
                    ? 'Nanivio Fintech Wallet'
                    : receipt.paymentMethod === 'momo'
                    ? 'Mobile Money (MoMo)'
                    : 'Cash on Arrival'}
                </span>
                <div className="text-[10px] text-emerald-400 font-mono">
                  Auto-Settled · Auth Ref: NV-TX-{receipt.tripId.slice(-4)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-emerald-400 font-bold text-[11px]">
              <CheckCircle2 className="w-4 h-4" />
              <span>Paid</span>
            </div>
          </div>

          {/* Add a Driver Tip */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-slate-300 flex items-center gap-1.5">
                <Heart className="w-3.5 h-3.5 text-rose-400" />
                <span>Add a Tip for {driver.name}</span>
              </label>
              <span className="text-[11px] text-slate-400">100% goes to driver</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[0, 5, 10, 20].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setSelectedTip(amt);
                    setCustomTip('');
                  }}
                  className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    selectedTip === amt
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {amt === 0 ? 'No Tip' : `+GH₵ ${amt}`}
                </button>
              ))}
            </div>
          </div>

          {/* Rate Driver & Experience */}
          <div className="space-y-2.5 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Rate your driver</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    className="p-1 cursor-pointer transition-transform hover:scale-110"
                  >
                    <Star
                      className={`w-5 h-5 ${
                        star <= rating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-slate-700 hover:text-slate-500'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Compliment Tags */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {complimentsList.map((tag) => {
                const active = selectedCompliments.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleCompliment(tag)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                      active
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                        : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handleShare}
              className="flex-1 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{isCopied ? 'Receipt Copied!' : 'Share Receipt'}</span>
            </button>

            <button
              onClick={handleSubmitRatingAndDone}
              className="flex-[1.5] py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitted ? 'Saved & Logged!' : 'Done / New Ride'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Car,
  Key,
  Shield,
  Star,
  Users,
  Fuel,
  CheckCircle2,
  Calendar,
  MapPin,
  Sparkles,
  Phone,
  ArrowRight,
  Filter,
  Check,
} from 'lucide-react';
import { RentalVehicle } from '../../types/drive';
import { RENTAL_FLEET } from '../../data/driveMockData';

interface UbaCarRentingPanelProps {
  onCallHost?: (phone: string, nvId: string) => void;
}

export const UbaCarRentingPanel: React.FC<UbaCarRentingPanelProps> = ({ onCallHost }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedVehicle, setSelectedVehicle] = useState<RentalVehicle | null>(null);
  const [rentalDays, setRentalDays] = useState<number>(3);
  const [includeChauffeur, setIncludeChauffeur] = useState<boolean>(false);
  const [bookingConfirmed, setBookingConfirmed] = useState<boolean>(false);
  const [pickupCity, setPickupCity] = useState<string>('Accra');

  const filteredVehicles = RENTAL_FLEET.filter((v) => {
    if (selectedCategory === 'all') return true;
    return v.type.toLowerCase().includes(selectedCategory.toLowerCase());
  });

  const handleConfirmBooking = () => {
    setBookingConfirmed(true);
  };

  const calculateTotal = (vehicle: RentalVehicle) => {
    const base = vehicle.dailyRateGHS * rentalDays;
    const chauffeurFee = includeChauffeur ? (vehicle.driverDailyFeeGHS || 120) * rentalDays : 0;
    return base + chauffeurFee;
  };

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-slate-950/90 border border-slate-800 shadow-xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Key className="w-4 h-4 text-emerald-400" />
            <span>Uba Car Renting &amp; Fleet Service</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Daily, weekly, and chauffeur car rentals from verified Nanivio Drive fleet partners
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {['all', 'Sedan', 'SUV', '4x4', 'Van'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-xl text-xs font-semibold capitalize transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Fleet Catalog Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filteredVehicles.map((vehicle) => {
          const vehicleFullName = `${vehicle.make} ${vehicle.model}`;

          return (
            <div
              key={vehicle.id}
              className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-emerald-500/50 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Vehicle Image & Badge */}
                <div className="relative h-40 w-full rounded-xl overflow-hidden mb-3 bg-slate-950">
                  <img
                    src={vehicle.image}
                    alt={vehicleFullName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-700 text-[10px] font-bold text-emerald-300">
                    {vehicle.type}
                  </div>
                  {vehicle.withDriverOption && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-emerald-950/80 backdrop-blur-md border border-emerald-500/40 text-[10px] font-bold text-emerald-300 flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      <span>Chauffeur Opt</span>
                    </div>
                  )}
                </div>

                {/* Title and Rating */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white">{vehicleFullName}</h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-0.5 text-amber-400 font-semibold">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>{vehicle.rating}</span>
                        <span className="text-slate-500">({vehicle.reviewCount})</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5 text-slate-300">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span>{vehicle.location.city}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-extrabold text-emerald-400 font-mono">
                      GH₵ {vehicle.dailyRateGHS}
                    </div>
                    <div className="text-[10px] text-slate-400">/day (${vehicle.dailyRateUSD})</div>
                  </div>
                </div>

                {/* Specs Pills */}
                <div className="grid grid-cols-3 gap-1.5 py-2.5 my-2 border-y border-slate-800/80 text-[11px] text-slate-300">
                  <div className="flex items-center gap-1">
                    <Users className="w-3 h-3 text-slate-400" />
                    <span>{vehicle.seats} Seats</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Fuel className="w-3 h-3 text-slate-400" />
                    <span>{vehicle.fuel}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Car className="w-3 h-3 text-slate-400" />
                    <span>{vehicle.transmission}</span>
                  </div>
                </div>

                {/* Features List */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {vehicle.features.slice(0, 3).map((feat, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-slate-950 text-[10px] text-slate-400 border border-slate-800"
                    >
                      ✓ {feat}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => {
                    setSelectedVehicle(vehicle);
                    setBookingConfirmed(false);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Rent This Car</span>
                </button>

                {onCallHost && (
                  <button
                    onClick={() => onCallHost('+233244891023', vehicle.ownerNvId)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-all cursor-pointer"
                    title="Contact Fleet Partner via Nanivio"
                  >
                    <Phone className="w-4 h-4 text-emerald-400" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* RENTAL BOOKING MODAL */}
      {selectedVehicle && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full p-5 rounded-3xl bg-slate-950 border border-emerald-500/40 shadow-2xl space-y-4">
            {!bookingConfirmed ? (
              <>
                <div className="flex items-start justify-between pb-2 border-b border-slate-800">
                  <div>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">
                      Uba Fleet Reservation
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {selectedVehicle.make} {selectedVehicle.model}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Partner: {selectedVehicle.companyName} · NV {selectedVehicle.ownerNvId}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedVehicle(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3">
                  {/* Rental Days */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Rental Duration (Days)</label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 5, 7, 14].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setRentalDays(days)}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            rentalDays === days
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          {days}d
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Chauffeur Toggle */}
                  {selectedVehicle.withDriverOption && (
                    <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <Shield className="w-4 h-4 text-emerald-400" />
                        <div>
                          <div className="font-semibold text-white">Include Verified Nanivio Chauffeur</div>
                          <div className="text-[10px] text-slate-400">
                            +GH₵ {selectedVehicle.driverDailyFeeGHS || 120} / day · Multilingual driver
                          </div>
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={includeChauffeur}
                        onChange={(e) => setIncludeChauffeur(e.target.checked)}
                        className="rounded accent-emerald-500 w-4 h-4"
                      />
                    </label>
                  )}

                  {/* Pickup City */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Pickup Territory</label>
                    <input
                      type="text"
                      value={pickupCity}
                      onChange={(e) => setPickupCity(e.target.value)}
                      placeholder="Accra / Kotoka Airport / Tema"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white"
                    />
                  </div>

                  {/* Cost Breakdown */}
                  <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Daily Rate ({rentalDays} days x GH₵ {selectedVehicle.dailyRateGHS}):</span>
                      <span className="font-mono text-white">GH₵ {selectedVehicle.dailyRateGHS * rentalDays}</span>
                    </div>
                    {includeChauffeur && (
                      <div className="flex items-center justify-between text-slate-400">
                        <span>Professional Chauffeur ({rentalDays} days x GH₵ {selectedVehicle.driverDailyFeeGHS || 120}):</span>
                        <span className="font-mono text-emerald-400">
                          +GH₵ {(selectedVehicle.driverDailyFeeGHS || 120) * rentalDays}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Comprehensive Insurance &amp; Road Cover:</span>
                      <span className="text-emerald-400 font-semibold">Included FREE</span>
                    </div>
                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm font-bold text-white">
                      <span>Total Reservation Cost:</span>
                      <span className="font-mono text-emerald-400 text-base">GH₵ {calculateTotal(selectedVehicle)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setSelectedVehicle(null)}
                    className="w-1/3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmBooking}
                    className="w-2/3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
                  >
                    <span>Confirm &amp; Reserve</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              /* BOOKING CONFIRMED SUCCESS VOUCHER */
              <div className="text-center space-y-3 py-2 animate-fadeIn">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>

                <h4 className="text-base font-bold text-white">Uba Car Rental Confirmed!</h4>
                <p className="text-xs text-slate-300 max-w-xs mx-auto">
                  Your reservation for the <strong className="text-white">{selectedVehicle.make} {selectedVehicle.model}</strong> has been secured for {rentalDays} days.
                </p>

                <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-left text-xs space-y-1.5 font-mono">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Voucher Code:</span>
                    <span className="text-emerald-400 font-bold">NV-RENT-2026-9921</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Fleet Partner:</span>
                    <span className="text-white">{selectedVehicle.companyName}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Partner NV Line:</span>
                    <span className="text-emerald-400">{selectedVehicle.ownerNvId}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Pickup Location:</span>
                    <span className="text-white">{pickupCity}</span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedVehicle(null)}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

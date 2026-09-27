import { SupportedLanguageCode } from './index';

export type RideServiceTier = 'standard' | 'comfort' | 'xl' | 'executive' | 'delivery';

export interface NanivioDriver {
  id: string;
  userId: string;
  nvId: string; // Permanent Nanivio User ID (e.g., 0486821940)
  name: string;
  phone: string;
  avatar: string;
  rating: number;
  tripsCount: number;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehicleColor: string;
  plateNumber: string;
  serviceTier: RideServiceTier;
  seats: number;
  hasAC: boolean;
  offersCarRental: boolean;
  rentalDailyRateGHS?: number;
  country: string;
  state: string;
  city: string;
  constituency: string;
  districtOrMunicipality: string;
  spokenLanguages: SupportedLanguageCode[];
  lat: number;
  lng: number;
  heading: number;
  isOnline: boolean;
  status: 'available' | 'en_route_pickup' | 'on_trip' | 'offline';
}

export interface RideTierOption {
  id: RideServiceTier;
  title: string;
  subtitle: string;
  etaMinutes: number;
  capacity: number;
  baseFareGHS: number;
  ratePerKmGHS: number;
  ratePerMinuteGHS: number;
  icon: string;
  popularBadge?: string;
  tagline: string;
}

export type RideTripStatus =
  | 'idle'
  | 'searching'
  | 'driver_assigned'
  | 'driver_arriving'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface RideTripState {
  id: string;
  status: RideTripStatus;
  pickup: {
    address: string;
    lat: number;
    lng: number;
    label: string;
  };
  destination: {
    address: string;
    lat: number;
    lng: number;
    label: string;
  };
  tier: RideServiceTier;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  fareGHS: number;
  fareUSD: number;
  driver?: NanivioDriver;
  driverEtaMinutes?: number;
  paymentMethod: 'WALLET' | 'MOMO' | 'CARD' | 'CASH';
  otp: string;
  progressPercent?: number;
  createdAt: number;
  completedAt?: number;
}

export interface RentalVehicle {
  id: string;
  companyName: string;
  ownerNvId: string;
  make: string;
  model: string;
  year: number;
  type: 'Compact / Sedan' | 'Executive Sedan' | 'Compact SUV' | 'Full-Size 4x4 / Prado' | 'Passenger Van';
  transmission: 'Automatic' | 'Manual';
  fuel: 'Petrol' | 'Diesel' | 'Hybrid';
  seats: number;
  dailyRateGHS: number;
  dailyRateUSD: number;
  hasAC: boolean;
  unlimitedMileage: boolean;
  withDriverOption: boolean;
  driverDailyFeeGHS: number;
  image: string;
  rating: number;
  reviewCount: number;
  location: {
    country: string;
    state: string;
    city: string;
    constituency: string;
    districtOrMunicipality: string;
    pickupSpot: string;
  };
  features: string[];
  isAvailable: boolean;
}

export type NearbyServiceType =
  | 'mechanic'
  | 'hospital'
  | 'restaurant'
  | 'business'
  | 'mall'
  | 'shop'
  | 'supermarket'
  | 'hotel'
  | 'bank_momo'
  | 'beauty'
  | 'autorent';

export interface NearbyLivePlace {
  id: string;
  type: NearbyServiceType;
  categoryLabel: string;
  name: string;
  rating: number;
  reviewCount: number;
  address: string;
  country: string;
  state: string;
  city: string;
  constituency: string;
  districtOrMunicipality: string;
  phone: string;
  nvId?: string; // Verified Nanivio Contact Line
  lat: number;
  lng: number;
  isOpen: boolean;
  openHours: string;
  distanceKm: number;
  image: string;
  description: string;
  tags: string[];
  specialServices: string[];
  isVerifiedBusiness: boolean;
}

import { ALL_COUNTRY_CALLING_CODES } from '../data/countryCallingCodes';
import { GlobalCityLocation, POPULAR_GLOBAL_CITIES } from '../data/globalServicesData';

export interface UserLocationState {
  city: string;
  stateOrRegion: string;
  country: string;
  countryCode: string;
  flag: string;
  lat: number;
  lng: number;
  isDetected: boolean;
  source: 'gps' | 'ip' | 'manual';
}

const STORAGE_KEY = 'nanivio_current_location';

export const DEFAULT_LOCATION: UserLocationState = {
  city: 'Accra',
  stateOrRegion: 'Greater Accra',
  country: 'Ghana',
  countryCode: 'GH',
  flag: '🇬🇭',
  lat: 5.5600,
  lng: -0.2057,
  isDetected: false,
  source: 'manual',
};

class LocationService {
  private currentLocation: UserLocationState = DEFAULT_LOCATION;
  private listeners: ((loc: UserLocationState) => void)[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.city && parsed.country) {
          this.currentLocation = parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read stored location:', e);
    }
  }

  public getLocation(): UserLocationState {
    return this.currentLocation;
  }

  public setLocation(loc: Partial<UserLocationState>) {
    // Look up country flag if not provided
    let flag = loc.flag || this.currentLocation.flag;
    let countryCode = loc.countryCode || this.currentLocation.countryCode;

    if (loc.country) {
      const found = ALL_COUNTRY_CALLING_CODES.find(
        (c) => c.name.toLowerCase() === loc.country?.toLowerCase()
      );
      if (found) {
        flag = found.flag;
        countryCode = found.code;
      }
    }

    this.currentLocation = {
      ...this.currentLocation,
      ...loc,
      flag,
      countryCode,
      source: loc.source || 'manual',
    };

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentLocation));
      }
    } catch (e) {
      // Storage quota or error
    }

    this.notify();
  }

  public setFromCity(cityItem: GlobalCityLocation) {
    this.setLocation({
      city: cityItem.city,
      stateOrRegion: cityItem.stateOrRegion,
      country: cityItem.country,
      countryCode: cityItem.countryCode,
      flag: cityItem.flag,
      lat: cityItem.lat,
      lng: cityItem.lng,
      isDetected: false,
      source: 'manual',
    });
  }

  public async autoDetectLocation(): Promise<UserLocationState> {
    // 1. Try high-precision browser GPS Geolocation first
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
            enableHighAccuracy: true,
          });
        });

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        // Check if in Kumasi, Ghana bounding coordinates
        if (lat >= 6.55 && lat <= 6.85 && lng >= -1.75 && lng <= -1.45) {
          const loc: UserLocationState = {
            city: 'Kumasi',
            stateOrRegion: 'Ashanti Region',
            country: 'Ghana',
            countryCode: 'GH',
            flag: '🇬🇭',
            lat,
            lng,
            isDetected: true,
            source: 'gps',
          };
          this.setLocation(loc);
          return loc;
        }

        // Check if in Accra, Ghana bounding coordinates
        if (lat >= 5.45 && lat <= 5.75 && lng >= -0.35 && lng <= 0.05) {
          const loc: UserLocationState = {
            city: 'Accra',
            stateOrRegion: 'Greater Accra',
            country: 'Ghana',
            countryCode: 'GH',
            flag: '🇬🇭',
            lat,
            lng,
            isDetected: true,
            source: 'gps',
          };
          this.setLocation(loc);
          return loc;
        }

        // Check if in Takoradi, Ghana
        if (lat >= 4.80 && lat <= 5.00 && lng >= -1.85 && lng <= -1.65) {
          const loc: UserLocationState = {
            city: 'Takoradi',
            stateOrRegion: 'Western Region',
            country: 'Ghana',
            countryCode: 'GH',
            flag: '🇬🇭',
            lat,
            lng,
            isDetected: true,
            source: 'gps',
          };
          this.setLocation(loc);
          return loc;
        }
      } catch (gpsErr) {
        console.info('Browser GPS bypassed or timed out, trying IP detection...');
      }
    }

    // 2. Try IP-based Geolocation Lookup
    try {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (data && data.city && data.country_name) {
          const matchingCountry = ALL_COUNTRY_CALLING_CODES.find(
            (c) => c.code.toLowerCase() === (data.country_code || '').toLowerCase()
          );

          const loc: UserLocationState = {
            city: data.city || 'Accra',
            stateOrRegion: data.region || 'Greater Accra',
            country: data.country_name || 'Ghana',
            countryCode: data.country_code || 'GH',
            flag: matchingCountry?.flag || '🌐',
            lat: data.latitude || 5.5600,
            lng: data.longitude || -0.2057,
            isDetected: true,
            source: 'ip',
          };
          this.setLocation(loc);
          return loc;
        }
      }
    } catch (ipErr) {
      console.info('IP geolocation service fallback.');
    }

    // 3. Fallback: Keep existing location or default to Accra, Ghana
    return this.currentLocation;
  }

  public subscribe(callback: (loc: UserLocationState) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.currentLocation));
  }
}

export const locationService = new LocationService();

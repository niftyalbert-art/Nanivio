import React, { useState } from 'react';
import {
  Car,
  Globe,
  Building2,
  Utensils,
  Wrench,
  Shield,
  ShoppingCart,
  ShoppingBag,
  Store,
  Key,
  Hotel,
  Coins,
  Sparkles,
  Phone,
  Navigation,
  ArrowRight,
  Search,
  CheckCircle2,
  Star,
  MapPin,
  Clock,
  Compass,
  Filter,
} from 'lucide-react';
import { NearbyLivePlace, NearbyServiceType } from '../../types/drive';
import { ExpertProvider } from '../../types';
import { locationService, UserLocationState } from '../../services/locationService';

export interface ServiceCategoryDefinition {
  id: string;
  number: string;
  name: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badgeBg: string;
  badgeBorder: string;
  type: 'trip' | 'experts' | 'autorent' | NearbyServiceType;
  targetMode: 'map_services' | 'experts';
  targetSubTab?: 'rides' | 'rentals' | 'directory';
  targetFilter?: NearbyServiceType;
  tags: string[];
}

export interface ServiceCategoriesHubProps {
  places: NearbyLivePlace[];
  experts: ExpertProvider[];
  currentLocation?: UserLocationState;
  onNavigateCategory: (category: ServiceCategoryDefinition) => void;
  onCallPlace: (place: NearbyLivePlace) => void;
  onRequestRideToPlace: (place: NearbyLivePlace) => void;
  onCallExpert?: (expert: ExpertProvider) => void;
  isDriveEnabled: boolean;
}

export const SERVICE_CATEGORIES: ServiceCategoryDefinition[] = [
  {
    id: 'cat_trip',
    number: '01',
    name: '1. Trip Service',
    subtitle: 'Ride-Hailing, Airport Transfers & Chauffeurs',
    description: 'Instant on-demand rides, executive chauffeurs, airport pickup & drops across Accra with real-time GPS tracking.',
    icon: Car,
    accentColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 text-emerald-300',
    badgeBorder: 'border-emerald-500/30',
    type: 'trip',
    targetMode: 'map_services',
    targetSubTab: 'rides',
    tags: ['Standard Economy', 'Comfort Executive', 'XL Minivan', 'Airport Dispatch'],
  },
  {
    id: 'cat_experts',
    number: '02',
    name: '2. Experts Service',
    subtitle: 'Telemedicine, Legal & Tech Consultations',
    description: 'Verified Ghanaian doctors, legal advisors, accredited simultaneous interpreters, and AI engineers available for 1-on-1 calls.',
    icon: Globe,
    accentColor: 'text-sky-400',
    badgeBg: 'bg-sky-500/10 text-sky-300',
    badgeBorder: 'border-sky-500/30',
    type: 'experts',
    targetMode: 'experts',
    tags: ['Healthcare & MDs', 'Legal & Trade', 'Certified Interpreters', 'AI Advisory'],
  },
  {
    id: 'cat_business',
    number: '03',
    name: '3. Business Services',
    subtitle: 'Tech Hubs, Corporate & B2B Solutions',
    description: 'Nanivio Ghana Innovation Tower, corporate headquarters, logistics facilities, and verified commercial trade offices.',
    icon: Building2,
    accentColor: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/10 text-cyan-300',
    badgeBorder: 'border-cyan-500/30',
    type: 'business',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'business',
    tags: ['Innovation Hub', 'Enterprise API', 'Trade Office', 'Logistics'],
  },
  {
    id: 'cat_restaurants',
    number: '04',
    name: '4. Nearest Restaurants',
    subtitle: 'Authentic Ghanaian & Continental Dining',
    description: 'Discover nearby chop bars, fine dining, seafood terraces, and fast food with direct contact and one-tap ride routing.',
    icon: Utensils,
    accentColor: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 text-emerald-300',
    badgeBorder: 'border-emerald-500/30',
    type: 'restaurant',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'restaurant',
    tags: ['Jollof Rice', 'Grilled Tilapia', 'Continental Buffet', 'Outdoor Terrace'],
  },
  {
    id: 'cat_mechanics',
    number: '05',
    name: '5. Auto-Fitting / Services Near',
    subtitle: 'Vehicle Diagnostics, Towing & Repairs',
    description: 'Nearest verified auto mechanics, computerized engine diagnostics, brake fitting, battery revival, and emergency roadside towing.',
    icon: Wrench,
    accentColor: 'text-amber-400',
    badgeBg: 'bg-amber-500/10 text-amber-300',
    badgeBorder: 'border-amber-500/30',
    type: 'mechanic',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'mechanic',
    tags: ['Engine Diagnostics', 'Brake Systems', 'Towing Recovery', '24/7 Mobile Help'],
  },
  {
    id: 'cat_hospitals',
    number: '06',
    name: '6. Nearness Clinics & Healthcare',
    subtitle: '24/7 Emergency Hospitals & Medical Centers',
    description: 'Accra regional trauma hospitals, certified medical clinics, trauma centers, and licensed pharmacies with instant hotline dialing.',
    icon: Shield,
    accentColor: 'text-rose-400',
    badgeBg: 'bg-rose-500/10 text-rose-300',
    badgeBorder: 'border-rose-500/30',
    type: 'hospital',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'hospital',
    tags: ['24/7 Emergency', 'Ambulance Unit', 'Pharmacy', 'Trauma Center'],
  },
  {
    id: 'cat_supermarkets',
    number: '07',
    name: '7. Nearness Supermarkets & Provisions',
    subtitle: 'Hypermarkets, Fresh Groceries & Provisions',
    description: 'Full-line grocery stores, fresh fruit & vegetable markets, bakeries, imported goods, and household provisions.',
    icon: ShoppingCart,
    accentColor: 'text-lime-400',
    badgeBg: 'bg-lime-500/10 text-lime-300',
    badgeBorder: 'border-lime-500/30',
    type: 'supermarket',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'supermarket',
    tags: ['Fresh Bakery', 'Organic Produce', 'Imported Foods', 'Curbside Pickup'],
  },
  {
    id: 'cat_malls',
    number: '08',
    name: '8. Nearness Mall',
    subtitle: 'Mega Malls, Cinemas & Entertainment Plazas',
    description: 'Air-conditioned retail complexes, international brand shops, cinema multiplexes, lifestyle centers, and food courts.',
    icon: ShoppingBag,
    accentColor: 'text-purple-400',
    badgeBg: 'bg-purple-500/10 text-purple-300',
    badgeBorder: 'border-purple-500/30',
    type: 'mall',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'mall',
    tags: ['Accra Mall', 'Cinema Halls', 'Food Court', 'ATM Centers'],
  },
  {
    id: 'cat_shops',
    number: '09',
    name: '9. Nearness Shops',
    subtitle: 'Electronics, Fashion, Tech & Boutiques',
    description: 'Authorized gadget stores, laptops, Apple/Samsung devices, authentic African wax prints, and lifestyle boutiques.',
    icon: Store,
    accentColor: 'text-sky-400',
    badgeBg: 'bg-sky-500/10 text-sky-300',
    badgeBorder: 'border-sky-500/30',
    type: 'shop',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'shop',
    tags: ['Electronics & Gadgets', 'African Fashion', 'Phones & Laptops', 'Bespoke Tailoring'],
  },
  {
    id: 'cat_autorent',
    number: '10',
    name: '10. Nearness Auto Rent / Purchase',
    subtitle: 'Uba Rentals, Chauffeur Fleets & Dealerships',
    description: 'Self-drive and chauffeur car rentals, Toyota Land Cruiser Prados, Mercedes-Benz sedans, and authorized vehicle sales showrooms.',
    icon: Key,
    accentColor: 'text-violet-400',
    badgeBg: 'bg-violet-500/10 text-violet-300',
    badgeBorder: 'border-violet-500/30',
    type: 'autorent',
    targetMode: 'map_services',
    targetSubTab: 'rentals',
    tags: ['Uba Car Renting', 'Prado 4x4 SUVs', 'Luxury Sedans', 'Certified Pre-Owned'],
  },
  {
    id: 'cat_hotels',
    number: '11',
    name: '11. Hotels & Accommodations',
    subtitle: '5-Star Luxury Hotels & Beach Resorts',
    description: 'Executive accommodations, beachfront suites, conference ballrooms, poolside lounges, and private guest villas.',
    icon: Hotel,
    accentColor: 'text-orange-400',
    badgeBg: 'bg-orange-500/10 text-orange-300',
    badgeBorder: 'border-orange-500/30',
    type: 'hotel',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'hotel',
    tags: ['5-Star Luxury', 'Beachfront Villas', 'Swimming Pools', 'Airport Shuttles'],
  },
  {
    id: 'cat_banking',
    number: '12',
    name: '12. Banking, MoMo & Forex Bureaus',
    subtitle: 'Mobile Money Agents, ATMs & Currency Exchange',
    description: 'GCB, Ecobank, MTN MoMo Super Agents for high-volume cashout, multi-currency ATMs, and authorized currency exchange bureaus.',
    icon: Coins,
    accentColor: 'text-teal-400',
    badgeBg: 'bg-teal-500/10 text-teal-300',
    badgeBorder: 'border-teal-500/30',
    type: 'bank_momo',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'bank_momo',
    tags: ['MTN MoMo Agents', 'Forex Bureaus', '24/7 ATMs', 'Cash Escrow Counter'],
  },
  {
    id: 'cat_beauty',
    number: '13',
    name: '13. Beauty, Salons & Wellness',
    subtitle: 'Executive Barbershops, Spas & Aesthetic Clinics',
    description: 'Gentlemen grooming lounges, massage therapy, holistic day spas, hair aesthetics, and organic wellness clinics.',
    icon: Sparkles,
    accentColor: 'text-pink-400',
    badgeBg: 'bg-pink-500/10 text-pink-300',
    badgeBorder: 'border-pink-500/30',
    type: 'beauty',
    targetMode: 'map_services',
    targetSubTab: 'directory',
    targetFilter: 'beauty',
    tags: ['Gentlemen Barbers', 'Aromatherapy Spas', 'Deep Tissue Massage', 'VIP Grooming'],
  },
];

export const ServiceCategoriesHub: React.FC<ServiceCategoriesHubProps> = ({
  places,
  experts,
  currentLocation,
  onNavigateCategory,
  onCallPlace,
  onRequestRideToPlace,
  onCallExpert,
  isDriveEnabled,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeLoc, setActiveLoc] = useState<UserLocationState>(
    () => currentLocation || locationService.getLocation()
  );

  React.useEffect(() => {
    if (currentLocation) {
      setActiveLoc(currentLocation);
      return;
    }
    const unsub = locationService.subscribe((loc) => {
      setActiveLoc(loc);
    });
    return () => unsub();
  }, [currentLocation]);

  const filteredCategories = SERVICE_CATEGORIES.filter((cat) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchName = cat.name.toLowerCase().includes(q);
    const matchSubtitle = cat.subtitle.toLowerCase().includes(q);
    const matchDesc = cat.description.toLowerCase().includes(q);
    const matchTags = cat.tags.some((t) => t.toLowerCase().includes(q));
    return matchName || matchSubtitle || matchDesc || matchTags;
  });

  // Calculate matching places for each category
  const getPlacesForCategory = (cat: ServiceCategoryDefinition): NearbyLivePlace[] => {
    if (cat.type === 'trip' || cat.type === 'experts') return [];
    return places.filter((p) => p.type === cat.type);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Category Hero / Header */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-[#07111e] to-[#040812] border border-slate-800 p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
            <span className="text-sm">{activeLoc.flag}</span>
            <span>Nanivio {activeLoc.city} Services Directory</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-1" />
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
            Explore All Available Services &amp; Verified Places in {activeLoc.city}
          </h2>

          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-2xl">
            Showing verified local specialists, hospitals, shopping centers, automotive workshops, and dining in {activeLoc.city}, {activeLoc.country}. Book on-demand rides, call registered local businesses via encrypted NV Line, or navigate with Google Maps.
          </p>

          {/* Search Bar across all categories */}
          <div className="pt-2">
            <div className="relative max-w-xl">
              <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search trip service, restaurants, auto-fitting, malls, shops, hospitals..."
                className="w-full pl-10 pr-4 py-3 bg-slate-950/90 border border-slate-700/80 rounded-2xl text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded-lg bg-slate-800"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Decorative Grid background */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      </div>

      {/* Grid of 13 Organized Service Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {filteredCategories.map((category) => {
          const Icon = category.icon;
          const categoryPlaces = getPlacesForCategory(category);
          const isTrip = category.type === 'trip';
          const isExpert = category.type === 'experts';

          return (
            <div
              key={category.id}
              className="group relative rounded-3xl bg-slate-950/80 hover:bg-slate-900/90 border border-slate-800 hover:border-emerald-500/50 transition-all duration-200 p-5 sm:p-6 flex flex-col justify-between shadow-xl hover:shadow-emerald-950/30"
            >
              <div className="space-y-4">
                {/* Header row: Number badge, icon, and place count */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 group-hover:bg-slate-800 border border-slate-700/80 group-hover:border-emerald-500/40 flex items-center justify-center shrink-0 transition-colors shadow-md">
                      <Icon className={`w-6 h-6 ${category.accentColor}`} />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono font-black text-slate-400 group-hover:text-emerald-400 transition-colors tracking-wider">
                        CATEGORY {category.number}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
                        {category.name}
                      </h3>
                    </div>
                  </div>

                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${category.badgeBg} ${category.badgeBorder}`}>
                    {isTrip
                      ? isDriveEnabled ? 'Live Fleet' : 'Admin Off'
                      : isExpert
                      ? `${experts.length} Specialists`
                      : `${categoryPlaces.length} Locations`}
                  </span>
                </div>

                {/* Subtitle & Description */}
                <div>
                  <h4 className="text-xs font-semibold text-emerald-400 mb-1">{category.subtitle}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{category.description}</p>
                </div>

                {/* Feature Tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {category.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-900/90 text-slate-300 border border-slate-800 font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Quick Preview of Top 2 Places (if applicable) */}
                {categoryPlaces.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between">
                      <span>Featured Verified Contacts</span>
                      <span className="text-slate-400 text-[10px]">Accra Area</span>
                    </div>

                    <div className="space-y-1.5">
                      {categoryPlaces.slice(0, 2).map((place) => (
                        <div
                          key={place.id}
                          className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-bold text-white truncate text-[11px]">{place.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{place.address}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCallPlace(place);
                              }}
                              className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 cursor-pointer"
                              title={`Call ${place.name} via NV Line`}
                            >
                              <Phone className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequestRideToPlace(place);
                              }}
                              className="p-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 cursor-pointer"
                              title={`Book Nanivio Ride to ${place.name}`}
                            >
                              <Navigation className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button: Opens the Right Page / Map View */}
              <div className="pt-4 mt-2">
                <button
                  onClick={() => onNavigateCategory(category)}
                  className="w-full py-2.5 px-4 rounded-2xl bg-slate-900 group-hover:bg-emerald-500 text-slate-200 group-hover:text-slate-950 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700/80 group-hover:border-emerald-400 transition-all cursor-pointer shadow-md"
                >
                  <span>
                    {isTrip
                      ? 'Open Ride Hailing Portal'
                      : isExpert
                      ? 'Browse Verified Experts'
                      : `View All ${category.name}`}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

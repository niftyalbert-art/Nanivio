import React, { useState } from 'react';
import {
  Car,
  Navigation,
  Globe,
  Mic,
  PhoneCall,
  CreditCard,
  Sparkles,
  Megaphone,
  Bot,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Play,
  Layers,
  Settings,
  Zap,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';

export const AdminFeatureLauncher: React.FC = () => {
  const {
    adminFeatures,
    updateAdminFeature,
    setActiveTab,
    start1on1Call,
    onlineUsers,
    globalLangpretationEnabled,
    setGlobalLangpretationEnabled,
    setIsLanguageModalOpen,
  } = useNanivio();

  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const featureDeck = [
    {
      id: 'nanivio-ride-master',
      title: 'Nanivio Ride Service (Master On/Off)',
      description: 'Master administrative switch to toggle Nanivio Ride bookings, vehicle hailing, live route radar, and driver trip matching.',
      icon: Car,
      color: 'from-indigo-700 via-purple-800 to-slate-900',
      badge: 'RIDE MASTER ACCESS',
      switchKey: 'nanivioRideEnabled',
      isEnabled: adminFeatures.nanivioRideEnabled !== false,
      tabTarget: 'ride',
      primaryActionLabel: 'Launch Ride Console',
      testAction: () => {
        setActiveTab('ride');
        showToast('Opened Nanivio Ride');
      },
    },
    {
      id: 'nanivio-drive-master',
      title: 'Entire Nanivio Drive Fleet (Master Control)',
      description: 'Master platform kill-switch for all vehicle booking, Uba car rentals, live Accra driver dispatch radar, and partner cockpits.',
      icon: Car,
      color: 'from-emerald-700 via-teal-800 to-slate-900',
      badge: 'MASTER FLEET SWITCH',
      switchKey: 'nanivioDriveEnabled',
      isEnabled: adminFeatures.nanivioDriveEnabled !== false,
      tabTarget: 'services',
      primaryActionLabel: 'Open Services Fleet',
      testAction: () => {
        setActiveTab('services');
        showToast('Navigated to Services -> Nanivio Drive');
      },
    },
    {
      id: 'ride-hailing',
      title: 'Nanivio Ride-Hailing (Rider Mode)',
      description: 'Accra vehicle booking, live pickup & destination search, tier pricing (Standard, Comfort, Black, Van), and live radar dispatch.',
      icon: Car,
      color: 'from-emerald-600 to-teal-700',
      badge: 'FLAGSHIP',
      switchKey: 'rideHailingEnabled',
      isEnabled: adminFeatures.rideHailingEnabled !== false,
      tabTarget: 'services',
      primaryActionLabel: 'Launch Rider View',
      testAction: () => {
        setActiveTab('services');
        showToast('Opened Services -> Ride-Hailing Console');
      },
    },
    {
      id: 'driver-cockpit',
      title: 'Nanivio Drive Partner Cockpit',
      description: 'Driver offer reception HUD, 15-second countdown timer, accept/decline sound effects, and synchronized turn-by-turn navigation.',
      icon: Navigation,
      color: 'from-amber-600 to-yellow-700',
      badge: 'DRIVER HUD',
      switchKey: 'driverPartnerAppEnabled',
      isEnabled: adminFeatures.driverPartnerAppEnabled !== false,
      tabTarget: 'services',
      primaryActionLabel: 'Launch Driver Cockpit',
      testAction: () => {
        setActiveTab('services');
        showToast('Opened Driver Partner Cockpit');
      },
    },
    {
      id: 'maps-sdk',
      title: 'Google Maps Platform SDK & Vector Engine',
      description: 'Interactive map renderer with live driver GPS markers, route polylines, satellite imagery, traffic layer, and fallback vector engine.',
      icon: Globe,
      color: 'from-cyan-600 to-blue-700',
      badge: 'GEOSPATIAL',
      switchKey: 'googleMapsSdkEnabled',
      isEnabled: adminFeatures.googleMapsSdkEnabled !== false,
      tabTarget: 'services',
      primaryActionLabel: 'View Interactive Map',
      testAction: () => {
        setActiveTab('services');
        showToast('Opened Interactive Map Viewer');
      },
    },
    {
      id: 'langpretation-core',
      title: 'Multilateral Langpretation Core (15 Languages)',
      description: 'Real-time neural speech-to-speech translation during live audio & video calls with Twi, Ga, Ewe, Hausa, Yoruba, French, and English.',
      icon: Mic,
      color: 'from-emerald-500 to-green-700',
      badge: 'SIGNATURE AI',
      switchKey: 'langpretationEnabled',
      isEnabled: adminFeatures.langpretationEnabled,
      tabTarget: 'calls',
      primaryActionLabel: 'Test Live Call',
      testAction: () => {
        if (onlineUsers.length > 0) {
          start1on1Call(onlineUsers[0], 'audio');
          showToast(`Started test call with ${onlineUsers[0].name}`);
        } else {
          setActiveTab('calls');
          showToast('Navigated to Calls Workspace');
        }
      },
    },
    {
      id: 'services-hub',
      title: 'Verified Services & Consultation Hub',
      description: 'Directory of verified experts, cross-border triage physicians, legal counsels, and logistics specialists with live billing.',
      icon: Sparkles,
      color: 'from-amber-500 to-amber-700',
      badge: 'SERVICES',
      switchKey: 'expertConsultationsEnabled',
      isEnabled: adminFeatures.expertConsultationsEnabled !== false,
      tabTarget: 'services',
      primaryActionLabel: 'Open Services Hub',
      testAction: () => {
        setActiveTab('services');
        showToast('Opened Verified Services Hub');
      },
    },
    {
      id: 'universal-billing',
      title: 'Universal Billing & Monetization Engine',
      description: 'Real-time metered billing, subscription tiers (Basic, Pro, Enterprise), automated invoices, dispute resolutions, and ledger entries.',
      icon: CreditCard,
      color: 'from-purple-600 to-indigo-800',
      badge: 'LEDGER',
      switchKey: 'paidCallsEnabled',
      isEnabled: adminFeatures.paidCallsEnabled,
      tabTarget: 'billing',
      primaryActionLabel: 'Open Billing Hub',
      testAction: () => {
        setActiveTab('billing');
        showToast('Opened Universal Billing Hub');
      },
    },
    {
      id: 'expert-services',
      title: 'Verified Expert Consultations',
      description: 'Healthcare, legal, technical, and certified interpreters with per-minute rate meters, background credential checks, and live booking.',
      icon: Sparkles,
      color: 'from-rose-600 to-pink-800',
      badge: 'MARKETPLACE',
      switchKey: 'expertsEnabled',
      isEnabled: adminFeatures.expertsEnabled,
      tabTarget: 'services',
      primaryActionLabel: 'Open Expert Queue',
      testAction: () => {
        setActiveTab('services');
        showToast('Opened Expert Marketplace');
      },
    },
    {
      id: 'live-ads',
      title: 'Live Sponsored Advertising Engine',
      description: 'Non-intrusive banner and video ads with impression tracking, click-through metrics, Ghanaian merchant sponsorship, and collapse rules.',
      icon: Megaphone,
      color: 'from-blue-600 to-cyan-800',
      badge: 'MONETIZATION',
      switchKey: 'liveAdsEnabled',
      isEnabled: adminFeatures.liveAdsEnabled,
      tabTarget: 'calls',
      primaryActionLabel: 'View Active Ads',
      testAction: () => {
        setActiveTab('calls');
        showToast('Opened Communication Workspace with live ads');
      },
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-emerald-950 border border-emerald-500/50 text-emerald-200 text-xs font-bold flex items-center gap-2 shadow-2xl animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Nanivio Sovereign Feature Command Deck</span>
            </h2>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
              ALL FEATURES SANDBOX
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Instant administrative access, feature kill-switches, and live interactive launchpads for every platform subsystem
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLanguageModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-emerald-500/50 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md"
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Configure Dialects</span>
          </button>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {featureDeck.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.id}
              className="bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col justify-between hover:border-slate-700 transition-all group"
            >
              <div className="space-y-3">
                {/* Header with Icon and Switch */}
                <div className="flex items-start justify-between">
                  <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center text-white shadow-lg`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[9px] font-extrabold font-mono bg-slate-950 text-slate-300 border border-slate-800">
                      {feature.badge}
                    </span>

                    {/* Feature Switch Toggle */}
                    {feature.switchKey && (
                      <button
                        onClick={() =>
                          updateAdminFeature(
                            feature.switchKey as any,
                            !feature.isEnabled
                          )
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                          feature.isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                        title={feature.isEnabled ? 'Feature is LIVE' : 'Feature is DISABLED'}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            feature.isEnabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    )}
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 mt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  <span className={`w-2 h-2 rounded-full ${feature.isEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                  <span className={feature.isEnabled ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    {feature.isEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>

                <button
                  onClick={feature.testAction}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-emerald-950 text-slate-200 hover:text-emerald-300 border border-slate-700 hover:border-emerald-500/50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                  <span>{feature.primaryActionLabel}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

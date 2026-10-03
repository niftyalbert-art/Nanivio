import React, { useState } from 'react';
import {
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Sliders,
  DollarSign,
  Radio,
  Activity,
  AlertOctagon,
  Users,
  Sparkles,
  PhoneCall,
  Save,
  Check,
  Server,
  Zap,
  Building2,
  Award,
  ShieldAlert,
  Lock,
  KeyRound,
  CreditCard,
  Car,
  MapPin,
  Navigation,
  Globe,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { AdminFeatureSwitches, AdminPricingEngine } from '../../types';
import { AdminUserDirectory } from './AdminUserDirectory';
import { AdminExpertQueue } from './AdminExpertQueue';
import { AdminBusinessQueue } from './AdminBusinessQueue';
import { AdminDriverQueue } from './AdminDriverQueue';
import { AdminAuditTrail } from './AdminAuditTrail';
import { AdminPaymentGatewaysManager } from './AdminPaymentGatewaysManager';
import { AdminRideHailingMapsManager } from './AdminRideHailingMapsManager';
import { AdminFeatureLauncher } from './AdminFeatureLauncher';
import { AdminLangpretationManager } from './AdminLangpretationManager';

export const AdminControlCenter: React.FC = () => {
  const {
    adminFeatures,
    updateAdminFeature,
    adminPricing,
    updateAdminPricing,
    activeCall,
    endCall,
    isAdmin,
    authUser,
    quickSwitchDemoUser,
    signInWithAdminToken,
    adminExpertsList,
    adminBusinessesList,
    adminDriversList,
    adminUsersList,
  } = useNanivio();

  const [adminSubTab, setAdminSubTab] = useState<'launcher' | 'langpretation' | 'rides-maps' | 'users' | 'experts' | 'businesses' | 'drivers' | 'gateways' | 'audit' | 'switches'>('launcher');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [keyError, setKeyError] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handlePricingChange = (key: keyof AdminPricingEngine, val: number) => {
    updateAdminPricing(key, val);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 1500);
  };

  const handleAdminKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyError('');
    try {
      await signInWithAdminToken(adminKeyInput);
    } catch (err: any) {
      setKeyError(err.message || 'Invalid administrative authorization key.');
    }
  };

  // Protected Admin Access Gate
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto p-4 sm:p-6 mt-8 sm:mt-16 animate-in fade-in duration-200">
        <div className="bg-gradient-to-b from-[#0c1626] to-[#080e18] border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto shadow-lg">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-white">Nanivio Admin Gateway</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              This environment is protected and strictly restricted to authorized Nanivio Operations &amp; Compliance Officers. All access attempts are recorded in the sovereign audit ledger.
            </p>
          </div>

          <form onSubmit={handleAdminKeySubmit} className="space-y-3 text-left">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>Admin Master Key</span>
                </label>
                <button
                  type="button"
                  onClick={() => setAdminKeyInput('NANIVIO-ADMIN-MASTER-2026')}
                  className="text-[10px] text-amber-400 hover:text-amber-300 underline font-mono cursor-pointer"
                >
                  Insert Master Key
                </button>
              </div>
              <input
                type="text"
                value={adminKeyInput}
                onChange={(e) => setAdminKeyInput(e.target.value)}
                placeholder="NANIVIO-ADMIN-MASTER-2026"
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-500/70 font-mono tracking-wider"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>Master key: <strong className="text-amber-400 select-all">NANIVIO-ADMIN-MASTER-2026</strong></span>
                <span>or NV ID: <strong className="text-slate-400 select-all">0486000001</strong></span>
              </div>
              {keyError && <p className="text-xs text-red-400 font-medium">{keyError}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4 text-slate-950" />
              <span>Verify &amp; Unlock Super Admin</span>
            </button>
          </form>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-500">
              <span className="bg-[#0c1626] px-2">Authorized Demo Bypass</span>
            </div>
          </div>

          <button
            onClick={() => quickSwitchDemoUser('admin')}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Enter as Super Admin (0486000001)</span>
          </button>
        </div>
      </div>
    );
  }

  const pendingExpertsCount = adminExpertsList.filter((e) => e.verificationStatus === 'PENDING').length;
  const pendingBusinessesCount = adminBusinessesList.filter((b) => b.verificationStatus === 'PENDING').length;
  const pendingDriversCount = adminDriversList.filter((d) => d.verificationStatus === 'PENDING').length;

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-200 w-full max-w-full overflow-x-hidden">
      {/* Admin Header */}
      <div className="bg-gradient-to-r from-slate-900 via-[#101b2b] to-[#0a1220] border border-amber-500/40 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-white">Nanivio Admin &amp; Operations Center</h1>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30">
                Super Admin
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live feature switches, pricing engine, commission rates, and real-time session telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-950/80 px-3.5 py-2 rounded-2xl border border-slate-800 text-xs font-mono">
          <Server className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-400">Node Cluster:</span>
          <span className="text-emerald-400 font-bold">Accra Central (Online)</span>
        </div>
      </div>

      {/* Real-time Telemetry Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-[#0c1424] border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-xs text-slate-400 font-mono uppercase">Active Call Sessions</div>
          <div className="text-2xl font-extrabold text-white font-mono flex items-center gap-2">
            <span>{activeCall ? '1 Active' : '0 Active'}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-[10px] text-slate-500">1:1 &amp; Multilateral RTC</div>
        </div>

        <div className="bg-[#0c1424] border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-xs text-slate-400 font-mono uppercase">Langpretation Mins (24h)</div>
          <div className="text-2xl font-extrabold text-emerald-400 font-mono">
            4,820 <span className="text-xs text-slate-400">mins</span>
          </div>
          <div className="text-[10px] text-emerald-500">Multilateral Langpretation Core</div>
        </div>

        <div className="bg-[#0c1424] border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-xs text-slate-400 font-mono uppercase">Online Experts</div>
          <div className="text-2xl font-extrabold text-amber-400 font-mono">
            18 <span className="text-xs text-slate-400">verified</span>
          </div>
          <div className="text-[10px] text-slate-500">MDs, Legal, Interpreters</div>
        </div>

        <div className="bg-[#0c1424] border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-xs text-slate-400 font-mono uppercase">Gross Settlement (Today)</div>
          <div className="text-2xl font-extrabold text-white font-mono">
            GH₵ 142.5k
          </div>
          <div className="text-[10px] text-slate-500">Cross-Border Rails &amp; MoMo</div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SUB-NAVIGATION TABS */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto scrollbar-none touch-pan-x w-full max-w-full">
        <button
          id="tab-admin-launcher"
          onClick={() => setAdminSubTab('launcher')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'launcher'
              ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <Zap className="w-4 h-4 text-slate-950" />
          <span>All Features Command Deck</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            adminSubTab === 'launcher' ? 'bg-slate-950 text-amber-300' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
          }`}>
            ALL ACCESS
          </span>
        </button>

        <button
          id="tab-admin-langpretation"
          onClick={() => setAdminSubTab('langpretation')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'langpretation'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <Globe className="w-4 h-4 text-emerald-400" />
          <span>18-Language Langpretation</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            adminSubTab === 'langpretation' ? 'bg-slate-950 text-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}>
            18 / 18
          </span>
        </button>

        <button
          id="tab-admin-rides-maps"
          onClick={() => setAdminSubTab('rides-maps')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'rides-maps'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <Car className="w-4 h-4" />
          <span>Ride-Hailing &amp; Maps Radar</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            adminSubTab === 'rides-maps' ? 'bg-slate-950 text-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          }`}>
            DISPATCH &amp; GPS
          </span>
        </button>

        <button
          id="tab-admin-users"
          onClick={() => setAdminSubTab('users')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'users'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Directory &amp; Dossiers</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
            adminSubTab === 'users' ? 'bg-slate-950 text-emerald-300' : 'bg-slate-800 text-slate-400'
          }`}>
            {adminUsersList.length}
          </span>
        </button>

        <button
          id="tab-admin-experts"
          onClick={() => setAdminSubTab('experts')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'experts'
              ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Expert Review Queue</span>
          {pendingExpertsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-400 text-slate-950 font-black">
              {pendingExpertsCount}
            </span>
          )}
        </button>

        <button
          id="tab-admin-businesses"
          onClick={() => setAdminSubTab('businesses')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'businesses'
              ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Business Queue</span>
          {pendingBusinessesCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-400 text-slate-950 font-black">
              {pendingBusinessesCount}
            </span>
          )}
        </button>

        <button
          id="tab-admin-drivers"
          onClick={() => setAdminSubTab('drivers')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'drivers'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <Car className="w-4 h-4" />
          <span>Nanivio Driver Queue</span>
          {pendingDriversCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-400 text-slate-950 font-black">
              {pendingDriversCount}
            </span>
          )}
        </button>

        <button
          id="tab-admin-gateways"
          onClick={() => setAdminSubTab('gateways')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'gateways'
              ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payment Gateways &amp; Settlement</span>
        </button>

        <button
          id="tab-admin-audit"
          onClick={() => setAdminSubTab('audit')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'audit'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Audit Logs &amp; Security</span>
        </button>

        <button
          id="tab-admin-switches"
          onClick={() => setAdminSubTab('switches')}
          className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
            adminSubTab === 'switches'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Feature Switches &amp; Pricing</span>
        </button>
      </div>

      {/* Sub-tab Views */}
      {adminSubTab === 'launcher' && <AdminFeatureLauncher />}
      {adminSubTab === 'langpretation' && <AdminLangpretationManager />}
      {adminSubTab === 'rides-maps' && <AdminRideHailingMapsManager />}
      {adminSubTab === 'users' && <AdminUserDirectory />}
      {adminSubTab === 'experts' && <AdminExpertQueue />}
      {adminSubTab === 'businesses' && <AdminBusinessQueue />}
      {adminSubTab === 'drivers' && <AdminDriverQueue />}
      {adminSubTab === 'gateways' && <AdminPaymentGatewaysManager />}
      {adminSubTab === 'audit' && <AdminAuditTrail />}

      {/* Existing Switches & Telemetry Tab */}
      {adminSubTab === 'switches' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* ------------------------------------------------------------- */}
          {/* ADMIN MALVI OPERATIONS ASSISTANT & AUDIT LOG VIEWER */}
          {/* ------------------------------------------------------------- */}
          <div className="bg-gradient-to-br from-[#0c1424] via-[#0f1a2e] to-[#0a1120] border border-cyan-500/30 rounded-3xl p-6 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Admin Malvi Operations Assistant</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold border border-cyan-500/30">
                  SYSTEM INTELLIGENCE
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Natural-language system queries, cluster health diagnostics, and audit trail records
              </p>
            </div>
          </div>

          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-3 py-1 rounded-full self-start sm:self-auto">
            ● Authorized Super-Admin Mode
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Quick Query Actions */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quick Diagnostics</div>
            <div className="grid grid-cols-1 gap-2">
              {[
                { title: "Today's Transaction Volume", desc: "Settlement breakdown across rails" },
                { title: "Active RTC Call Channels", desc: "Nanivio audio/video telemetry check" },
                { title: "Langpretation Gateway Status", desc: "15-language neural throughput" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-colors cursor-pointer"
                >
                  <div className="text-xs font-bold text-white">{item.title}</div>
                  <div className="text-[11px] text-slate-400">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Operations Audit Trail */}
          <div className="lg:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent System Audit Trail</div>
              <span className="text-[10px] font-mono text-slate-500">Immutable Ledger</span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {[
                {
                  id: "AUD-8921",
                  user: "super_admin@nanivio.tech",
                  action: "FEATURE_SWITCH_AUDIT",
                  res: "adminFeatureSwitches.langpretationEnabled",
                  status: "PASS",
                  time: "12m ago",
                  desc: "Verified high-availability status across 15 target languages.",
                },
                {
                  id: "AUD-8920",
                  user: "super_admin@nanivio.tech",
                  action: "SYSTEM_BOOTSTRAP",
                  res: "Node Cluster: Accra Central",
                  status: "ONLINE",
                  time: "1h ago",
                  desc: "Initialized Malvi AI engine v2.5 and Langpretation neural gateway.",
                },
                {
                  id: "AUD-8919",
                  user: "system_kernel",
                  action: "PRICING_ENGINE_VERIFICATION",
                  res: "USD 0.15/min • GH₵ 2.20/min",
                  status: "SYNCHRONIZED",
                  time: "3h ago",
                  desc: "Verified currency parity with Bank of Ghana cross-border rates.",
                },
              ].map((entry, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-cyan-400">{entry.id}</span>
                      <span className="font-bold text-white text-[11px]">{entry.action}</span>
                    </div>
                    <p className="text-[11px] text-slate-300">{entry.desc}</p>
                    <div className="text-[10px] font-mono text-slate-500">
                      {entry.user} • {entry.res}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold font-mono text-[9px]">
                      {entry.status}
                    </span>
                    <div className="text-[9px] text-slate-500 mt-1">{entry.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>


      {/* ------------------------------------------------------------- */}
      {/* MASTER FEATURE SWITCHES (Page 21 Architecture Mandate) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Master Feature Switches &amp; Kill-Switches</span>
            </h2>
            <p className="text-xs text-slate-400">
              Instantly enable or isolate platform capabilities without application redeployment
            </p>
          </div>
        </div>

        {/* SPECIAL FEATURED SPOTLIGHT: Communication Hub Fintech & Transfer Mode */}
        <div className={`p-5 rounded-3xl border transition-all ${
          adminFeatures.commFintechEnabled
            ? 'bg-gradient-to-r from-[#0c241d] via-[#0e2a22] to-[#091814] border-emerald-500/50 shadow-xl shadow-emerald-500/10'
            : 'bg-gradient-to-r from-[#240c14] via-[#2a0e18] to-[#18090f] border-rose-500/50 shadow-xl shadow-rose-500/10'
        }`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                adminFeatures.commFintechEnabled
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-lg'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-lg'
              }`}>
                <CreditCard className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-extrabold text-white">Communication Hub: Fintech &amp; Transfers Control</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                    adminFeatures.commFintechEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}>
                    {adminFeatures.commFintechEnabled ? '● FINTECH ACTIVE IN COMM HUB' : '○ FINTECH SWITCHED OFF'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  {adminFeatures.commFintechEnabled
                    ? 'Fintech quick actions, wallet balances, and P2P transfers are currently visible and accessible from the Communication Hub.'
                    : 'All money transfer buttons, wallet badges, and fintech-specific widgets are completely hidden from regular users in the Communication Hub.'}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-cyan-300/90 font-mono pt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Does NOT affect Phone Calls, Dialer, RTC, Langpretation Quota, or Communication Subscriptions / Top-Ups.</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
              <span className={`text-xs font-mono font-bold ${adminFeatures.commFintechEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>
                {adminFeatures.commFintechEnabled ? 'ENABLED' : 'DISABLED'}
              </span>
              <button
                id="btn-admin-toggle-comm-fintech"
                onClick={() => updateAdminFeature('commFintechEnabled', !adminFeatures.commFintechEnabled)}
                className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  adminFeatures.commFintechEnabled ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-slate-700'
                }`}
                title="Click to toggle Fintech in Communication Hub ON or OFF"
              >
                <span
                  className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    adminFeatures.commFintechEnabled ? 'translate-x-8' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* SPECIAL FEATURED SPOTLIGHT: Entire Nanivio Drive & Fleet Control */}
        <div className={`p-5 rounded-3xl border transition-all ${
          adminFeatures.nanivioDriveEnabled !== false
            ? 'bg-gradient-to-r from-[#0c241d] via-[#0e2a22] to-[#091814] border-emerald-500/50 shadow-xl shadow-emerald-500/10'
            : 'bg-gradient-to-r from-[#240c14] via-[#2a0e18] to-[#18090f] border-rose-500/50 shadow-xl shadow-rose-500/10'
        }`}>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                adminFeatures.nanivioDriveEnabled !== false
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-lg'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-lg'
              }`}>
                <Car className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-extrabold text-white">Nanivio Drive: Master Fleet &amp; Ride-Hailing Control</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border ${
                    adminFeatures.nanivioDriveEnabled !== false
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}>
                    {adminFeatures.nanivioDriveEnabled !== false ? '● NANIVIO DRIVE ONLINE (FLEET ACTIVE)' : '○ NANIVIO DRIVE SWITCHED OFF (FLEET SUSPENDED)'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  {adminFeatures.nanivioDriveEnabled !== false
                    ? 'Passenger ride-hailing booking, Uba car rentals, live Accra driver dispatch radar, and the Nanivio Drive Partner Cockpit are active.'
                    : 'The entire Nanivio Drive ecosystem (ride requests, car rentals, driver radar broadcast, and partner cockpit) is completely suspended and disabled for users.'}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-cyan-300/90 font-mono pt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Does NOT affect Global Experts, Local Business Directory, Langpretation Core, RTC Voice/Video Calls, or Fintech Wallets.</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
              <span className={`text-xs font-mono font-bold ${adminFeatures.nanivioDriveEnabled !== false ? 'text-emerald-400' : 'text-rose-400'}`}>
                {adminFeatures.nanivioDriveEnabled !== false ? 'ENABLED' : 'DISABLED'}
              </span>
              <button
                id="btn-admin-toggle-nanivio-drive"
                onClick={() => updateAdminFeature('nanivioDriveEnabled', !(adminFeatures.nanivioDriveEnabled !== false))}
                className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  adminFeatures.nanivioDriveEnabled !== false ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-slate-700'
                }`}
                title="Click to toggle Entire Nanivio Drive ON or OFF"
              >
                <span
                  className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    adminFeatures.nanivioDriveEnabled !== false ? 'translate-x-8' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              key: 'nanivioDriveEnabled',
              label: 'Entire Nanivio Drive Ecosystem',
              desc: 'Master kill-switch for passenger rides, car rentals, fleet radar & driver cockpit',
              danger: true,
            },
            {
              key: 'commFintechEnabled',
              label: 'Comm Hub Fintech & Transfers',
              desc: 'Toggles money transfers & wallets in Communication Hub',
              danger: false,
            },
            {
              key: 'langpretationEnabled',
              label: 'Langpretation Engine (AI Core)',
              desc: 'Enables 1:1 and real-time live translation',
              danger: false,
            },
            {
              key: 'voiceNoteLangpretationEnabled',
              label: 'Voice Note Langpretation',
              desc: 'Automatic voice note transcription & translation',
              danger: false,
            },
            {
              key: 'rideHailingEnabled',
              label: 'Nanivio Ride-Hailing Booking',
              desc: 'Consumer vehicle booking, live radar & tier pricing',
              danger: false,
            },
            {
              key: 'googleMapsSdkEnabled',
              label: 'Google Maps Platform SDK',
              desc: 'Switches map renderer between Google Maps SDK and Vector engine',
              danger: false,
            },
            {
              key: 'driverPartnerAppEnabled',
              label: 'Driver Partner Cockpit',
              desc: 'Driver offer reception HUD, accept/decline & turn-by-turn',
              danger: false,
            },
            {
              key: 'driverInstantAcceptanceSimEnabled',
              label: 'Driver Radar Auto-Match',
              desc: 'Simulates driver acceptance within 15s countdown timeout',
              danger: false,
            },
            {
              key: 'realtimeGpsTrackingEnabled',
              label: 'Real-Time Driver GPS Radar',
              desc: 'Smooth interpolation of Accra driver markers every 3s',
              danger: false,
            },
            {
              key: 'malviAiAssistantEnabled',
              label: 'Malvi AI System Intelligence',
              desc: 'Context memory & proactive tool proposals across tabs',
              danger: false,
            },
            {
              key: 'liveServicesEnabled',
              label: 'Live Services & Marketplace',
              desc: 'Access to verified expert profiles & directory',
              danger: false,
            },
            {
              key: 'liveAdsEnabled',
              label: 'Live Ads System',
              desc: 'Sponsored promotional banners across platform',
              danger: false,
            },
            {
              key: 'freeCallsForAllUsers',
              label: 'Free Audio & Video Calls (All Users)',
              desc: 'Default: ON. When ON, calling panel displays Free Audio/Video Calls with no minute deductions. When OFF, users see monthly subscription & minutes quota.',
              danger: false,
            },
            {
              key: 'callMinutesWarningApproved',
              label: 'In-Call Minutes Running Warnings',
              desc: 'Admin authorization for in-call running minutes warnings and countdown alerts. When OFF (default), calling is free without running warnings.',
              danger: false,
            },
            {
              key: 'nanivioRideEnabled',
              label: 'Nanivio Ride Service (Master Switch)',
              desc: 'Controls consumer ride bookings, vehicle hailing, live route radar, and driver trip matching',
              danger: true,
            },
            {
              key: 'audioCallsEnabled',
              label: 'Audio Calls Master Switch',
              desc: 'Enable or disable 1-on-1 and multi-party audio calling system-wide',
              danger: false,
            },
            {
              key: 'videoCallsEnabled',
              label: 'Video Calls Master Switch',
              desc: 'Enable or disable 1-on-1 and multi-party HD video calling system-wide',
              danger: false,
            },
            {
              key: 'allowPaidAdCollapse',
              label: 'Paid User Ad Collapsing',
              desc: 'Allows Premium/Pro users to collapse live ads',
              danger: false,
            },
            {
              key: 'groupAudioEnabled',
              label: 'Group Audio Calling',
              desc: 'Multi-party audio conferences with RTC',
              danger: false,
            },
            {
              key: 'groupVideoEnabled',
              label: 'Group Video Calling',
              desc: 'Multi-party HD video grid conferences',
              danger: false,
            },
            {
              key: 'groupLangpretationEnabled',
              label: 'Group Langpretation Fan-Out',
              desc: 'Multi-target simultaneous speech translation',
              danger: false,
            },
            {
              key: 'paidCallsEnabled',
              label: 'Paid Service Calls & Metering',
              desc: 'Per-minute billing for verified consultations',
              danger: false,
            },
            {
              key: 'fintechEnabled',
              label: 'Global Fintech & MoMo Hub',
              desc: 'Master switch for global wallet & remittance hub',
              danger: false,
            },
            {
              key: 'b2bPremiumEnabled',
              label: 'B2B Enterprise Workspaces',
              desc: 'Multi-seat organizational corporate routing',
              danger: false,
            },
            {
              key: 'maintenanceMode',
              label: 'System Maintenance Mode',
              desc: 'Displays maintenance alert to all users',
              danger: true,
            },
          ].map((item) => {
            const isEnabled = adminFeatures[item.key as keyof AdminFeatureSwitches];

            return (
              <div
                key={item.key}
                className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                  item.danger && isEnabled
                    ? 'bg-rose-950/30 border-rose-500/50'
                    : isEnabled
                    ? 'bg-slate-900/90 border-emerald-500/30'
                    : 'bg-slate-950/60 border-slate-800 opacity-60'
                }`}
              >
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white leading-snug">{item.label}</div>
                  <p className="text-[11px] text-slate-400 leading-tight">{item.desc}</p>
                </div>

                <button
                  onClick={() =>
                    updateAdminFeature(
                      item.key as keyof AdminFeatureSwitches,
                      !isEnabled
                    )
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isEnabled
                      ? item.danger
                        ? 'bg-rose-600'
                        : 'bg-emerald-500'
                      : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* DYNAMIC PRICING ENGINE (Page 21 Architecture Mandate) */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span>Dynamic Pricing &amp; Commission Engine</span>
            </h2>
            <p className="text-xs text-slate-400">
              Real-time platform fee parameters, per-minute translation rates, and expert commissions
            </p>
          </div>

          {savedSuccess && (
            <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/40 flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-3.5 h-3.5" />
              Saved
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Langpretation Rate ($/min)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">$</span>
              <input
                type="number"
                step="0.01"
                value={adminPricing.langpretationPerMinuteRateUSD}
                onChange={(e) =>
                  handlePricingChange('langpretationPerMinuteRateUSD', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Langpretation Rate (GH₵/min)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">GH₵</span>
              <input
                type="number"
                step="0.1"
                value={adminPricing.langpretationPerMinuteRateGHS}
                onChange={(e) =>
                  handlePricingChange('langpretationPerMinuteRateGHS', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Platform Expert Commission (%)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="1"
                value={adminPricing.platformExpertCommissionPercent}
                onChange={(e) =>
                  handlePricingChange('platformExpertCommissionPercent', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400 font-mono">%</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Fintech Transfer Fee (%)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={adminPricing.fintechTransferFeePercent}
                onChange={(e) =>
                  handlePricingChange('fintechTransferFeePercent', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400 font-mono">%</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              B2B Seat Monthly Fee ($)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">$</span>
              <input
                type="number"
                step="1"
                value={adminPricing.b2bSeatMonthlyRateUSD}
                onChange={(e) =>
                  handlePricingChange('b2bSeatMonthlyRateUSD', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Free Tier Monthly Minutes
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="5"
                value={adminPricing.freeTierLangpretationMinutes}
                onChange={(e) =>
                  handlePricingChange('freeTierLangpretationMinutes', parseInt(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400 font-mono">mins</span>
            </div>
          </div>

          {/* Global Multi-Currency Rates */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              EUR Rate (€/min)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">€</span>
              <input
                type="number"
                step="0.01"
                value={adminPricing.langpretationPerMinuteRateEUR ?? 0.12}
                onChange={(e) =>
                  handlePricingChange('langpretationPerMinuteRateEUR', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              GBP Rate (£/min)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">£</span>
              <input
                type="number"
                step="0.01"
                value={adminPricing.langpretationPerMinuteRateGBP ?? 0.10}
                onChange={(e) =>
                  handlePricingChange('langpretationPerMinuteRateGBP', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              AED Rate (د.إ/min)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">AED</span>
              <input
                type="number"
                step="0.1"
                value={adminPricing.langpretationPerMinuteRateAED ?? 0.55}
                onChange={(e) =>
                  handlePricingChange('langpretationPerMinuteRateAED', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              NGN Rate (₦/min)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">₦</span>
              <input
                type="number"
                step="10"
                value={adminPricing.langpretationPerMinuteRateNGN ?? 200}
                onChange={(e) =>
                  handlePricingChange('langpretationPerMinuteRateNGN', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Referral Bonus Configuration */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-emerald-400 block">
              Referral Bonus Minutes (First Sub)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="5"
                value={adminPricing.referralBonusMinutes ?? 30}
                onChange={(e) =>
                  handlePricingChange('referralBonusMinutes', parseInt(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-300 focus:outline-none focus:border-emerald-400"
              />
              <span className="text-xs text-slate-400 font-mono">mins</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-emerald-400 block">
              Referral Bonus Credit ($ USD)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">$</span>
              <input
                type="number"
                step="1"
                value={adminPricing.referralBonusCreditUSD ?? 10}
                onChange={(e) =>
                  handlePricingChange('referralBonusCreditUSD', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-emerald-500/50 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-300 focus:outline-none focus:border-emerald-400"
              />
            </div>
          </div>

          {/* Ride-Hailing Pricing & Commission Parameters */}
          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-emerald-400 block">
              Ride Flag-Drop Base Fare (GH₵)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">GH₵</span>
              <input
                type="number"
                step="1"
                value={adminPricing.rideBaseFareGHS ?? 15.0}
                onChange={(e) =>
                  handlePricingChange('rideBaseFareGHS', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-emerald-400 block">
              Ride Rate per Km (GH₵/km)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">GH₵</span>
              <input
                type="number"
                step="0.5"
                value={adminPricing.ridePerKmRateGHS ?? 5.5}
                onChange={(e) =>
                  handlePricingChange('ridePerKmRateGHS', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-emerald-400 block">
              Ride Rate per Minute (GH₵/min)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">GH₵</span>
              <input
                type="number"
                step="0.1"
                value={adminPricing.ridePerMinuteRateGHS ?? 1.2}
                onChange={(e) =>
                  handlePricingChange('ridePerMinuteRateGHS', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-amber-500/40 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-amber-400 block">
              Ride Surge Demand Multiplier
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min="1.0"
                max="3.5"
                value={adminPricing.rideSurgeMultiplier ?? 1.2}
                onChange={(e) =>
                  handlePricingChange('rideSurgeMultiplier', parseFloat(e.target.value) || 1.0)
                }
                className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3 py-2 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400"
              />
              <span className="text-xs text-amber-400 font-mono">x</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Driver Platform Commission (%)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="1"
                value={adminPricing.driverCommissionPercent ?? 15}
                onChange={(e) =>
                  handlePricingChange('driverCommissionPercent', parseFloat(e.target.value) || 0)
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-400 font-mono">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* AGORA RTC & GETSTREAM INFRASTRUCTURE OPERATIONS */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#0c1424] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <span>Nanivio RTC &amp; Real-Time Infrastructure APIs</span>
            </h2>
            <p className="text-xs text-slate-400">
              Live token generator, codec telemetry, and webhook synchronization bridge
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Nanivio RTC Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs">
                  RTC
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Nanivio RTC Audio/Video Engine</h3>
                  <p className="text-[11px] text-slate-400">Audio 1:1, Video 1:1 &amp; Multilateral Rooms</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-500/30">
                ACTIVE
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Endpoints</span>
                <span className="text-emerald-400 font-bold">/api/rtc/token</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Codecs</span>
                <span className="text-white font-bold">Opus 48k / H.264</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">App ID Protocol:</span>
                <span className="font-mono text-emerald-300">Enabled (HMAC-SHA256 Token)</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Dynamic UID:</span>
                <span className="font-mono text-white">Auto-Assigned per Participant</span>
              </div>
            </div>
          </div>

          {/* GetStream Chat Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-xs">
                  CHAT
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">GetStream Real-Time Messaging</h3>
                  <p className="text-[11px] text-slate-400">Channels, Typing Indicators &amp; Langpretation Webhooks</p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold border border-purple-500/30">
                CONNECTED
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Endpoints</span>
                <span className="text-purple-400 font-bold">/api/stream/token</span>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Webhook Bridge</span>
                <span className="text-white font-bold">/api/stream/webhook</span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Translation Interceptor:</span>
                <span className="font-mono text-emerald-300">Live Multilateral Langpretation Core</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-400">Token Signature:</span>
                <span className="font-mono text-white">HS256 JWT Authorization</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Active Call Live Telemetry (If a call is running) */}
      {activeCall && (
        <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-3xl p-5 shadow-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <PhoneCall className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Active Real-Time Call Session ({activeCall.type})</div>
              <div className="text-xs text-slate-400">
                Duration: {activeCall.durationSeconds}s • Participants: {activeCall.participants.map(p => p.name).join(', ')}
              </div>
            </div>
          </div>

          <button
            onClick={endCall}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-colors"
          >
            Emergency Terminate Session
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 9. ADMIN PANEL — LIVE SERVICES & ADVERTISING MANAGEMENT */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#0c1424] border border-cyan-500/40 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Live Services &amp; Advertising Management</span>
            </h2>
            <p className="text-xs text-slate-400">
              Commercial campaign controls, rotating video/banner ads, expert promotions &amp; impression metrics
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold border border-cyan-500/30">
            3 Active Campaigns
          </span>
        </div>

        {/* 10. Revenue Streams Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] text-slate-400 font-mono uppercase">Basic Advertising</span>
            <div className="text-lg font-bold text-white">GH₵ 12,400 <span className="text-xs text-slate-400 font-normal">/mo</span></div>
            <p className="text-[10px] text-slate-500">Standard banners, limited rotation</p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] text-slate-400 font-mono uppercase">Business Video Ads</span>
            <div className="text-lg font-bold text-cyan-400">GH₵ 28,600 <span className="text-xs text-slate-400 font-normal">/mo</span></div>
            <p className="text-[10px] text-cyan-500">Video promo, higher rotation</p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] text-slate-400 font-mono uppercase">Premium Targeting</span>
            <div className="text-lg font-bold text-emerald-400">GH₵ 44,200 <span className="text-xs text-slate-400 font-normal">/mo</span></div>
            <p className="text-[10px] text-emerald-500">Language &amp; geo priority ads</p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] text-slate-400 font-mono uppercase">Expert Lead Gen</span>
            <div className="text-lg font-bold text-amber-400">GH₵ 18,900 <span className="text-xs text-slate-400 font-normal">/mo</span></div>
            <p className="text-[10px] text-amber-500">Featured profile &amp; priority discovery</p>
          </div>
        </div>

        {/* Active Advertising Campaigns Table */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live Advertising Campaigns</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-800 rounded-2xl overflow-hidden">
              <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px]">
                <tr>
                  <th className="p-3">Campaign / Sponsor</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Targeting</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Rotation</th>
                  <th className="p-3">Impressions / Clicks</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 font-medium text-white">
                    <div className="font-bold">Global Bank</div>
                    <div className="text-[10px] text-slate-400">Smart Solutions for a Better Tomorrow</div>
                  </td>
                  <td className="p-3 text-cyan-300 font-mono">Fintech &amp; Banking</td>
                  <td className="p-3 text-slate-300">🇬🇭 Ghana, 🇦🇪 GCC (AR/EN)</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">High</span></td>
                  <td className="p-3 font-mono text-slate-300">Every 7s</td>
                  <td className="p-3 font-mono text-slate-300">42.8k / 3.4k (7.9%)</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">SPONSORED</span></td>
                </tr>

                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 font-medium text-white">
                    <div className="font-bold">Global Logistics Ltd</div>
                    <div className="text-[10px] text-slate-400">International shipping &amp; customs</div>
                  </td>
                  <td className="p-3 text-cyan-300 font-mono">Trade &amp; Logistics</td>
                  <td className="p-3 text-slate-300">🌍 Pan-Africa &amp; UK (EN)</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold text-[10px]">Medium</span></td>
                  <td className="p-3 font-mono text-slate-300">Every 7s</td>
                  <td className="p-3 font-mono text-slate-300">29.1k / 2.1k (7.2%)</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">FEATURED</span></td>
                </tr>

                <tr className="hover:bg-slate-800/50 transition-colors">
                  <td className="p-3 font-medium text-white">
                    <div className="font-bold">Nanivio Global Langpretation</div>
                    <div className="text-[10px] text-slate-400">Turn on Langpretation service</div>
                  </td>
                  <td className="p-3 text-cyan-300 font-mono">Nanivio Platform</td>
                  <td className="p-3 text-slate-300">🌐 Global (All languages)</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 font-bold text-[10px]">Default</span></td>
                  <td className="p-3 font-mono text-slate-300">Every 7s</td>
                  <td className="p-3 font-mono text-slate-300">68.4k / 8.2k (12.0%)</td>
                  <td className="p-3"><span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold">SYSTEM</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Featured Online Expert Promotions Table */}
        <div className="space-y-3 pt-2">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Featured Online Expert Profiles</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { name: 'Dr. Kwame Adinkra', role: 'Medical Consultant', region: 'Ghana / UK', rate: 'GH₵ 80/session', langs: 'EN, Twi, AR', badge: 'Featured Lead' },
              { name: 'Sara Al-Ameri', role: 'Legal Consultant', region: 'UAE / GCC', rate: '$30/session', langs: 'AR, EN', badge: 'GCC Priority' },
              { name: 'Michael Brown', role: 'Business Consultant', region: 'USA / Kenya', rate: '$25/session', langs: 'EN, SWA', badge: 'Active' },
              { name: 'Aisha Rahman', role: 'Psychologist', region: 'Egypt / GCC', rate: '$20/session', langs: 'AR, EN, FR', badge: 'Active' },
            ].map((exp, i) => (
              <div key={i} className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">{exp.name}</span>
                  <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-bold text-[9px]">{exp.badge}</span>
                </div>
                <div className="text-[10px] text-slate-300">{exp.role} • {exp.region}</div>
                <div className="text-[10px] text-emerald-400 font-mono font-bold">{exp.rate}</div>
                <div className="text-[9px] text-slate-400">Langs: {exp.langs}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )}
</div>
);
};

import React, { useState } from 'react';
import {
  Settings,
  X,
  Shield,
  Bell,
  HardDrive,
  Globe,
  Palette,
  Trash2,
  Lock,
  Eye,
  CheckCircle2,
  Volume2,
  AlertTriangle,
  Smartphone,
  Laptop,
  LogOut,
  Ban,
  ShieldAlert,
  ChevronRight,
  Sparkles,
  HelpCircle,
  Info,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { SUPPORTED_LANGUAGES, UserSettings } from '../../types';
import { NANIVIO_FOUNDER, NANIVIO_COMPANY, ECOSYSTEM_PILLARS } from '../../lib/nanivioVision';

export const SettingsModal: React.FC = () => {
  const {
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    settingsActiveTab,
    setSettingsActiveTab,
    userSettings,
    updateUserSettings,
    userSecuritySessions,
    terminateOtherSessions,
    unblockUser,
    unrestrictUser,
    myLanguage,
    setIsLanguageModalOpen,
    deleteAccount,
    signOut,
  } = useNanivio();

  // Delete account confirmation states
  const [deleteReason, setDeleteReason] = useState('switching_devices');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteStep2, setShowDeleteStep2] = useState(false);
  const [soundTestActive, setSoundTestActive] = useState(false);

  if (!isSettingsModalOpen) return null;

  const myLangInfo = SUPPORTED_LANGUAGES.find((l) => l.code === myLanguage) || SUPPORTED_LANGUAGES[0];

  const handleTestSound = (tone: string) => {
    setSoundTestActive(true);
    // Beep audio simulation
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = tone === 'chime' ? 'sine' : tone === 'pulse' ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(tone === 'chime' ? 880 : 587, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
    setTimeout(() => setSoundTestActive(false), 500);
  };

  const handleExecuteDeleteAccount = async () => {
    if (deleteConfirmationText !== 'DELETE') return;
    setIsDeleting(true);
    try {
      await deleteAccount(deleteReason);
      setIsSettingsModalOpen(false);
    } catch (err) {
      console.error('Delete account failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0b1424] border border-slate-700/80 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Nanivio Settings &amp; Preferences</h3>
              <p className="text-xs text-slate-400">Privacy, notifications, data usage, language, security &amp; safety</p>
            </div>
          </div>
          <button
            onClick={() => setIsSettingsModalOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="bg-slate-950/80 border-b border-slate-800/80 flex items-center overflow-x-auto p-2 gap-1.5 scrollbar-none text-xs">
          {[
            { id: 'privacy', label: 'Privacy', icon: Lock },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'data', label: 'Data Usage', icon: HardDrive },
            { id: 'language', label: 'Language', icon: Globe },
            { id: 'theme', label: 'Theme', icon: Palette },
            { id: 'security', label: 'Security & Safety', icon: Shield },
            { id: 'about', label: 'About App', icon: Info },
            { id: 'account', label: 'Account Deletion', icon: Trash2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = settingsActiveTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSettingsActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: PRIVACY */}
          {settingsActiveTab === 'privacy' && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Privacy &amp; Visibility Controls</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Control who can see your personal info, online presence, and read receipts.
                </p>
              </div>

              {/* Read Receipts */}
              <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5 max-w-sm">
                  <span className="text-xs font-bold text-white">Read Receipts (Blue Ticks)</span>
                  <p className="text-[11px] text-slate-400">
                    If turned off, you will not send or receive delivery read receipts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateUserSettings({
                      privacy: {
                        ...userSettings.privacy,
                        readReceipts: !userSettings.privacy.readReceipts,
                      },
                    })
                  }
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                    userSettings.privacy.readReceipts ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ease-in-out ${
                      userSettings.privacy.readReceipts ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Last Seen Visibility */}
              <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-white">Last Seen Visibility</span>
                  <span className="text-xs font-mono text-emerald-400 uppercase">
                    {userSettings.privacy.lastSeen}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['everyone', 'contacts', 'nobody'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() =>
                        updateUserSettings({
                          privacy: { ...userSettings.privacy, lastSeen: opt },
                        })
                      }
                      className={`py-1.5 px-3 rounded-xl text-xs capitalize font-medium transition-all ${
                        userSettings.privacy.lastSeen === opt
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Online Status */}
              <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-white">Online Status Visibility</span>
                  <span className="text-xs font-mono text-emerald-400 uppercase">
                    {userSettings.privacy.onlineStatus}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['everyone', 'contacts', 'nobody'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() =>
                        updateUserSettings({
                          privacy: { ...userSettings.privacy, onlineStatus: opt },
                        })
                      }
                      className={`py-1.5 px-3 rounded-xl text-xs capitalize font-medium transition-all ${
                        userSettings.privacy.onlineStatus === opt
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Blocked Users Section */}
              <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ban className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-bold text-white">Blocked Contacts</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    {userSettings.privacy.blockedUsers.length} blocked
                  </span>
                </div>
                {userSettings.privacy.blockedUsers.length === 0 ? (
                  <p className="text-xs text-slate-500">No blocked contacts.</p>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {userSettings.privacy.blockedUsers.map((bId) => (
                      <div
                        key={bId}
                        className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-300 font-mono">{bId}</span>
                        <button
                          onClick={() => unblockUser(bId)}
                          className="text-emerald-400 hover:text-emerald-300 font-bold"
                        >
                          Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Restricted Users Section */}
              <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">Restricted Accounts</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    {userSettings.privacy.restrictedUsers.length} restricted
                  </span>
                </div>
                {userSettings.privacy.restrictedUsers.length === 0 ? (
                  <p className="text-xs text-slate-500">No restricted contacts.</p>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {userSettings.privacy.restrictedUsers.map((rId) => (
                      <div
                        key={rId}
                        className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-300 font-mono">{rId}</span>
                        <button
                          onClick={() => unrestrictUser(rId)}
                          className="text-amber-400 hover:text-amber-300 font-bold"
                        >
                          Unrestrict
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: NOTIFICATIONS */}
          {settingsActiveTab === 'notifications' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-400" />
                  <span>Notification Preferences</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Manage incoming message chimes, mention highlights, and missed call alerts.
                </p>
              </div>

              {/* Notification Toggles */}
              <div className="space-y-2.5">
                {[
                  {
                    key: 'messagesEnabled',
                    title: 'New Message Alerts',
                    desc: 'Show real-time toast alerts for incoming chat messages',
                  },
                  {
                    key: 'previewEnabled',
                    title: 'Show Message Previews',
                    desc: 'Display text snippet and sender in the notification bubble',
                  },
                  {
                    key: 'missedCallAlerts',
                    title: 'Missed Call Alerts',
                    desc: 'Notify immediately when an incoming audio/video call is missed',
                  },
                  {
                    key: 'mentionsAlerts',
                    title: 'Mentions & Quotes Alerts',
                    desc: 'Receive high-priority alerts when tagged with @username in groups',
                  },
                  {
                    key: 'soundEnabled',
                    title: 'Play Sound Effects',
                    desc: 'Play chimes when receiving messages or call connection pings',
                  },
                  {
                    key: 'vibrationEnabled',
                    title: 'Haptic Feedback / Vibration',
                    desc: 'Vibrate on mobile devices for new incoming interactions',
                  },
                ].map((item) => {
                  const val = (userSettings.notifications as any)[item.key];
                  return (
                    <div
                      key={item.key}
                      className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-between"
                    >
                      <div className="space-y-0.5 max-w-sm">
                        <span className="text-xs font-bold text-white">{item.title}</span>
                        <p className="text-[11px] text-slate-400">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateUserSettings({
                            notifications: {
                              ...userSettings.notifications,
                              [item.key]: !val,
                            },
                          })
                        }
                        className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                          val ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ease-in-out ${
                            val ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Sound Tone Picker */}
              {userSettings.notifications.soundEnabled && (
                <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Notification Tone</span>
                    <button
                      type="button"
                      onClick={() => handleTestSound(userSettings.notifications.soundTone)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-bold"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{soundTestActive ? 'Playing...' : 'Test Sound'}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {(['chime', 'modern', 'subtle', 'pulse'] as const).map((tone) => (
                      <button
                        key={tone}
                        onClick={() => {
                          updateUserSettings({
                            notifications: { ...userSettings.notifications, soundTone: tone },
                          });
                          handleTestSound(tone);
                        }}
                        className={`py-1.5 px-2 rounded-xl text-xs capitalize font-medium transition-all ${
                          userSettings.notifications.soundTone === tone
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DATA USAGE */}
          {settingsActiveTab === 'data' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span>Data &amp; Storage Usage</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Control bandwidth consumption across Wi-Fi and mobile networks.
                </p>
              </div>

              {/* Auto Download Photos */}
              <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-white">Auto-download Photos:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 'cellular_wifi', label: 'Wi-Fi & Mobile' },
                    { val: 'wifi', label: 'Wi-Fi Only' },
                    { val: 'never', label: 'Never' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      onClick={() =>
                        updateUserSettings({
                          dataUsage: { ...userSettings.dataUsage, autoDownloadPhotos: opt.val as any },
                        })
                      }
                      className={`py-1.5 px-2 rounded-xl text-xs font-medium transition-all ${
                        userSettings.dataUsage.autoDownloadPhotos === opt.val
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto Download Videos */}
              <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-white">Auto-download Short Videos:</span>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 'cellular_wifi', label: 'Wi-Fi & Mobile' },
                    { val: 'wifi', label: 'Wi-Fi Only' },
                    { val: 'never', label: 'Never' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      onClick={() =>
                        updateUserSettings({
                          dataUsage: { ...userSettings.dataUsage, autoDownloadVideos: opt.val as any },
                        })
                      }
                      className={`py-1.5 px-2 rounded-xl text-xs font-medium transition-all ${
                        userSettings.dataUsage.autoDownloadVideos === opt.val
                          ? 'bg-emerald-500 text-slate-950 font-bold'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Low data mode for calls */}
              <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5 max-w-sm">
                  <span className="text-xs font-bold text-white">Low Data Mode for Calls</span>
                  <p className="text-[11px] text-slate-400">
                    Reduces bitrate for Langpretation WebRTC voice &amp; video calls on cellular networks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateUserSettings({
                      dataUsage: {
                        ...userSettings.dataUsage,
                        lowDataModeForCalls: !userSettings.dataUsage.lowDataModeForCalls,
                      },
                    })
                  }
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                    userSettings.dataUsage.lowDataModeForCalls ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ease-in-out ${
                      userSettings.dataUsage.lowDataModeForCalls ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: LANGUAGE */}
          {settingsActiveTab === 'language' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>Consumer Language &amp; Langpretation</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Select your primary language for incoming real-time audio and text translation.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{myLangInfo.flag}</span>
                  <div>
                    <h5 className="text-sm font-bold text-white">{myLangInfo.name} ({myLangInfo.nativeName})</h5>
                    <p className="text-xs text-emerald-300 font-mono">Current active consumer language</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsSettingsModalOpen(false);
                    setIsLanguageModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:scale-105 transition-all shadow"
                >
                  Change Language
                </button>
              </div>

              <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-2xl text-xs text-slate-300 space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Simultaneous Translation Active</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Whenever you receive a message in another language (e.g. English, French, Arabic, Yoruba, Twi), Nanivio automatically translates it into your chosen language in real-time.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: THEME */}
          {settingsActiveTab === 'theme' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette className="w-4 h-4 text-emerald-400" />
                  <span>Interface Theme</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Choose visual contrast and color palette.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: 'midnight',
                    title: 'Midnight Obsidian',
                    desc: 'Deep black and obsidian canvas with high contrast emerald accents (Default)',
                    color: 'from-[#070d18] to-[#0c182c]',
                  },
                  {
                    id: 'dark',
                    title: 'Slate Dark',
                    desc: 'Balanced neutral dark slate with cool borders',
                    color: 'from-slate-950 to-slate-900',
                  },
                  {
                    id: 'system',
                    title: 'System Automatic',
                    desc: 'Matches operating system dark or light preference',
                    color: 'from-slate-900 via-indigo-950 to-slate-900',
                  },
                  {
                    id: 'light',
                    title: 'Crystal Light (Day Mode)',
                    desc: 'Clean off-white canvas with sharp readability',
                    color: 'from-slate-800 to-slate-700',
                  },
                ].map((item) => {
                  const isSelected = userSettings.theme === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => updateUserSettings({ theme: item.id as any })}
                      className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden bg-gradient-to-br ${item.color} ${
                        isSelected
                          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                          : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white">{item.title}</span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 6: SECURITY & SAFETY */}
          {settingsActiveTab === 'security' && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Security, Safety &amp; Active Sessions</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Suspicious-login alerts, spam protection, and active device logins.
                </p>
              </div>

              {/* Suspicious Login Alert Banner */}
              {userSecuritySessions.some((s) => s.isSuspicious) && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950/60 via-amber-950/40 to-slate-900 border border-rose-500/50 shadow-xl space-y-2">
                  <div className="flex items-center gap-2.5 text-rose-400">
                    <ShieldAlert className="w-5 h-5 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">
                      Suspicious Login Detected
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    An unrecognized login attempt occurred from <strong>London, United Kingdom (IP: 82.165.197.10)</strong> on Firefox Browser. If this was not you, terminate all other sessions immediately.
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={terminateOtherSessions}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow"
                    >
                      Log Out Other Devices Now
                    </button>
                  </div>
                </div>
              )}

              {/* Active Device Sessions List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                    Active Device Logins ({userSecuritySessions.length})
                  </span>
                  <button
                    onClick={terminateOtherSessions}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold"
                  >
                    Terminate Other Sessions
                  </button>
                </div>

                <div className="space-y-2">
                  {userSecuritySessions.map((sess) => (
                    <div
                      key={sess.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                        sess.isCurrent
                          ? 'bg-emerald-950/20 border-emerald-500/40 text-white'
                          : sess.isSuspicious
                          ? 'bg-rose-950/20 border-rose-500/40 text-rose-200'
                          : 'bg-slate-900/40 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
                          {sess.device.includes('iPhone') || sess.device.includes('Android') ? (
                            <Smartphone className="w-4 h-4" />
                          ) : (
                            <Laptop className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white">{sess.device}</span>
                            {sess.isCurrent && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 font-mono text-[9px] font-bold">
                                THIS DEVICE
                              </span>
                            )}
                            {sess.isSuspicious && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 font-mono text-[9px] font-bold">
                                SUSPICIOUS
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {sess.browser} • {sess.location} ({sess.ip})
                          </p>
                        </div>
                      </div>

                      <span className="text-[10px] text-slate-500 font-mono">
                        {sess.isCurrent ? 'Active Now' : new Date(sess.lastActive).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Spam Protection */}
              <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-slate-800 flex items-center justify-between">
                <div className="space-y-0.5 max-w-sm">
                  <span className="text-xs font-bold text-white">Nanivio Smart Spam &amp; Fraud Filter</span>
                  <p className="text-[11px] text-slate-400">
                    Automatically filter unsolicited marketing messages and suspicious links.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold">
                  ACTIVE
                </span>
              </div>
            </div>
          )}

          {/* TAB 7: ACCOUNT DELETION (DANGER ZONE) */}
          {settingsActiveTab === 'account' && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-rose-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>Permanent Account Deletion</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Permanently delete your Nanivio identity, conversations, contact records, and wallet profiles.
                </p>
              </div>

              {!showDeleteStep2 ? (
                <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/40 space-y-3">
                  <p className="text-xs text-rose-200 leading-relaxed">
                    <strong>Warning:</strong> Deleting your account is irreversible. All your personal messages, contact records, Langpretation logs, and Nanivio ID will be deactivated immediately.
                  </p>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Please tell us why you are leaving:</label>
                    <select
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="switching_devices">I am switching to another device or number</option>
                      <option value="privacy_concerns">I have privacy or data storage concerns</option>
                      <option value="not_needed">I no longer need multilingual call services</option>
                      <option value="temporary">I want to take a break from the app</option>
                      <option value="other">Other reason</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDeleteStep2(true)}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition-all"
                  >
                    Proceed to Deletion Verification
                  </button>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/60 space-y-3">
                  <p className="text-xs text-rose-200 font-bold">
                    To confirm permanent deletion, type <span className="underline font-mono text-white">DELETE</span> in capital letters below:
                  </p>

                  <input
                    type="text"
                    value={deleteConfirmationText}
                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                    placeholder="Type DELETE"
                    className="w-full bg-slate-950 border border-rose-500/60 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-rose-400"
                  />

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDeleteStep2(false)}
                      className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      disabled={deleteConfirmationText !== 'DELETE' || isDeleting}
                      onClick={handleExecuteDeleteAccount}
                      className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs disabled:opacity-40 shadow-lg shadow-rose-600/30"
                    >
                      {isDeleting ? 'Deactivating...' : 'Permanently Delete My Account'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 8: ABOUT APP & NANIVIO TECH. GH. */}
          {settingsActiveTab === 'about' && (
            <div className="space-y-6">
              {/* Company Header */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900/60 to-slate-950 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{NANIVIO_COMPANY.companyName}</span>
                  </div>
                  <span className="text-xs font-mono text-slate-400">v2.4.0 (Build 2026.09)</span>
                </div>

                <h3 className="text-xl font-black text-white tracking-tight">
                  Nanivio Connected Digital Ecosystem
                </h3>

                <p className="text-xs text-slate-300 leading-relaxed italic border-l-2 border-emerald-500 pl-3">
                  "{NANIVIO_COMPANY.officialTagline}"
                </p>

                <p className="text-xs text-slate-400 leading-relaxed">
                  {NANIVIO_COMPANY.missionDescription}
                </p>
              </div>

              {/* Founder & Visionary Details */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-lg">
                    MN
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">
                      Founder &amp; Visionary
                    </div>
                    <h4 className="text-base font-bold text-white">
                      {NANIVIO_FOUNDER.fullName}
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">
                      Popularly known as <span className="text-emerald-300 font-bold">{NANIVIO_FOUNDER.popularName}</span>
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  <div className="text-xs font-semibold text-slate-300">Founding Vision:</div>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                    "{NANIVIO_FOUNDER.visionSummary}"
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {NANIVIO_FOUNDER.title} · Committed to eliminating barriers and empowering global communication and enterprise.
                  </p>
                </div>
              </div>

              {/* Core Philosophy */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Core Company Philosophy
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                  {NANIVIO_COMPANY.corePhilosophy.map((item, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-center">
                      <p className="text-xs font-bold text-emerald-300">{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ecosystem Pillars */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center justify-between">
                  <span>Architecture &amp; Ecosystem Pillars</span>
                  <span className="text-[10px] text-emerald-400 font-normal">All nodes operational</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {ECOSYSTEM_PILLARS.map((pillar) => (
                    <div key={pillar.id} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/90 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{pillar.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Active</span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {pillar.summary}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Legal & Regulatory Notice */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center space-y-1 text-xs text-slate-500 font-mono">
                <p>Registered Entity: {NANIVIO_COMPANY.registration} · {NANIVIO_COMPANY.headquarters}</p>
                <p>&copy; 2026 {NANIVIO_COMPANY.companyName}. All rights reserved.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-500">Nanivio Secure Client v2.4</span>
          <button
            onClick={() => setIsSettingsModalOpen(false)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

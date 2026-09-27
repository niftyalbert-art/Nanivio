import React, { useState, useRef, useEffect } from 'react';
import {
  User,
  X,
  Camera,
  Upload,
  RefreshCw,
  Trash2,
  Globe,
  Sparkles,
  Shield,
  Eye,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_PRESETS = [
  '✨ Available on Nanivio',
  '🟢 Active & Online',
  '🚗 In transit | Nanivio Drive',
  '🩺 In consultation',
  '🏢 Busy in meeting',
  '✈️ Traveling abroad',
];

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentUser, authUser, updateUserProfile } = useNanivio();

  const [name, setName] = useState(currentUser.name || authUser?.displayName || '');
  const [username, setUsername] = useState(
    currentUser.username || authUser?.username || (currentUser.name ? currentUser.name.toLowerCase().replace(/\s+/g, '_') : '')
  );
  const [statusMessage, setStatusMessage] = useState(
    currentUser.statusMessage || authUser?.statusMessage || '✨ Available on Nanivio'
  );
  const [avatar, setAvatar] = useState(currentUser.avatar || authUser?.avatar || '');
  const [customAvatarInput, setCustomAvatarInput] = useState('');
  
  // Live camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [onlineVisibility, setOnlineVisibility] = useState<'everyone' | 'contacts' | 'nobody'>(
    (currentUser.onlineVisibility as any) || (authUser?.onlineVisibility as any) || 'everyone'
  );
  const [profilePhotoVisibility, setProfilePhotoVisibility] = useState<'everyone' | 'contacts' | 'nobody'>(
    (currentUser.profilePhotoVisibility as any) || (authUser?.profilePhotoVisibility as any) || 'everyone'
  );
  const [lastSeenVisibility, setLastSeenVisibility] = useState<'everyone' | 'contacts' | 'nobody'>(
    (currentUser.lastSeenVisibility as any) || (authUser?.lastSeenVisibility as any) || 'everyone'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Stop camera on unmount or modal close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  // Attach stream when video element mounts
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch((err) => console.warn('Video play error:', err));
    }
  }, [isCameraActive]);

  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
    } catch (err) {
      console.error('Failed to open camera:', err);
      alert('Unable to access camera. Please check camera permissions.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const captureLivePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, 320, 320);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setAvatar(dataUrl);
    setCustomAvatarInput('');
    stopCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Photo must be less than 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatar(reader.result);
        setCustomAvatarInput('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCloseModal = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  const currentInitials = currentUser.initials || (name ? name.slice(0, 2).toUpperCase() : 'NV');
  const activeAvatarSrc = customAvatarInput.trim() || avatar;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();
      const parts = name.trim().split(' ');
      const firstName = parts[0] || name;
      const lastName = parts.slice(1).join(' ') || '';

      await updateUserProfile({
        name: name.trim(),
        displayName: name.trim(),
        firstName,
        lastName,
        username: cleanUsername,
        statusMessage: statusMessage.trim(),
        avatar: activeAvatarSrc,
        onlineVisibility,
        profilePhotoVisibility,
        lastSeenVisibility,
      });

      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        handleCloseModal();
      }, 1000);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b1424] border border-slate-700/80 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Edit Profile &amp; Privacy</h3>
              <p className="text-xs text-slate-400">Update display name, avatar, bio status and visibility</p>
            </div>
          </div>
          <button
            onClick={handleCloseModal}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {savedSuccess ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/40">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white">Profile Updated Successfully</h4>
            <p className="text-xs text-slate-300">Your changes have been saved to the Nanivio directory.</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
            {/* Live Avatar & Photo Picker */}
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-emerald-500/60 shadow-lg bg-slate-800 flex items-center justify-center">
                    {activeAvatarSrc ? (
                      <img
                        src={activeAvatarSrc}
                        alt="avatar preview"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-2xl font-bold font-mono text-emerald-400">
                        {currentInitials}
                      </span>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 p-1 bg-emerald-500 text-slate-950 rounded-full shadow">
                    <Camera className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="space-y-2 flex-1 min-w-0 w-full text-center sm:text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200">Profile Photo</span>
                    {activeAvatarSrc && (
                      <button
                        type="button"
                        onClick={() => {
                          setAvatar('');
                          setCustomAvatarInput('');
                        }}
                        className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Use Initials</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start">
                    {/* Live Camera Button */}
                    <button
                      type="button"
                      onClick={isCameraActive ? stopCamera : startCamera}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{isCameraActive ? 'Close Camera' : 'Take Live Selfie'}</span>
                    </button>

                    {/* File Upload Button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Photo</span>
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Or paste custom image URL..."
                    value={customAvatarInput}
                    onChange={(e) => setCustomAvatarInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* In-Modal Live Camera Viewfinder */}
              {isCameraActive && (
                <div className="p-3 bg-slate-950 border border-emerald-500/50 rounded-2xl space-y-2 animate-in fade-in">
                  <div className="relative w-full max-w-[280px] aspect-square mx-auto rounded-xl overflow-hidden border border-slate-800 bg-black">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={captureLivePhoto}
                      className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Name & Username */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Full Display Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Username handle *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-emerald-400">@</span>
                  <input
                    type="text"
                    required
                    value={username.replace(/^@/, '')}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-7 pr-3 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Status / Bio */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Status Message / Bio</label>
              <input
                type="text"
                value={statusMessage}
                onChange={(e) => setStatusMessage(e.target.value)}
                placeholder="What's your current status?"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />

              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-slate-500">Quick presets:</span>
                {STATUS_PRESETS.slice(0, 4).map((st, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setStatusMessage(st)}
                    className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 transition-colors truncate max-w-[200px]"
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Online Visibility & Privacy Settings */}
            <div className="space-y-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Eye className="w-3.5 h-3.5 text-emerald-400" />
                <span>Online Visibility &amp; Presence Settings</span>
              </div>

              {/* Who can see online status */}
              <div className="space-y-1 bg-slate-900/30 border border-slate-800/80 rounded-2xl p-3">
                <label className="text-xs text-slate-300 font-medium">Who can see when I am Online:</label>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(['everyone', 'contacts', 'nobody'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setOnlineVisibility(opt)}
                      className={`py-1.5 px-2 rounded-xl text-xs capitalize font-medium transition-all ${
                        onlineVisibility === opt
                          ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Who can see profile photo */}
              <div className="space-y-1 bg-slate-900/30 border border-slate-800/80 rounded-2xl p-3">
                <label className="text-xs text-slate-300 font-medium">Who can see my Profile Photo:</label>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(['everyone', 'contacts', 'nobody'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setProfilePhotoVisibility(opt)}
                      className={`py-1.5 px-2 rounded-xl text-xs capitalize font-medium transition-all ${
                        profilePhotoVisibility === opt
                          ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Who can see last seen */}
              <div className="space-y-1 bg-slate-900/30 border border-slate-800/80 rounded-2xl p-3">
                <label className="text-xs text-slate-300 font-medium">Who can see my Last Seen:</label>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {(['everyone', 'contacts', 'nobody'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setLastSeenVisibility(opt)}
                      className={`py-1.5 px-2 rounded-xl text-xs capitalize font-medium transition-all ${
                        lastSeenVisibility === opt
                          ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                          : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="p-3 border-t border-slate-800 bg-slate-900/80 -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs hover:scale-105 transition-all shadow-lg shadow-emerald-500/20"
              >
                {isSubmitting ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

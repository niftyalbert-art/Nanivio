import React, { useState } from 'react';
import {
  Image,
  Video,
  FileText,
  X,
  Upload,
  Send,
  CheckCircle2,
  FileCode,
  Music,
  Sparkles,
  Camera,
  AlertTriangle,
  Crown,
  Sliders,
} from 'lucide-react';
import { ChatMessage } from '../../types';

interface MediaAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMedia: (media: {
    type: 'image' | 'video' | 'document';
    url: string;
    caption?: string;
    fileName?: string;
    fileSize?: string;
  }) => void;
  onOpenLiveCamera?: () => void;
  userTier?: 'free' | 'pro';
}

const PRESET_PHOTOS = [
  {
    title: 'Medical Diagnostic Report',
    url: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=800&auto=format&fit=crop&q=80',
    caption: 'Official Clinical Lab Diagnostic & Vital Summary',
    size: '1.2 MB',
  },
  {
    title: 'Trade & Logistics Facility',
    url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&auto=format&fit=crop&q=80',
    caption: 'Tema Bonded Container Terminal & Shipment Loading',
    size: '2.4 MB',
  },
  {
    title: 'Nanivio Ghana Innovation Tower',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&auto=format&fit=crop&q=80',
    caption: 'Airport Commercial City Headquarters & Meeting Suite',
    size: '1.8 MB',
  },
  {
    title: 'Vehicle Roadworthiness Check',
    url: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=80',
    caption: 'Toyota Prado 4x4 Fleet Inspection Certificate',
    size: '950 KB',
  },
];

const PRESET_VIDEOS = [
  {
    title: 'Accra Smart Traffic & Corridor Dispatch',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-traffic-in-a-busy-city-at-night-41551-large.mp4',
    caption: 'Live driver dispatch overview along Liberation Road',
    size: '4.8 MB',
  },
  {
    title: 'Hospital Surgery Triage Walkthrough',
    url: 'https://assets.mixkit.co/videos/preview/mixkit-medical-laboratory-technician-working-with-samples-41908-large.mp4',
    caption: 'Sterile diagnostics laboratory briefing',
    size: '6.2 MB',
  },
];

const PRESET_DOCUMENTS = [
  {
    fileName: 'AfCFTA_Cross_Border_Commercial_Agreement_2026.pdf',
    fileSize: '2.4 MB',
    url: '#',
    caption: 'Bilateral trade protocol between Ghana and regional corridors',
  },
  {
    fileName: 'Pediatric_Evaluation_and_Prescription_Report.pdf',
    fileSize: '1.1 MB',
    url: '#',
    caption: 'Certified medical consultation and treatment schedule',
  },
  {
    fileName: 'Nanivio_Drive_Fleet_Lease_Contract_INV892.pdf',
    fileSize: '850 KB',
    url: '#',
    caption: 'Approved vehicle rental agreement and insurance rider',
  },
  {
    fileName: 'Tech_Infrastructure_Audit_Report.docx',
    fileSize: '1.9 MB',
    url: '#',
    caption: 'Fintech settlement and real-time media pipeline benchmarks',
  },
];

export const MediaAttachmentModal: React.FC<MediaAttachmentModalProps> = ({
  isOpen,
  onClose,
  onSendMedia,
  onOpenLiveCamera,
  userTier = 'free',
}) => {
  const [activeType, setActiveType] = useState<'image' | 'video' | 'document'>('image');
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [caption, setCaption] = useState<string>('');
  const [customFileUrl, setCustomFileUrl] = useState<string>('');
  const [customFileName, setCustomFileName] = useState<string>('');
  const [customFileSize, setCustomFileSize] = useState<string>('');
  const [effectiveTier, setEffectiveTier] = useState<'free' | 'pro'>(userTier);
  const [limitWarning, setLimitWarning] = useState<string | null>(null);

  if (!isOpen) return null;

  const FREE_MAX_BYTES = 15 * 1024 * 1024; // 15 MB for free users

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLimitWarning(null);

    // Check free user limit
    if (effectiveTier === 'free' && file.size > FREE_MAX_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setLimitWarning(`Free tier upload limit is 15 MB. Your selected file is ${sizeMb} MB. Please select a smaller file or upgrade to Pro for up to 500 MB.`);
      return;
    }

    const fakeUrl = URL.createObjectURL(file);
    setCustomFileUrl(fakeUrl);
    setCustomFileName(file.name);
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    setCustomFileSize(`${sizeMb} MB`);
    if (!caption) {
      setCaption(file.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleSend = () => {
    if (limitWarning) return;
    if (activeType === 'image') {
      const selected = PRESET_PHOTOS[selectedPresetIndex];
      onSendMedia({
        type: 'image',
        url: customFileUrl || selected.url,
        caption: caption || selected.caption,
        fileName: customFileName || selected.title,
        fileSize: customFileSize || selected.size,
      });
    } else if (activeType === 'video') {
      const selected = PRESET_VIDEOS[selectedPresetIndex % PRESET_VIDEOS.length];
      onSendMedia({
        type: 'video',
        url: customFileUrl || selected.url,
        caption: caption || selected.caption,
        fileName: customFileName || selected.title,
        fileSize: customFileSize || selected.size,
      });
    } else {
      const selected = PRESET_DOCUMENTS[selectedPresetIndex % PRESET_DOCUMENTS.length];
      onSendMedia({
        type: 'document',
        url: customFileUrl || selected.url,
        caption: caption || selected.caption,
        fileName: customFileName || selected.fileName,
        fileSize: customFileSize || selected.fileSize,
      });
    }
    onClose();
  };

  const isFree = effectiveTier === 'free';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b1424] border border-slate-700/80 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">Send Media &amp; Documents</h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                    isFree
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {isFree ? 'Free Plan: 15MB Limit' : 'Pro Unlimited (500MB)'}
                </span>
              </div>
              <p className="text-xs text-slate-400">Share high-resolution photos, short video clips, or PDF documents</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Plan / Pro Switcher Banner */}
        <div className="px-4 py-2 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
            {isFree ? (
              <span>⚡ Free Tier: 15MB file cap • 30s video clips • 10 daily uploads</span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <Crown className="w-3.5 h-3.5" /> Pro Tier: 500MB file uploads • 4K video clips • Unlimited
              </span>
            )}
          </div>
          <button
            onClick={() => {
              setEffectiveTier(isFree ? 'pro' : 'free');
              setLimitWarning(null);
            }}
            className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 cursor-pointer"
          >
            <Sliders className="w-3 h-3 text-emerald-400" />
            <span>Test {isFree ? 'Pro Mode' : 'Free Mode'}</span>
          </button>
        </div>

        {/* Live Camera Shortcut Banner */}
        {onOpenLiveCamera && (
          <div className="p-2.5 bg-emerald-950/30 border-b border-emerald-500/30 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Camera className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs text-emerald-200 font-semibold">Want to take a live photo or record a video right now?</span>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenLiveCamera();
              }}
              className="px-3 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shrink-0 cursor-pointer shadow"
            >
              Open Camera
            </button>
          </div>
        )}

        {/* Limit Warning if File Exceeds 15MB */}
        {limitWarning && (
          <div className="px-4 py-2.5 bg-amber-950/60 border-b border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{limitWarning}</span>
          </div>
        )}

        {/* Media Type Tabs */}
        <div className="p-3 bg-slate-950/60 border-b border-slate-800/80 flex gap-2">
          <button
            onClick={() => {
              setActiveType('image');
              setSelectedPresetIndex(0);
              setCustomFileUrl('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeType === 'image'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Image className="w-4 h-4" />
            <span>Photos</span>
          </button>

          <button
            onClick={() => {
              setActiveType('video');
              setSelectedPresetIndex(0);
              setCustomFileUrl('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeType === 'video'
                ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Video className="w-4 h-4" />
            <span>Short Video</span>
          </button>

          <button
            onClick={() => {
              setActiveType('document');
              setSelectedPresetIndex(0);
              setCustomFileUrl('');
            }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              activeType === 'document'
                ? 'bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Document</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Upload custom file input */}
          <div className="border-2 border-dashed border-slate-700/80 hover:border-emerald-500/60 rounded-2xl p-4 text-center transition-colors bg-slate-900/30">
            <input
              type="file"
              id="file-upload-input"
              className="hidden"
              accept={
                activeType === 'image'
                  ? 'image/*'
                  : activeType === 'video'
                  ? 'video/*'
                  : '.pdf,.doc,.docx,.xlsx,.txt'
              }
              onChange={handleFileUpload}
            />
            <label
              htmlFor="file-upload-input"
              className="cursor-pointer flex flex-col items-center gap-2 text-xs text-slate-300"
            >
              <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-emerald-400 border border-slate-700">
                <Upload className="w-5 h-5" />
              </div>
              <span className="font-semibold text-white">
                {customFileName ? `Selected: ${customFileName} (${customFileSize})` : `Click to upload ${activeType} from device`}
              </span>
              <span className="text-[11px] text-slate-500">
                {activeType === 'image' && 'PNG, JPG, WEBP up to 25MB'}
                {activeType === 'video' && 'MP4, MOV, WEBM up to 100MB'}
                {activeType === 'document' && 'PDF, DOCX, XLSX up to 50MB'}
              </span>
            </label>
          </div>

          {/* Quick Verified Presets */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
              Or pick sample {activeType}:
            </span>

            {activeType === 'image' && (
              <div className="grid grid-cols-2 gap-2">
                {PRESET_PHOTOS.map((item, idx) => {
                  const isSelected = selectedPresetIndex === idx && !customFileUrl;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedPresetIndex(idx);
                        setCustomFileUrl('');
                        setCaption(item.caption);
                      }}
                      className={`relative rounded-xl overflow-hidden border-2 text-left transition-all p-1 group ${
                        isSelected ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="h-24 w-full rounded-lg overflow-hidden bg-slate-900">
                        <img
                          src={item.url}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="p-1.5">
                        <p className="text-[11px] font-bold text-white truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{item.size}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-emerald-500 text-slate-950 rounded-full p-0.5 shadow">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {activeType === 'video' && (
              <div className="space-y-2">
                {PRESET_VIDEOS.map((item, idx) => {
                  const isSelected = selectedPresetIndex === idx && !customFileUrl;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedPresetIndex(idx);
                        setCustomFileUrl('');
                        setCaption(item.caption);
                      }}
                      className={`w-full p-3 rounded-2xl border flex items-center justify-between text-left transition-all ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500 text-white'
                          : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center shrink-0">
                          <Video className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{item.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">{item.caption}</p>
                          <span className="text-[10px] font-mono text-purple-400">{item.size} • 1080p HD</span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-purple-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {activeType === 'document' && (
              <div className="space-y-2">
                {PRESET_DOCUMENTS.map((item, idx) => {
                  const isSelected = selectedPresetIndex === idx && !customFileUrl;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setSelectedPresetIndex(idx);
                        setCustomFileUrl('');
                        setCaption(item.caption);
                      }}
                      className={`w-full p-3 rounded-2xl border flex items-center justify-between text-left transition-all ${
                        isSelected
                          ? 'bg-sky-950/40 border-sky-500 text-white'
                          : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{item.fileName}</p>
                          <p className="text-[11px] text-slate-400 truncate">{item.caption}</p>
                          <span className="text-[10px] font-mono text-sky-400">{item.fileSize} • Verified PDF</span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Caption Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Caption / Accompanying message:</label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption or notes..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs hover:scale-105 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send {activeType}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

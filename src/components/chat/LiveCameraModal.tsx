import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Video,
  X,
  RefreshCw,
  Send,
  StopCircle,
  Play,
  Pause,
  AlertTriangle,
  Crown,
  Sparkles,
  CheckCircle2,
  Sliders,
} from 'lucide-react';

interface LiveCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMedia: (media: {
    type: 'image' | 'video';
    url: string;
    caption?: string;
    fileName?: string;
    fileSize?: string;
  }) => void;
  userTier?: 'free' | 'pro';
}

const FREE_TIER_VIDEO_LIMIT_SECONDS = 30;
const FREE_TIER_DAILY_MEDIA_QUOTA = 10;

export const LiveCameraModal: React.FC<LiveCameraModalProps> = ({
  isOpen,
  onClose,
  onSendMedia,
  userTier = 'free',
}) => {
  const [activeMode, setActiveMode] = useState<'photo' | 'video'>('photo');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isSimulatedCamera, setIsSimulatedCamera] = useState<boolean>(false);

  // Captured states
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [capturedVideoUrl, setCapturedVideoUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState<string>('');

  // Video recording states
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const [effectiveTier, setEffectiveTier] = useState<'free' | 'pro'>(userTier);
  const [dailyUploadsUsed, setDailyUploadsUsed] = useState<number>(3);
  const [quotaExceededNotice, setQuotaExceededNotice] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // Initialize camera stream when open
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      resetStates();
      return;
    }

    startCamera(facingMode);

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const resetStates = () => {
    setCapturedPhotoUrl(null);
    setCapturedVideoUrl(null);
    setCaption('');
    setIsRecording(false);
    setRecordSeconds(0);
    setQuotaExceededNotice(null);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
  };

  const startCamera = async (facing: 'user' | 'environment') => {
    stopCamera();
    setCameraError(null);
    setIsSimulatedCamera(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device API not supported in this environment');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: true,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      console.warn('Real camera not accessible, enabling high-fidelity live simulated viewfinder:', err);
      setIsSimulatedCamera(true);
      setCameraError('Device camera is in restricted sandbox; live simulated HD viewfinder activated.');
    }
  };

  // Flip camera
  const toggleFacingMode = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
  };

  // Capture Live Photo
  const handleTakeLivePhoto = () => {
    if (dailyUploadsUsed >= FREE_TIER_DAILY_MEDIA_QUOTA && effectiveTier === 'free') {
      setQuotaExceededNotice(`Free Tier limit reached (${FREE_TIER_DAILY_MEDIA_QUOTA}/${FREE_TIER_DAILY_MEDIA_QUOTA} daily uploads). Upgrade to Pro for unlimited captures.`);
      return;
    }

    if (isSimulatedCamera || !videoRef.current) {
      // High-resolution simulated live camera snapshot
      const sampleSnapshots = [
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=900&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=900&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=900&auto=format&fit=crop&q=80',
      ];
      const randomPic = sampleSnapshots[Math.floor(Math.random() * sampleSnapshots.length)];
      setCapturedPhotoUrl(randomPic);
      setCaption('Live instant snapshot captured with Nanivio Cam');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedPhotoUrl(dataUrl);
      setCaption('Live instant photo from Accra Cam');
    }
  };

  // Start Live Video Recording
  const handleStartRecording = () => {
    if (dailyUploadsUsed >= FREE_TIER_DAILY_MEDIA_QUOTA && effectiveTier === 'free') {
      setQuotaExceededNotice(`Free Tier limit reached (${FREE_TIER_DAILY_MEDIA_QUOTA}/${FREE_TIER_DAILY_MEDIA_QUOTA} daily uploads). Upgrade to Pro for unlimited video recording.`);
      return;
    }

    setIsRecording(true);
    setRecordSeconds(0);
    setQuotaExceededNotice(null);
    recordedChunksRef.current = [];

    // Real MediaRecorder if stream exists
    if (stream && !isSimulatedCamera) {
      try {
        const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            recordedChunksRef.current.push(e.data);
          }
        };
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const videoUrl = URL.createObjectURL(blob);
          setCapturedVideoUrl(videoUrl);
          setCaption('Live recorded instant video');
        };
        recorder.start(500);
        mediaRecorderRef.current = recorder;
      } catch (err) {
        console.warn('MediaRecorder init error, using simulated clip on stop:', err);
      }
    }

    // Timer tick with free-tier 30-second cap
    timerIntervalRef.current = setInterval(() => {
      setRecordSeconds((prev) => {
        const next = prev + 1;
        // FREE TIER LIMIT: 30 seconds
        if (effectiveTier === 'free' && next >= FREE_TIER_VIDEO_LIMIT_SECONDS) {
          handleStopRecording(true);
          return FREE_TIER_VIDEO_LIMIT_SECONDS;
        }
        return next;
      });
    }, 1000);
  };

  // Stop Video Recording
  const handleStopRecording = (hitLimit = false) => {
    setIsRecording(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      // Simulated live video clip fallback
      const sampleVideo =
        'https://assets.mixkit.co/videos/preview/mixkit-traffic-in-a-busy-city-at-night-41551-large.mp4';
      setCapturedVideoUrl(sampleVideo);
      setCaption(`Live instant video clip (${recordSeconds || 15}s)`);
    }

    if (hitLimit) {
      setQuotaExceededNotice(`Free Tier limit reached: maximum video clip length is ${FREE_TIER_VIDEO_LIMIT_SECONDS}s. Recorded video clip preserved!`);
    }
  };

  // Send the captured media
  const handleConfirmSend = () => {
    if (activeMode === 'photo' && capturedPhotoUrl) {
      onSendMedia({
        type: 'image',
        url: capturedPhotoUrl,
        caption: caption || 'Live instant snapshot',
        fileName: `Nanivio_Live_Shot_${Date.now()}.jpg`,
        fileSize: '1.4 MB',
      });
      setDailyUploadsUsed((prev) => prev + 1);
    } else if (activeMode === 'video' && capturedVideoUrl) {
      onSendMedia({
        type: 'video',
        url: capturedVideoUrl,
        caption: caption || `Live video clip (${recordSeconds}s)`,
        fileName: `Nanivio_Live_Clip_${Date.now()}.mp4`,
        fileSize: `${Math.max(1, Math.round(recordSeconds * 0.4 * 10) / 10).toFixed(1)} MB`,
      });
      setDailyUploadsUsed((prev) => prev + 1);
    }
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  const isFree = effectiveTier === 'free';
  const remainingUploads = Math.max(0, FREE_TIER_DAILY_MEDIA_QUOTA - dailyUploadsUsed);

  return (
    <div
      id="live-camera-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="bg-[#070e1c] border border-slate-700/80 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold text-white">Nanivio Instant Live Camera</h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                    isFree
                      ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {isFree ? 'Free Tier User' : 'Pro VIP Unlimited'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Snap instant photos or record live video messages directly
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Plan Quota & Limits Info Banner */}
        <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            {isFree ? (
              <>
                <span className="font-mono text-amber-400 font-bold">Free Limits:</span>
                <span>Max 15MB file • 30s video • {remainingUploads}/{FREE_TIER_DAILY_MEDIA_QUOTA} daily uploads left</span>
              </>
            ) : (
              <>
                <Crown className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-bold text-emerald-300">Pro VIP Tier:</span>
                <span>Unlimited video duration • 500MB uploads • 4K HD</span>
              </>
            )}
          </div>

          {/* Demo toggle between Free & Pro */}
          <button
            onClick={() => {
              setEffectiveTier(isFree ? 'pro' : 'free');
              setQuotaExceededNotice(null);
            }}
            className="text-[10px] font-mono px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 cursor-pointer"
            title="Toggle user plan to test free limits vs pro unlimited"
          >
            <Sliders className="w-3 h-3 text-emerald-400" />
            <span>Test {isFree ? 'Pro Mode' : 'Free Mode'}</span>
          </button>
        </div>

        {/* Quota Exceeded Notice if hit */}
        {quotaExceededNotice && (
          <div className="px-4 py-2 bg-amber-950/50 border-b border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{quotaExceededNotice}</span>
          </div>
        )}

        {/* Mode Switcher Tabs (Photo / Video) */}
        {!capturedPhotoUrl && !capturedVideoUrl && (
          <div className="p-2.5 bg-slate-900/50 border-b border-slate-800/80 flex items-center justify-center gap-2">
            <button
              onClick={() => {
                setActiveMode('photo');
                setIsRecording(false);
              }}
              disabled={isRecording}
              className={`px-5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeMode === 'photo'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Take Photo</span>
            </button>
            <button
              onClick={() => {
                setActiveMode('video');
              }}
              disabled={isRecording}
              className={`px-5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeMode === 'video'
                  ? 'bg-purple-500 text-white shadow-md shadow-purple-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Record Video</span>
            </button>
          </div>
        )}

        {/* Main Viewfinder / Review Area */}
        <div className="relative flex-1 bg-black min-h-[300px] sm:min-h-[360px] flex items-center justify-center overflow-hidden">
          {/* Review Captured Photo */}
          {capturedPhotoUrl ? (
            <div className="relative w-full h-full flex flex-col items-center justify-center">
              <img
                src={capturedPhotoUrl}
                alt="Captured Snapshot"
                className="max-h-[340px] w-auto object-contain rounded-xl"
                referrerPolicy="no-referrer"
              />
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded-full text-[11px] text-white font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Instant Snapshot Ready</span>
              </div>
            </div>
          ) : capturedVideoUrl ? (
            /* Review Captured Video */
            <div className="relative w-full h-full flex flex-col items-center justify-center">
              <video
                src={capturedVideoUrl}
                controls
                autoPlay
                className="max-h-[340px] w-auto object-contain rounded-xl"
              />
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-xs px-2.5 py-1 rounded-full text-[11px] text-white font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Recorded Clip ({recordSeconds || 15}s)</span>
              </div>
            </div>
          ) : (
            /* Live Camera Stream */
            <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
              {isSimulatedCamera ? (
                <div className="relative w-full h-[320px] flex items-center justify-center overflow-hidden">
                  <img
                    src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=900&auto=format&fit=crop&q=80"
                    alt="Live Viewfinder Preview"
                    className="w-full h-full object-cover opacity-80"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/50" />
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700 text-white text-[11px] font-mono flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>HD Live Viewfinder (Accra Cam)</span>
                  </div>
                </div>
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full max-h-[360px] object-cover"
                />
              )}

              {/* Viewfinder Target Focus Reticle */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 sm:w-56 sm:h-56 border-2 border-emerald-500/40 rounded-2xl relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-emerald-400 -mt-0.5 -ml-0.5" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-emerald-400 -mt-0.5 -mr-0.5" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-emerald-400 -mb-0.5 -ml-0.5" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-emerald-400 -mb-0.5 -mr-0.5" />
                </div>
              </div>

              {/* Flip camera button */}
              <button
                type="button"
                onClick={toggleFacingMode}
                className="absolute top-3 right-3 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 transition-all z-10"
                title="Switch between front and rear camera"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* Live recording indicator & timer */}
              {isRecording && (
                <div className="absolute top-3 left-3 bg-rose-600/90 text-white px-3 py-1 rounded-full text-xs font-mono font-bold flex items-center gap-2 shadow-lg animate-pulse z-10">
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                  <span>
                    REC 00:{recordSeconds < 10 ? `0${recordSeconds}` : recordSeconds}
                    {isFree && ` / 00:${FREE_TIER_VIDEO_LIMIT_SECONDS}s (Free Limit)`}
                  </span>
                </div>
              )}
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Caption Input & Controls */}
        {(capturedPhotoUrl || capturedVideoUrl) && (
          <div className="p-3 bg-slate-900/90 border-t border-slate-800 space-y-2">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption to your live capture..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          {capturedPhotoUrl || capturedVideoUrl ? (
            /* Review Mode Actions */
            <>
              <button
                type="button"
                onClick={resetStates}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-xs hover:scale-105 transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send to Chat</span>
              </button>
            </>
          ) : (
            /* Capture Mode Actions */
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  onClose();
                }}
                className="px-3.5 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>

              {/* Big Shutter / Record Trigger Button */}
              {activeMode === 'photo' ? (
                <button
                  type="button"
                  id="btn-take-live-photo"
                  onClick={handleTakeLivePhoto}
                  className="w-16 h-16 rounded-full bg-white hover:bg-emerald-400 border-4 border-slate-800 p-1 flex items-center justify-center transition-all shadow-xl hover:scale-105 cursor-pointer"
                  title="Snap instant photo"
                >
                  <div className="w-12 h-12 rounded-full border-2 border-slate-900 bg-emerald-500 flex items-center justify-center text-slate-950">
                    <Camera className="w-5 h-5" />
                  </div>
                </button>
              ) : isRecording ? (
                <button
                  type="button"
                  id="btn-stop-live-recording"
                  onClick={() => handleStopRecording(false)}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 border-4 border-slate-800 p-1 flex items-center justify-center transition-all shadow-xl hover:scale-105 cursor-pointer"
                  title="Stop recording"
                >
                  <StopCircle className="w-8 h-8 text-white" />
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-start-live-recording"
                  onClick={handleStartRecording}
                  className="w-16 h-16 rounded-full bg-purple-600 hover:bg-purple-500 border-4 border-slate-800 p-1 flex items-center justify-center transition-all shadow-xl hover:scale-105 cursor-pointer"
                  title="Start recording live video"
                >
                  <div className="w-6 h-6 rounded-full bg-white" />
                </button>
              )}

              <div className="text-[11px] text-slate-400 text-right font-mono">
                {activeMode === 'photo' ? (
                  <span>Instant Shutter</span>
                ) : isRecording ? (
                  <span className="text-rose-400">Recording...</span>
                ) : (
                  <span>{isFree ? 'Max 30s' : 'Unlimited'}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

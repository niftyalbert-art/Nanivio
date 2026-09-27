import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Trash2, Send, Radio, Sparkles } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';

interface VoiceNoteRecorderProps {
  onCancel: () => void;
  onSend: (duration: number, transcript: string) => void;
}

export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({ onCancel, onSend }) => {
  const { myLanguage, globalLangpretationEnabled } = useNanivio();
  const [seconds, setSeconds] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([15, 25, 40, 20, 60, 35, 80, 45, 30, 70, 50, 20]);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // 1. Timer & visual audio wave fluctuation
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
      setWaveformData((prev) => [
        ...prev.slice(1),
        Math.floor(Math.random() * 75) + 20,
      ]);
    }, 1000);

    // 2. Real Web Speech Recognition if supported by browser
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = myLanguage || 'en-US';

        recognition.onresult = (event: any) => {
          let liveText = '';
          for (let i = 0; i < event.results.length; i++) {
            liveText += event.results[i][0].transcript;
          }
          if (liveText.trim()) {
            setTranscript(liveText);
          }
        };

        recognition.onerror = () => {
          // Non-blocking fallback
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (err) {
        console.warn('Speech recognition init error:', err);
      }
    }

    return () => {
      clearInterval(timer);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, [myLanguage]);

  const handleFinish = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    onSend(Math.max(1, seconds), transcript.trim() || `Voice Note (${Math.max(1, seconds)}s)`);
  };

  return (
    <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-3 sm:p-4 shadow-xl flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
          <span className="text-xs font-mono font-bold text-rose-400">
            Recording {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
          </span>
        </div>

        {globalLangpretationEnabled && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>Voice-Note Langpretation Active</span>
          </div>
        )}
      </div>

      {/* Animated Waveform Display */}
      <div className="h-10 bg-slate-950 rounded-xl px-3 flex items-center justify-center gap-1 overflow-hidden border border-slate-800">
        {waveformData.map((height, i) => (
          <div
            key={i}
            style={{ height: `${height}%` }}
            className="w-1.5 bg-gradient-to-t from-emerald-500 to-teal-400 rounded-full transition-all duration-150"
          />
        ))}
      </div>

      {/* Real-time Voice Transcript / Notes */}
      <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-800">
        <span className="text-slate-500 shrink-0">Speech:</span>
        <input
          type="text"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Speak now into microphone or type voice note details..."
          className="bg-transparent border-none text-white text-xs w-full focus:outline-none placeholder:text-slate-600"
        />
      </div>

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span>Cancel</span>
        </button>

        <button
          onClick={handleFinish}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/30 transition-all hover:scale-105"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Send Voice Note</span>
        </button>
      </div>
    </div>
  );
};

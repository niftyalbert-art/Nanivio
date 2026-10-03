import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Trash2, Send, Radio, Sparkles, Volume2 } from 'lucide-react';
import { useNanivio } from '../../context/NanivioContext';
import { NanivioTranslatorEngine } from '../../lib/translator-engine/engine';
import { NanivioTtsAudioGenerator } from '../../lib/translator-engine/audio/ttsAudioGenerator';
import { PcmUtils } from '../../lib/translator-engine/audio/pcm';

export interface VoiceNoteSendPayload {
  duration: number;
  transcript: string;
  audioBlobUrl: string;
  isLangpretation: boolean;
  translatedTranscript?: string;
  translatedAudioUrl?: string;
  sourceLang: string;
  targetLang: string;
}

interface VoiceNoteRecorderProps {
  targetLang?: string;
  targetUserName?: string;
  onCancel: () => void;
  onSend: (payload: VoiceNoteSendPayload) => void;
}

export const VoiceNoteRecorder: React.FC<VoiceNoteRecorderProps> = ({
  targetLang = 'ak',
  targetUserName = 'Recipient',
  onCancel,
  onSend,
}) => {
  const { myLanguage, globalLangpretationEnabled } = useNanivio();
  const [seconds, setSeconds] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([15, 25, 40, 20, 60, 35, 80, 45, 30, 70, 50, 20]);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [voiceMode, setVoiceMode] = useState<'normal' | 'langpretation'>(
    globalLangpretationEnabled ? 'langpretation' : 'normal'
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
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

    // 2. Real Microphone Audio Capture via MediaRecorder
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          mediaStreamRef.current = stream;
          audioChunksRef.current = [];

          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';

          const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };

          recorder.start(250);
        })
        .catch((err) => {
          console.warn('[VoiceNoteRecorder] Microphone access notice:', err);
        });
    }

    // 3. Real Web Speech Recognition if supported by browser
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

        recognition.onerror = () => {};

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
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [myLanguage]);

  const handleFinish = async () => {
    setIsProcessing(true);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    // Stop MediaRecorder and produce blob
    let recordedBlob: Blob | null = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        if (!mediaRecorderRef.current) return resolve();
        mediaRecorderRef.current.onstop = () => resolve();
        try {
          mediaRecorderRef.current.stop();
        } catch {
          resolve();
        }
      });
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    if (audioChunksRef.current.length > 0) {
      const type = audioChunksRef.current[0].type || 'audio/webm';
      recordedBlob = new Blob(audioChunksRef.current, { type });
    }

    // Fallback audio blob if mic produced no chunks
    if (!recordedBlob || recordedBlob.size === 0) {
      const fallbackSamples = new Float32Array(16000 * Math.max(1, seconds));
      recordedBlob = PcmUtils.float32ToWavBlob(fallbackSamples, 16000);
    }

    const originalAudioBlobUrl = URL.createObjectURL(recordedBlob);
    const durationSec = Math.max(1, seconds);
    const rawTranscript = transcript.trim() || `Voice Note (${durationSec}s)`;

    if (voiceMode === 'normal') {
      // 1. Normal Stream Voice Note
      setIsProcessing(false);
      onSend({
        duration: durationSec,
        transcript: rawTranscript,
        audioBlobUrl: originalAudioBlobUrl,
        isLangpretation: false,
        sourceLang: myLanguage,
        targetLang,
      });
      return;
    }

    // 2. Langpretation Voice Note: Translate & Synthesize Speech
    try {
      const engine = NanivioTranslatorEngine.getInstance();
      const mtResult = await engine.translateText(rawTranscript, myLanguage, targetLang);
      const translatedText = mtResult?.translatedText || rawTranscript;

      // Synthesize audio in recipient's language
      const synth = await NanivioTtsAudioGenerator.generatePlayableWavBlob(translatedText, targetLang);

      setIsProcessing(false);
      onSend({
        duration: durationSec,
        transcript: rawTranscript,
        audioBlobUrl: originalAudioBlobUrl,
        isLangpretation: true,
        translatedTranscript: translatedText,
        translatedAudioUrl: synth.url,
        sourceLang: myLanguage,
        targetLang,
      });
    } catch (err) {
      console.warn('Langpretation voice note processing warning:', err);
      setIsProcessing(false);
      onSend({
        duration: durationSec,
        transcript: rawTranscript,
        audioBlobUrl: originalAudioBlobUrl,
        isLangpretation: true,
        translatedTranscript: rawTranscript,
        translatedAudioUrl: originalAudioBlobUrl,
        sourceLang: myLanguage,
        targetLang,
      });
    }
  };

  return (
    <div className="bg-[#0b1322] border border-emerald-500/50 rounded-2xl p-3.5 sm:p-4 shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
      {/* Top Header: Recording Status & Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
          <span className="text-xs font-mono font-bold text-rose-400">
            Recording {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
          </span>
        </div>

        {/* Distinct Mode Selector: Normal vs Langpretation */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setVoiceMode('normal')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              voiceMode === 'normal'
                ? 'bg-slate-800 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Normal Voice Note
          </button>

          <button
            type="button"
            onClick={() => setVoiceMode('langpretation')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              voiceMode === 'langpretation'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-emerald-400 hover:text-emerald-300'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Langpretation Voice Note</span>
          </button>
        </div>
      </div>

      {voiceMode === 'langpretation' && (
        <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
          <span className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>
              Auto-translates into recipient's language (<strong className="text-white">{targetLang.toUpperCase()}</strong> for {targetUserName})
            </span>
          </span>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-500/40">
            Speech-to-Speech
          </span>
        </div>
      )}

      {/* Animated Waveform Display */}
      <div className="h-10 bg-slate-950 rounded-xl px-3 flex items-center justify-center gap-1 overflow-hidden border border-slate-800">
        {waveformData.map((height, i) => (
          <div
            key={i}
            style={{ height: `${height}%` }}
            className={`w-1.5 rounded-full transition-all duration-150 ${
              voiceMode === 'langpretation'
                ? 'bg-gradient-to-t from-emerald-500 to-teal-400'
                : 'bg-gradient-to-t from-cyan-500 to-blue-400'
            }`}
          />
        ))}
      </div>

      {/* Real-time Voice Transcript / Notes */}
      <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
        <span className="text-slate-500 shrink-0 font-bold">Transcript:</span>
        <input
          type="text"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Speak now into microphone or type voice note details..."
          className="bg-transparent border-none text-white text-xs w-full focus:outline-none placeholder:text-slate-600 font-medium"
        />
      </div>

      {/* Action Controls */}
      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          <span>Cancel</span>
        </button>

        <button
          type="button"
          onClick={handleFinish}
          disabled={isProcessing}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shadow-lg transition-all hover:scale-105 cursor-pointer ${
            voiceMode === 'langpretation'
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30'
              : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/30'
          }`}
        >
          {isProcessing ? (
            <span className="animate-spin text-slate-950">⏳</span>
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>{isProcessing ? 'Translating & Synthesizing...' : voiceMode === 'langpretation' ? 'Send Langpretation Voice Note' : 'Send Normal Voice Note'}</span>
        </button>
      </div>
    </div>
  );
};

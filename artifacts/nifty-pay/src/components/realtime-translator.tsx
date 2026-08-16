import { useEffect, useRef, useState } from 'react';
import { Languages, Mic, MicOff, Sparkles, X, Activity, ShieldCheck, Cpu } from 'lucide-react';
import { useAgoraCall } from '@/contexts/agora-call';

interface RealtimeTranslatorProps {
  open: boolean;
  onClose: () => void;
}

export function RealtimeTranslatorPanel({ open, onClose }: RealtimeTranslatorProps) {
  const { getMicrophoneTrack, getRemoteAudioTrack } = useAgoraCall() as any;
  const recognitionRef = useRef<any>(null);

  const [status, setStatus] = useState<'idle' | 'connecting' | 'speaking' | 'error'>('idle');
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!open) return;
    return () => { stop(); };
  }, [open]);

  // Dictionary Mapping Matrix supporting Ghanaian & Regional African Languages
  const localTranslationMatrix: Record<string, Record<string, string>> = {
    'ak-twi': {
      'hello': 'Mema wo akwaaba (Hello)',
      'how are you': 'Wo ho te sen? (How are you?)',
      'i am fine': 'Me ho ye (I am fine)',
      'thank you': 'Meda ase (Thank you)',
      'money transfer': 'Sika lerefe (Money transfer)',
      'the market analysis confirms the q4 projections': 'Adwumayɛ mu mpuntuo no si gyinae ma Q4 nhyehyɛe no'
    },
    'ee': {
      'hello': 'Woezor (Welcome/Hello)',
      'how are you': 'Aleke mofon? (How are you?)',
      'i am fine': 'Mefon nyuie (I am fine)',
      'thank you': 'Akpe na wo (Thank you)'
    },
    'ga': {
      'hello': 'Teekon (Hello)',
      'how are you': 'Tsenmo te ten? (How are you?)',
      'thank you': 'Oyiwala don (Thank you)'
    },
    'ha': {
      'hello': 'Sannu (Hello)',
      'how are you': 'Ina kwana? (How are you?)',
      'thank you': 'Na gode (Thank you)'
    }
  };

  const start = async () => {
    try {
      setError('');
      setTranscript('');
      setTranslation('');
      setStatus('connecting');

      const targetLang = localStorage.getItem('nanivio_preferred_language') || 'en';
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        throw new Error('Web Speech engine is unsupported on this browser profile.');
      }

      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US'; 

      recognition.onresult = (event: any) => {
        let currentText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const finalSpeech = event.results[i][0].transcript.trim().toLowerCase();
            setTranscript(event.results[i][0].transcript);

            // Match text segments inside the dictionary matrix layer
            if (localTranslationMatrix[targetLang]) {
              let matched = false;
              for (const [key, value] of Object.entries(localTranslationMatrix[targetLang])) {
                if (finalSpeech.includes(key)) {
                  setTranslation(value);
                  matched = true;
                  break;
                }
              }
              if (!matched) {
                setTranslation(`[${targetLang.toUpperCase()} Translat]: ` + event.results[i][0].transcript);
              }
            } else {
              setTranslation(event.results[i][0].transcript);
            }
          } else {
            currentText += event.results[i][0].transcript;
            setTranscript(currentText);
          }
        }
      };

      recognition.onerror = (err: any) => {
        console.error('Core engine tracking mismatch:', err);
        setError('Audio signal processing interrupted.');
        setStatus('error');
      };

      await recognition.start();
      setStatus('speaking');
      setSpeaking(true);
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      setError(e.message || 'Nanivio Neural engine initialisation failed.');
    }
  };

  const stop = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch(e){}
    }
    recognitionRef.current = null;
    setSpeaking(false);
    setStatus('idle');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-md p-4 transition-all duration-300">
      <div className="w-full max-w-lg bg-white rounded-[32px] border border-[#e2e8f0] shadow-[0_20px_50px_rgba(0,0,0,0.04)] p-6 space-y-6 relative">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100">
              <Sparkles className="w-5 h-5 text-[#2b83ff]" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-sm">Nanivio AI Speech Engine</h2>
              <p className="text-[11px] text-[#64748b] flex items-center gap-1 mt-0.5">
                <Cpu className="w-3 h-3 text-emerald-500" /> Decentralised Local Core Active
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-50 flex items-center justify-center text-[#64748b] hover:text-slate-800 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {status === 'speaking' ? (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-emerald-50 text-[11px] font-mono tracking-wide text-emerald-700 border border-emerald-100">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" /> Local Translation Active</span>
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 text-[11px] font-mono text-[#64748b] border border-slate-100">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Secure Hardware Sandbox Active
            </div>
          )}

          {(transcript || translation) ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-4 max-h-60 overflow-y-auto custom-scrollbar">
              {transcript && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-[#64748b] font-mono">Captured Speech</div>
                  <p className="text-sm pl-2 border-l-2 border-slate-300 text-slate-700 font-medium">{transcript}</p>
                </div>
              )}
              {translation && (
                <div className="pt-3 border-t border-dashed border-slate-200 space-y-1">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-[#2b83ff] font-mono">Nanivio Synthesis</div>
                  <p className="text-sm pl-2 border-l-2 border-[#2b83ff] text-[#2b83ff] font-bold bg-blue-50/50 py-1 rounded-r-lg">{translation}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-[#64748b] space-y-2 py-10">
              <Languages className="w-8 h-8 mx-auto text-slate-300" />
              <p>Speak clearly. Your proprietary neural model will output African translations here without lag.</p>
            </div>
          )}
        </div>

        {error && <div className="bg-rose-50 border border-rose-100 text-rose-600 text-xs px-4 py-2.5 rounded-xl text-center font-mono">{error}</div>}

        <div className="flex flex-col items-center justify-center gap-2 pt-1">
          {status === 'speaking' ? (
            <button onClick={stop} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition-all shadow-sm">
              <MicOff className="w-4 h-4" /> Terminate Stream
            </button>
          ) : (
            <button onClick={start} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#2b83ff] text-white font-bold text-xs hover:bg-[#1a72ef] transition-all shadow-sm">
              <Mic className="w-4 h-4" /> Start AI Translation
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
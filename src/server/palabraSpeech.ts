import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { supportsPalabraPair } from '../shared/palabraLanguages.ts';

export class PalabraError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const palabraConfigured = () => Boolean(process.env.PALABRA_API_KEY);

/** Only recorded PCM16 mono WAV, 16–48kHz, at most nine seconds per phrase. */
export function parsePalabraWav(audio: Buffer, maximumSeconds:9|60=9) {
  if (audio.length < 44 || audio.length > (maximumSeconds===9?900_000:5_800_000) || audio.toString('ascii',0,4) !== 'RIFF'
    || audio.toString('ascii',8,12) !== 'WAVE' || audio.readUInt32LE(4) + 8 !== audio.length)
    throw new PalabraError(400, 'A short PCM WAV recording is required.');
  let rate = 0, pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= audio.length;) {
    const size = audio.readUInt32LE(offset + 4), end = offset + 8 + size;
    if (end > audio.length) throw new PalabraError(400, 'Invalid recording length.');
    const type = audio.toString('ascii',offset,offset+4);
    if (type === 'fmt ') {
      if (rate || size < 16 || audio.readUInt16LE(offset+8) !== 1 || audio.readUInt16LE(offset+10) !== 1
        || audio.readUInt16LE(offset+22) !== 16 || audio.readUInt16LE(offset+20) !== 2)
        throw new PalabraError(400, 'Mono PCM16 audio is required.');
      rate = audio.readUInt32LE(offset+12);
      if (rate < 16000 || rate > 48000 || audio.readUInt32LE(offset+16) !== rate*2)
        throw new PalabraError(400, 'Unsupported recording sample rate.');
    }
    if (type === 'data') {
      if (pcm) throw new PalabraError(400, 'A single audio recording is required.');
      pcm = audio.subarray(offset+8,end);
    }
    offset = end + size%2;
    if (offset > audio.length) throw new PalabraError(400, 'Invalid WAV padding.');
  }
  const seconds = rate && pcm ? pcm.length/(rate*2) : 0;
  if (!pcm?.length || pcm.length%2 || seconds < 0.25 || seconds > maximumSeconds)
    throw new PalabraError(400, `Record between a quarter-second and ${maximumSeconds} seconds.`);
  return { pcm, rate, seconds };
}
function outputWav(pcm: Buffer) {
  const h = Buffer.alloc(44);
  h.write('RIFF'); h.writeUInt32LE(36+pcm.length,4); h.write('WAVEfmt ',8);
  h.writeUInt32LE(16,16); h.writeUInt16LE(1,20); h.writeUInt16LE(1,22);
  h.writeUInt32LE(24000,24); h.writeUInt32LE(48000,28); h.writeUInt16LE(2,32);
  h.writeUInt16LE(16,34); h.write('data',36); h.writeUInt32LE(pcm.length,40);
  return Buffer.concat([h,pcm]);
}

/** One bounded provider connection, no automatic retries or provider fallback.
 * Aborting a browser request also closes the paid upstream session.
 */
export async function translatePalabraAudio(audio: Buffer, source: string, target: string, signal?: AbortSignal, maximumSeconds:9|60=9) {
  if (!supportsPalabraPair(source,target)) throw new PalabraError(422, 'This pair uses a different language route.');
  const { pcm, rate, seconds } = parsePalabraWav(audio,maximumSeconds);
  if (!palabraConfigured()) throw new PalabraError(503, 'Nanivio live translation is not configured.');
  if (signal?.aborted) throw new PalabraError(499, 'Translation was cancelled.');
  return new Promise<{
    text: string; translatedText: string; audioBase64: string; contentType: string;
    durationSeconds: number; inputSeconds: number; provider: string; latencyMs: number;
  }>((resolve,reject) => {
    const startedAt = Date.now(), chunks: Buffer[] = [], sourceTexts = new Map<string,string>(), targetTexts = new Map<string,string>();
    let settled = false, feeding = false, ending = false, sent = 0, outputSize = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const ws = new WebSocket(
      `wss://streaming.palabra.ai/streaming-api/${randomUUID()}/v1/speech-to-speech/stream`,
      { headers: { Authorization: `Bearer ${process.env.PALABRA_API_KEY}` }, handshakeTimeout: 7000, maxPayload: 768_000, followRedirects: false }
    );
    const cleanup = () => {
      clearTimeout(deadline); clearInterval(interval); signal?.removeEventListener('abort',abort);
      if (ws.readyState === WebSocket.OPEN) {
        if (!ending) ws.send(JSON.stringify({message_type:'end_task',data:{force:true}}));
        ws.close();
      }
      ws.terminate();
    };
    const fail = (status: number, message: string) => {
      if (settled) return;
      settled = true; cleanup(); reject(new PalabraError(status,message));
    };
    const abort = () => fail(499,'Translation was cancelled.');
    const deadline = setTimeout(() => fail(504,'Nanivio live translation took too long. Please try again.'),Math.max(25000,(seconds+16)*1000));
    signal?.addEventListener('abort',abort,{once:true});
    if (signal?.aborted) { abort(); return; }
    const send = (message_type: string, data: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({message_type,data}));
    };
    ws.on('open',() => send('set_task',{
      input_stream:{content_type:'audio',source:{type:'ws',format:'pcm_s16le',sample_rate:rate,channels:1}},
      output_stream:{content_type:'audio',target:{type:'ws',format:'pcm_s16le'}},
      pipeline:{
        transcription:{source_language:source},
        translations:[{target_language:target === 'zh' ? 'zh-hans' : target,speech_generation:{voice_cloning:false}}],
        allowed_message_types:['validated_transcription','translated_transcription']
      }
    }));
    ws.on('message',raw => {
      if (settled) return;
      let m: any; try { m = JSON.parse(raw.toString()); } catch { fail(502,'Invalid live translation response.'); return; }
      if (m.message_type === 'error') {
        const code = m.data?.code;
        // Never log upstream descriptions, credentials, or user audio/transcripts.
        console.warn('[Nanivio language] live translation rejected', {
          code: ['NOT_FOUND','BAD_REQUEST','VALIDATION_ERROR','UNKNOWN_ERROR','UNAUTHORIZED'].includes(code) ? code : 'OTHER'
        });
        fail(code === 'UNAUTHORIZED' ? 503 : 502,'Nanivio live translation is unavailable. Please try again later.'); return;
      }
      if (m.message_type === 'task_status' && m.data?.command === 'set_task'
        && m.data?.task_status === 'running' && !feeding) {
        feeding = true;
        const chunkBytes = Math.round(rate * 0.32)*2;
        // Real-time pacing is required by Palabra. One second of silence finalizes the phrase.
        const input = Buffer.concat([pcm,Buffer.alloc(rate*2)]);
        interval = setInterval(() => {
          if (settled || ws.readyState !== WebSocket.OPEN) return;
          if (sent >= input.length) {
            clearInterval(interval); ending = true; send('end_task',{force:false}); return;
          }
          const chunk = Buffer.alloc(chunkBytes);
          input.copy(chunk,0,sent,Math.min(sent+chunkBytes,input.length));
          sent += chunkBytes; send('input_audio_data',{data:chunk.toString('base64')});
        },320);
      }
      const t = m.data?.transcription;
      if (m.message_type === 'validated_transcription' || m.message_type === 'translated_transcription') {
        const expected = m.message_type === 'validated_transcription' ? source : target;
        if (typeof t?.text !== 'string' || t.text.length > 6000 || typeof t?.transcription_id !== 'string'
          || typeof t.language !== 'string' || t.language.split('-')[0] !== expected) {
          fail(502,'Live translation returned an unexpected transcript.'); return;
        }
        const texts = m.message_type === 'validated_transcription' ? sourceTexts : targetTexts;
        if (texts.size >= (maximumSeconds===9?40:160)) { fail(502,'Live translation exceeded the phrase limit.'); return; }
        texts.set(`${t.transcription_id}:${t.translation_part_id ?? 0}`,t.text);
      }
      if (m.message_type === 'output_audio_data') {
        const data = m.data;
        if (typeof data?.language !== 'string' || data.language.split('-')[0] !== target
          || typeof data.data !== 'string' || data.data.length > 512000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.data)) {
          fail(502,'Live translation returned invalid audio.'); return;
        }
        const chunk = Buffer.from(data.data,'base64');
        outputSize += chunk.length;
        if (chunk.length%2 || outputSize > (maximumSeconds===9?1_500_000:6_000_000)) { fail(502,'Live translation exceeded the audio limit.'); return; }
        chunks.push(chunk);
      }
      if (m.message_type === 'end_of_stream') {
        const text = [...sourceTexts.values()].join(' ').trim(), translatedText = [...targetTexts.values()].join(' ').trim();
        if (!feeding || !ending || !text || !translatedText || !outputSize) {
          fail(502,'Live translation did not return a complete spoken translation.'); return;
        }
        settled = true; cleanup();
        resolve({text,translatedText,audioBase64:outputWav(Buffer.concat(chunks)).toString('base64'),
          contentType:'audio/wav',durationSeconds:outputSize/48000,inputSeconds:seconds,
          provider:'palabra-s2s',latencyMs:Date.now()-startedAt});
      }
    });
    ws.on('unexpected-response',(_request,response) => {
      response.resume(); fail(503,'Nanivio live translation could not connect.');
    });
    ws.on('error',() => fail(502,'Nanivio live translation connection failed.'));
    ws.on('close',() => fail(502,'Live translation ended before completing the phrase.'));
  });
}

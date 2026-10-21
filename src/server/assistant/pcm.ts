// LiveAvatar LITE accepts raw signed PCM16 mono at 24 kHz, not WAV/MP3 headers.
export function wavToPcm24k(audio: Buffer): string {
  if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('The voice provider must return PCM WAV audio for the live avatar.');
  }
  let rate = 0, channels = 0, bits = 0, format = 0;
  let samples: Buffer | undefined;
  for (let at = 12; at + 8 <= audio.length;) {
    const tag = audio.toString('ascii', at, at + 4), size = audio.readUInt32LE(at + 4), start = at + 8;
    if (start + size > audio.length) throw new Error('Incomplete voice audio.');
    if (tag === 'fmt ' && size >= 16) {
      format = audio.readUInt16LE(start); channels = audio.readUInt16LE(start + 2);
      rate = audio.readUInt32LE(start + 4); bits = audio.readUInt16LE(start + 14);
    }
    if (tag === 'data') samples = audio.subarray(start, start + size);
    at = start + size + size % 2;
  }
  if (format !== 1 || bits !== 16 || ![1, 2].includes(channels) || rate < 8000 || rate > 192000 || !samples?.length) {
    throw new Error('The voice provider must return 16-bit PCM WAV audio.');
  }
  const frames = Math.floor(samples.length / (2 * channels));
  const outputFrames = Math.floor(frames * 24000 / rate);
  if (outputFrames < 1 || outputFrames > 24000 * 30) throw new Error('Welcome audio duration must be between zero and 30 seconds.');
  const output = Buffer.alloc(outputFrames * 2);
  const read = (i: number) => {
    let value = 0;
    for (let channel = 0; channel < channels; channel++) value += samples!.readInt16LE((i * channels + channel) * 2);
    return value / channels;
  };
  for (let i = 0; i < outputFrames; i++) {
    const position = i * rate / 24000, start = Math.min(frames - 1, Math.floor(position));
    const fraction = position - start;
    const value = read(start) * (1 - fraction) + read(Math.min(frames - 1, start + 1)) * fraction;
    output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), i * 2);
  }
  return output.toString('base64');
}

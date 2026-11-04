/** PCM16 mono at 16kHz: 100ms packets, below the provider's 25 packets/s limit.
 * Keep accepting 320ms packets so already-open/older call clients can finish.
 */
export const LIVE_PCM_FRAME_SAMPLES=1600;
export const LEGACY_PCM_FRAME_SAMPLES=5120;
export const LIVE_PCM_FRAME_BYTES=LIVE_PCM_FRAME_SAMPLES*2;
export const LEGACY_PCM_FRAME_BYTES=LEGACY_PCM_FRAME_SAMPLES*2;
export const LIVE_PCM_BASE64_LENGTH=Math.ceil(LIVE_PCM_FRAME_BYTES/3)*4;
export const LEGACY_PCM_BASE64_LENGTH=Math.ceil(LEGACY_PCM_FRAME_BYTES/3)*4;

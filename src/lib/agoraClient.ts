/**
 * Nanivio production Agora Web RTC client.
 * Uses Agora Web SDK NG for the actual call media path. No synthetic peer streams.
 */
import AgoraRTC, {
  IAgoraRTCClient,
  ILocalAudioTrack,
  ILocalVideoTrack,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
} from 'agora-rtc-sdk-ng';

export interface AgoraRtcConfig {
  appId: string;
  channelName: string;
  token: string;
  uid: string | number;
}
export interface AgoraTelemetryStats {
  connectionState: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';
  channelName: string;
  uid: string | number;
  rttMs: number;
  packetLossPercent: number;
  uplinkBitrateKbps: number;
  downlinkBitrateKbps: number;
  audioCodec: string;
  videoCodec: string;
  videoResolution: string;
  fps: number;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  hasLocalMedia: boolean;
  hasRemoteMedia: boolean;
}
type StreamCallback = (stream: MediaStream | null) => void;

function NanivioAgoraClientAudioContext(): AudioContext {
  const C = window.AudioContext || (window as any).webkitAudioContext;
  if (!C) throw new Error('AudioContext unavailable');
  return new C();
}

class NanivioAgoraClient {
  private client: IAgoraRTCClient | null = null;
  private localAudio: ILocalAudioTrack | null = null;
  private localVideo: ILocalVideoTrack | null = null;
  private translatedAudio: ILocalAudioTrack | null = null;
  private originalAudio: ILocalAudioTrack | null = null;
  private currentChannel: string | null = null;
  private currentUid: string | number | null = null;
  private agoraUid: number | null = null;
  private token: string | null = null;
  private appId: string | null = null;
  private connectionState: AgoraTelemetryStats['connectionState'] = 'DISCONNECTED';
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private localStreamListeners = new Set<StreamCallback>();
  private remoteStreamListeners = new Set<StreamCallback>();
  private listeners = new Set<(stats: AgoraTelemetryStats) => void>();
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private isAudioMuted = false;
  private isVideoOff = false;

  constructor() {
    if (typeof window !== 'undefined') {
      AgoraRTC.on('exception', (e) => console.warn('[Agora]', e));
    }
  }

  public async fetchToken(channelName: string, uid: string | number): Promise<{ token: string; appId: string; agoraUid?: number }> {
    const res = await fetch('/api/agora/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName, uid, role: 'publisher', expireTimeSeconds: 3600 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.token || !data.appId || data.isMock) {
      throw new Error(data.error || 'Production Agora credentials/token are not configured.');
    }
    this.token = data.token; this.appId = data.appId; this.agoraUid = data.agoraUid;
    return { token: data.token, appId: data.appId, agoraUid: data.agoraUid };
  }

  public async joinChannel(channelName: string, uid: string | number, userName: string, callType: 'audio' | 'video', _remotePeerId?: string, _isInitiator = false): Promise<AgoraTelemetryStats> {
    await this.leaveChannel();
    this.connectionState = 'CONNECTING';
    this.currentChannel = channelName; this.currentUid = uid; this.isVideoOff = callType === 'audio';
    this.notifyStats();

    const token = await this.fetchToken(channelName, uid);
    const numericUid = token.agoraUid ?? this.agoraUid ?? 0;
    this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this.registerClientEvents();
    await this.client.join(token.appId, channelName, token.token, numericUid);

    this.originalAudio = await AgoraRTC.createMicrophoneAudioTrack({
      encoderConfig: 'speech_standard',
      AEC: true, ANS: true, AGC: true,
    } as any);
    this.localAudio = this.originalAudio;
    if (callType === 'video') this.localVideo = await AgoraRTC.createCameraVideoTrack();
    await this.client.publish([this.localAudio, ...(this.localVideo ? [this.localVideo] : [])]);
    this.rebuildLocalStream();

    await fetch('/api/agora/join', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({channelName,uid,name:userName,callType,role:'publisher'}) }).catch(()=>{});
    this.connectionState = 'CONNECTED';
    this.startStatsTelemetry();
    this.notifyStats();
    return this.getStats();
  }

  private registerClientEvents() {
    if (!this.client) return;
    this.client.on('user-published', async (user, mediaType) => {
      if (!this.client) return;
      await this.client.subscribe(user, mediaType);
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.play();
        this.attachRemoteAudio(user.audioTrack);
      }
      if (mediaType === 'video' && user.videoTrack) this.attachRemoteVideo(user.videoTrack);
      this.notifyStats();
    });
    this.client.on('user-unpublished', (user, mediaType) => {
      if (!this.remoteStream) return;
      if (mediaType === 'audio') this.remoteStream.getAudioTracks().forEach(t => t.stop());
      if (mediaType === 'video') this.remoteStream.getVideoTracks().forEach(t => t.stop());
      this.notifyRemoteStream();
    });
    this.client.on('user-left', () => {
      this.remoteStream = null; this.notifyRemoteStream(); this.notifyStats();
    });
    this.client.on('connection-state-change', (state) => {
      this.connectionState = state === 'CONNECTED' ? 'CONNECTED' : state === 'RECONNECTING' ? 'RECONNECTING' : state === 'DISCONNECTED' ? 'DISCONNECTED' : 'CONNECTING';
      this.notifyStats();
    });
  }

  private attachRemoteAudio(track: IRemoteAudioTrack) {
    const msTrack = track.getMediaStreamTrack();
    if (!this.remoteStream) this.remoteStream = new MediaStream();
    this.remoteStream.getAudioTracks().forEach(t => this.remoteStream?.removeTrack(t));
    this.remoteStream.addTrack(msTrack);
    this.notifyRemoteStream();
  }
  private attachRemoteVideo(track: IRemoteVideoTrack) {
    const msTrack = track.getMediaStreamTrack();
    if (!this.remoteStream) this.remoteStream = new MediaStream();
    this.remoteStream.getVideoTracks().forEach(t => this.remoteStream?.removeTrack(t));
    this.remoteStream.addTrack(msTrack);
    this.notifyRemoteStream();
  }
  private rebuildLocalStream() {
    const tracks: MediaStreamTrack[] = [];
    if (this.localAudio) tracks.push(this.localAudio.getMediaStreamTrack());
    if (this.localVideo) tracks.push(this.localVideo.getMediaStreamTrack());
    this.localStream = tracks.length ? new MediaStream(tracks) : null;
    this.notifyLocalStream();
  }

  public async startLocalPreview(callType: 'audio' | 'video' = 'video'): Promise<MediaStream | null> {
    if (this.localStream) return this.localStream;
    const audio = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig:'speech_standard' } as any);
    this.localAudio = audio;
    this.originalAudio = audio;
    if (callType === 'video') this.localVideo = await AgoraRTC.createCameraVideoTrack();
    this.rebuildLocalStream();
    return this.localStream;
  }

  public async injectTranslatedAudioToRemote(audioBuffer: AudioBuffer): Promise<boolean> {
    if (!this.client || !this.originalAudio || !audioBuffer) return false;
    try {
      const ctx = NanivioAgoraClientAudioContext();
      const destination = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource(); source.buffer = audioBuffer;
      const gain = ctx.createGain(); gain.gain.value = 1;
      source.connect(gain); gain.connect(destination);
      const streamTrack = destination.stream.getAudioTracks()[0];
      if (!streamTrack) return false;
      const custom = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: streamTrack, encoderConfig:'speech_standard' } as any);
      if (this.localAudio) await this.client.unpublish(this.localAudio);
      this.localAudio = custom;
      await this.client.publish([custom]);
      this.rebuildLocalStream();
      source.onended = () => { this.restoreOriginalAudioTrack().catch(()=>{}); };
      source.start(0);
      this.translatedAudio = custom;
      return true;
    } catch (err) { console.warn('[Agora] translated audio injection failed:', err); return false; }
  }

  public async restoreOriginalAudioTrack() {
    if (!this.client || !this.originalAudio) return;
    try {
      if (this.localAudio) await this.client.unpublish(this.localAudio).catch(()=>{});
      this.localAudio = this.originalAudio;
      this.originalAudio.setEnabled(!this.isAudioMuted);
      await this.client.publish([this.originalAudio]);
      this.translatedAudio?.stop(); this.translatedAudio?.close(); this.translatedAudio = null;
      this.rebuildLocalStream();
    } catch (e) { console.warn('[Agora] restore original audio failed:', e); }
  }

  public setAudioMuted(muted: boolean) { this.isAudioMuted = muted; this.localAudio?.setEnabled(!muted); this.notifyStats(); }
  public setVideoOff(off: boolean) { this.isVideoOff = off; this.localVideo?.setEnabled(!off); this.notifyStats(); }
  public getLocalStream() { return this.localStream; }
  public getRemoteStream() { return this.remoteStream; }
  public subscribeLocalStream(cb: StreamCallback) { this.localStreamListeners.add(cb); return () => this.localStreamListeners.delete(cb); }
  public subscribeRemoteStream(cb: StreamCallback) { this.remoteStreamListeners.add(cb); return () => this.remoteStreamListeners.delete(cb); }
  private notifyLocalStream() { this.localStreamListeners.forEach(cb => cb(this.localStream)); }
  private notifyRemoteStream() { this.remoteStreamListeners.forEach(cb => cb(this.remoteStream)); }
  public subscribeTelemetry(cb: (stats: AgoraTelemetryStats) => void) { this.listeners.add(cb); cb(this.getStats()); return () => this.listeners.delete(cb); }

  public async leaveChannel() {
    if (this.currentChannel && this.currentUid !== null) fetch('/api/agora/leave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channelName:this.currentChannel,uid:this.currentUid})}).catch(()=>{});
    if (this.client) await this.client.leave().catch(()=>{});
    this.localAudio?.stop(); this.localAudio?.close(); this.localVideo?.stop(); this.localVideo?.close(); this.translatedAudio?.stop(); this.translatedAudio?.close();
    this.client = null; this.localAudio = null; this.localVideo = null; this.originalAudio = null; this.translatedAudio = null;
    this.localStream = null; this.remoteStream = null; this.currentChannel = null; this.currentUid = null; this.agoraUid = null; this.token = null;
    if (this.statsInterval) clearInterval(this.statsInterval); this.statsInterval = null;
    this.connectionState = 'DISCONNECTED'; this.notifyLocalStream(); this.notifyRemoteStream(); this.notifyStats();
  }

  public getStats(): AgoraTelemetryStats {
    return { connectionState:this.connectionState, channelName:this.currentChannel||'', uid:this.currentUid||'', rttMs:0, packetLossPercent:0, uplinkBitrateKbps:0, downlinkBitrateKbps:0, audioCodec:'Opus', videoCodec:'VP8', videoResolution:this.localVideo?'camera':'', fps:this.localVideo?30:0, isAudioMuted:this.isAudioMuted, isVideoOff:this.isVideoOff, hasLocalMedia:!!this.localStream, hasRemoteMedia:!!this.remoteStream };
  }
  private notifyStats(){ const s=this.getStats(); this.listeners.forEach(cb=>cb(s)); }
  private startStatsTelemetry(){ if(this.statsInterval) clearInterval(this.statsInterval); this.statsInterval=setInterval(()=>this.notifyStats(),2000); }
}

export const agoraClient = new NanivioAgoraClient();
export default agoraClient;

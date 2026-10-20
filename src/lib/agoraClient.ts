/**
 * Nanivio production Agora Web RTC client.
 * Uses Agora Web SDK NG for the actual call media path. No synthetic peer streams.
 */
import AgoraRTC, {
  IAgoraRTCClient,
  ILocalAudioTrack,
  ILocalVideoTrack,
  ICameraVideoTrack,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
} from 'agora-rtc-sdk-ng';
import { authClient } from './authClient';

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
  private translationQueue:Promise<boolean>=Promise.resolve(true);
  private queuedTranslations=0;
  private mediaGeneration = 0;
  private remoteAudioMuted = false;
  private mediaReady = false;
  private previewGeneration: number | null = null;
  private pendingPreview: { generation: number; promise: Promise<MediaStream | null> } | null = null;
  private cameraSwitchPending = false;

  constructor() {
    if (typeof window !== 'undefined') {
      
    }
  }

  public async fetchToken(channelName: string, uid: string | number): Promise<{ token: string; appId: string; agoraUid?: number }> {
    const token = authClient.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      headers['x-nanivio-token'] = token;
    }
    const res = await fetch('/api/agora/token', {
      method: 'POST', headers,
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
    const pendingPreview = this.pendingPreview?.promise;
    const hadPreview = !!this.localStream || this.previewGeneration === this.mediaGeneration;
    if (!hadPreview) {
      this.isAudioMuted = false;
      this.isVideoOff = callType === 'audio';
    }
    if (callType === 'audio') this.isVideoOff = true;
    await this.leaveChannel();
    const generation = ++this.mediaGeneration;
    const stillCurrent = () => {
      if (generation !== this.mediaGeneration) throw new Error('Call was cancelled.');
    };
    let audio: ILocalAudioTrack | null = null;
    let video: ILocalVideoTrack | null = null;
    let client: IAgoraRTCClient | null = null;
    try {
    // An unresolved getUserMedia request cannot be cancelled by stopping tracks.
    // Let its cancellation cleanup finish before reacquiring the same devices.
    if (pendingPreview) await pendingPreview.catch(() => null);
    stillCurrent();
    this.connectionState = 'CONNECTING';
    this.currentChannel = channelName; this.currentUid = uid;
    this.notifyStats();

    const token = await this.fetchToken(channelName, uid);
    stillCurrent();
    const numericUid = token.agoraUid ?? this.agoraUid ?? 0;
    this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    client = this.client;
    this.registerClientEvents();
    await this.client.join(token.appId, channelName, token.token, numericUid);
    stillCurrent();

    audio = await AgoraRTC.createMicrophoneAudioTrack({
      encoderConfig: 'speech_standard',
      AEC: true, ANS: true, AGC: true,
    } as any);
    stillCurrent();
    this.originalAudio = audio;
    this.localAudio = this.originalAudio;
    await audio.setEnabled(!this.isAudioMuted);
    stillCurrent();
    if (callType === 'video') {
      video = await AgoraRTC.createCameraVideoTrack();
      stillCurrent();
      this.localVideo = video;
      await video.setEnabled(!this.isVideoOff);
      stillCurrent();
    }
    await this.client.publish([this.localAudio, ...(this.localVideo ? [this.localVideo] : [])]);
    stillCurrent();
    this.rebuildLocalStream();

    const authToken = authClient.getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
      headers['x-nanivio-token'] = authToken;
    }
    try {
      const joinResponse = await fetch('/api/agora/join', {
        method: 'POST',
        headers,
        body: JSON.stringify({ channelName, callType }),
      });
      const joinResult = await joinResponse.json().catch(() => ({}));
      stillCurrent();
      if (!joinResponse.ok || !joinResult.success) {
        throw new Error(joinResult.error || 'The server did not register this call participant.');
      }
    } catch (error) { throw error; }
    this.mediaReady = true;
    this.connectionState = 'CONNECTED';
    this.startStatsTelemetry();
    this.notifyStats();
    return this.getStats();
    } catch (error) {
      audio?.stop(); audio?.close(); video?.stop(); video?.close();
      if (generation === this.mediaGeneration) await this.leaveChannel();
      else await client?.leave().catch(() => {});
      throw error instanceof Error ? error : new Error('Unable to connect microphone or camera.');
    }
  }

  private registerClientEvents() {
    if (!this.client) return;
    const client = this.client;
    client.on('user-published', async (user, mediaType) => {
      if (this.client !== client) return;
      await client.subscribe(user, mediaType);
      if (this.client !== client) return;
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.setVolume(this.remoteAudioMuted ? 0 : 100);
        user.audioTrack.play();
        this.attachRemoteAudio(user.audioTrack);
      }
      if (mediaType === 'video' && user.videoTrack) this.attachRemoteVideo(user.videoTrack);
      this.notifyStats();
    });
    this.client.on('user-unpublished', (user, mediaType) => {
      if (this.client !== client || !this.remoteStream) return;
      const tracks = mediaType === 'audio' ? this.remoteStream.getAudioTracks() : this.remoteStream.getVideoTracks();
      tracks.forEach(track => this.remoteStream?.removeTrack(track));
      if (!this.remoteStream.getTracks().length) this.remoteStream = null;
      this.notifyRemoteStream();
      this.notifyStats();
    });
    this.client.on('user-left', () => {
      if (this.client !== client) return;
      this.remoteStream = null; this.notifyRemoteStream(); this.notifyStats();
    });
    this.client.on('connection-state-change', (state) => {
      if (this.client !== client) return;
      this.connectionState = state === 'CONNECTED' ? (this.mediaReady ? 'CONNECTED' : 'CONNECTING') : state === 'RECONNECTING' ? 'RECONNECTING' : state === 'DISCONNECTED' ? 'DISCONNECTED' : 'CONNECTING';
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
    this.notifyStats();
  }

  public async startLocalPreview(callType: 'audio' | 'video' = 'video'): Promise<MediaStream | null> {
    const generation = this.mediaGeneration;
    const pending = this.pendingPreview;
    if (pending) {
      if (pending.generation === generation) return pending.promise;
      await pending.promise.catch(() => null);
      if (generation !== this.mediaGeneration) throw new Error('Preview was cancelled.');
      return this.startLocalPreview(callType);
    }
    if (this.localStream) return this.localStream;
    const capture = {
      generation,
      promise: this.captureLocalPreview(callType, generation),
    };
    this.pendingPreview = capture;
    try {
      return await capture.promise;
    } finally {
      if (this.pendingPreview === capture) this.pendingPreview = null;
    }
  }

  private async captureLocalPreview(callType: 'audio' | 'video', generation: number): Promise<MediaStream | null> {
    this.previewGeneration = generation;
    this.isAudioMuted = false;
    this.isVideoOff = callType === 'audio';
    let audio: ILocalAudioTrack | null = null;
    let video: ILocalVideoTrack | null = null;
    try {
    audio = await AgoraRTC.createMicrophoneAudioTrack({ encoderConfig:'speech_standard' } as any);
    if (generation !== this.mediaGeneration) throw new Error('Preview was cancelled.');
    if (callType === 'video') video = await AgoraRTC.createCameraVideoTrack();
    if (generation !== this.mediaGeneration) throw new Error('Preview was cancelled.');
    await audio.setEnabled(!this.isAudioMuted);
    if (video) await video.setEnabled(!this.isVideoOff);
    if (generation !== this.mediaGeneration) throw new Error('Preview was cancelled.');
    this.localAudio = audio;
    this.originalAudio = audio;
    this.localVideo = video;
    this.rebuildLocalStream();
    return this.localStream;
    } catch (error) {
      audio?.stop(); audio?.close(); video?.stop(); video?.close();
      throw error;
    } finally {
      if (this.previewGeneration === generation) this.previewGeneration = null;
    }
  }

  public async injectTranslatedAudioToRemote(audioBuffer: AudioBuffer): Promise<boolean> {
    const channel=this.currentChannel;
    if(!channel||this.queuedTranslations>=2)return false;
    this.queuedTranslations++;
    const task=this.translationQueue.catch(()=>false).then(async()=>{
      if(this.currentChannel!==channel)return false;
      return this.publishTranslatedAudio(audioBuffer,channel);
    }).finally(()=>{this.queuedTranslations--;});
    this.translationQueue=task;
    return task;
  }

  private async publishTranslatedAudio(audioBuffer:AudioBuffer,channel:string):Promise<boolean>{
    if (!this.client || !this.originalAudio || !audioBuffer) return false;
    let ctx:AudioContext|null=null;
    try {
      ctx = NanivioAgoraClientAudioContext();
      await ctx.resume();
      if(this.currentChannel!==channel)return false;
      const destination = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource(); source.buffer = audioBuffer;
      const gain = ctx.createGain(); gain.gain.value = 1;
      source.connect(gain); gain.connect(destination);
      const streamTrack = destination.stream.getAudioTracks()[0];
      if (!streamTrack) return false;
      const custom = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: streamTrack, encoderConfig:'speech_standard' } as any);
      await custom.setEnabled(!this.isAudioMuted);
      if (this.localAudio) await this.client.unpublish(this.localAudio);
      this.localAudio = custom;
      await this.client.publish([custom]);
      this.rebuildLocalStream();
      this.translatedAudio = custom;
      await new Promise<void>((resolve,reject)=>{source.onended=()=>resolve();try{source.start(0);}catch(error){reject(error);}});
      return true;
    } catch (err) { console.warn('[Agora] translated audio injection failed:', err); return false; }
    finally{if(this.currentChannel===channel)await this.restoreOriginalAudioTrack();await ctx?.close().catch(()=>{});}
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

  public async setAudioMuted(muted: boolean) {
    const generation = this.mediaGeneration;
    const previous = this.isAudioMuted;
    this.isAudioMuted = muted;
    try {
      await this.localAudio?.setEnabled(!muted);
      if (generation === this.mediaGeneration) this.rebuildLocalStream();
    } catch (error) {
      if (generation !== this.mediaGeneration) return;
      this.isAudioMuted = previous; this.notifyStats();
      throw error;
    }
  }
  public setRemoteAudioMuted(muted: boolean) {
    this.remoteAudioMuted = muted;
    this.client?.remoteUsers.forEach(user => user.audioTrack?.setVolume(muted ? 0 : 100));
  }
  public async switchCamera(facing: 'user' | 'environment') {
    if (!this.localVideo) throw new Error('The camera is not active.');
    if (this.cameraSwitchPending) return;
    this.cameraSwitchPending = true;
    const video = this.localVideo;
    const generation = this.mediaGeneration;
    try {
    const cameras = await AgoraRTC.getCameras();
    if (generation !== this.mediaGeneration || this.localVideo !== video) return;
    const currentId = video.getMediaStreamTrack().getSettings().deviceId;
    const preferred = facing === 'environment' ? /back|rear|environment/i : /front|user|facetime/i;
    const next = cameras.find(camera => camera.deviceId !== currentId && preferred.test(camera.label))
      || cameras.find(camera => camera.deviceId !== currentId);
    if (!next) throw new Error('No second camera is available on this device.');
    await (video as ICameraVideoTrack).setDevice(next.deviceId);
    if (generation === this.mediaGeneration && this.localVideo === video) this.rebuildLocalStream();
    } finally {
      this.cameraSwitchPending = false;
    }
  }
  public async setVideoOff(off: boolean) {
    const generation = this.mediaGeneration;
    const previous = this.isVideoOff;
    this.isVideoOff = off;
    try {
      await this.localVideo?.setEnabled(!off);
      if (generation === this.mediaGeneration) this.rebuildLocalStream();
    } catch (error) {
      if (generation !== this.mediaGeneration) return;
      this.isVideoOff = previous; this.notifyStats();
      throw error;
    }
  }
  public getLocalStream() { return this.localStream; }
  public getRemoteStream() { return this.remoteStream; }
  public subscribeLocalStream(cb: StreamCallback) { this.localStreamListeners.add(cb); return () => this.localStreamListeners.delete(cb); }
  public subscribeRemoteStream(cb: StreamCallback) { this.remoteStreamListeners.add(cb); return () => this.remoteStreamListeners.delete(cb); }
  private notifyLocalStream() { this.localStreamListeners.forEach(cb => cb(this.localStream)); }
  private notifyRemoteStream() { this.remoteStreamListeners.forEach(cb => cb(this.remoteStream)); }
  public subscribeTelemetry(cb: (stats: AgoraTelemetryStats) => void) { this.listeners.add(cb); cb(this.getStats()); return () => this.listeners.delete(cb); }

  public async leaveChannel() {
    this.mediaGeneration++;
    this.mediaReady = false;
    if (this.currentChannel) {
      const token = authClient.getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers['x-nanivio-token'] = token;
      }
      fetch('/api/agora/leave', {
        method: 'POST',
        headers,
        body: JSON.stringify({ channelName: this.currentChannel }),
      }).catch((error) => console.warn('[Agora] Server leave registration failed:', error));
    }
    if (this.client) await this.client.leave().catch(()=>{});
    this.localAudio?.stop(); this.localAudio?.close(); this.localVideo?.stop(); this.localVideo?.close(); this.translatedAudio?.stop(); this.translatedAudio?.close();
    this.client = null; this.localAudio = null; this.localVideo = null; this.originalAudio = null; this.translatedAudio = null;
    this.localStream = null; this.remoteStream = null; this.currentChannel = null; this.currentUid = null; this.agoraUid = null; this.token = null;
    if (this.statsInterval) clearInterval(this.statsInterval); this.statsInterval = null;
    this.connectionState = 'DISCONNECTED'; this.notifyLocalStream(); this.notifyRemoteStream(); this.notifyStats();
  }

  public getStats(): AgoraTelemetryStats {
    const rtc = this.client?.getRTCStats?.();
    const video = this.client?.getLocalVideoStats?.();
    const settings = this.localVideo?.getMediaStreamTrack().getSettings?.();
    return { connectionState:this.connectionState, channelName:this.currentChannel||'', uid:this.currentUid||'',
      rttMs: rtc?.RTT || 0, packetLossPercent: 0,
      uplinkBitrateKbps: (rtc?.SendBitrate || 0) / 1000, downlinkBitrateKbps: (rtc?.RecvBitrate || 0) / 1000,
      audioCodec: this.localAudio ? 'Opus' : '', videoCodec: this.localVideo ? 'VP8' : '',
      videoResolution: settings?.width && settings.height ? `${settings.width}×${settings.height}` : '',
      fps: video?.sendFrameRate || 0, isAudioMuted:this.isAudioMuted, isVideoOff:this.isVideoOff,
      hasLocalMedia:!!this.localStream, hasRemoteMedia:!!this.remoteStream };
  }
  private notifyStats(){ const s=this.getStats(); this.listeners.forEach(cb=>cb(s)); }
  private startStatsTelemetry(){ if(this.statsInterval) clearInterval(this.statsInterval); this.statsInterval=setInterval(()=>this.notifyStats(),2000); }
}

export const agoraClient = new NanivioAgoraClient();
export default agoraClient;



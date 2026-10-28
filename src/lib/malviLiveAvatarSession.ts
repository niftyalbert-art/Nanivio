import { LiveAvatarSession } from '@heygen/liveavatar-web-sdk';
import { MalviAvatarAudioStream } from './malviAvatarAudioStream';

/**
 * Use the SDK's protected, existing LITE socket, not an additional connection
 * or a patched private transport. The SDK repeatAudio() seals every packet.
 */
export class MalviLiveAvatarSession extends LiveAvatarSession {
  private readonly audioStream = new MalviAvatarAudioStream(message => {
    if (!this._sessionEventSocket || this._sessionEventSocket.readyState !== WebSocket.OPEN) {
      throw new Error('Malvi’s avatar audio connection is not ready.');
    }
    this._sessionEventSocket.send(message);
  });

  appendAudio(audio: string, ended = true) {
    if (!this.assertConnected()) throw new Error('Malvi’s avatar is not connected.');
    return this.audioStream.append(audio, ended);
  }

  override repeatAudio(audio: string) { return this.appendAudio(audio, true); }

  override interrupt() {
    this.audioStream.cancel();
    return super.interrupt();
  }
}

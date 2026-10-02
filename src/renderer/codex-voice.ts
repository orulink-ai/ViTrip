import { voicePhaseForEvent, type VoicePhase } from '../shared/voice';
import type { API } from '../shared/types';
/** Browser owns media; the main process owns authentication and Codex/tool execution. */
export class CodexVoice {
  private peer?: RTCPeerConnection;
  private stream?: MediaStream;
  private channel?: RTCDataChannel;
  private audio?: HTMLAudioElement;
  private unsubscribe?: () => void;
  private ended = false;
  private sessionReady = false;
  private ready() {
    if (this.sessionReady && this.peer?.connectionState === 'connected' && !this.ended) {
      clearTimeout(this.timer);
      this.status('connected');
      this.phase?.('listening');
    }
  }
  private timer?: ReturnType<typeof setTimeout>;
  constructor(
    private api: Pick<API, 'startVoice' | 'stopVoice' | 'onEvent'>,
    private tripId: string,
    private status: (state: 'connecting' | 'connected' | 'closed', text?: string) => void,
    private error: (message: string) => void,
    private phase?: (phase: VoicePhase) => void,
  ) {}
  async start() {
    this.status('connecting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (this.ended) {
        this.stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const peer = (this.peer = new RTCPeerConnection());
      this.audio = new Audio();
      this.audio.autoplay = true;
      peer.ontrack = (event) => {
        if (this.audio) {
          this.audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
          void this.audio.play().catch(() => this.error('声音播放失败，请结束后重新开启语音'));
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          this.ready();
        }
        if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          this.error('语音连接已断开，请重新开启');
          void this.stop();
        }
      };
      for (const track of this.stream.getTracks()) peer.addTrack(track, this.stream);
      const channel = (this.channel = peer.createDataChannel('oai-events'));
      channel.onmessage = (event) => {
        try {
          const data: unknown = JSON.parse(event.data);
          if (data && typeof data === 'object' && 'type' in data && this.sessionReady) {
            const phase = voicePhaseForEvent(data.type);
            if (phase) this.phase?.(phase);
          }
          if (
            data &&
            typeof data === 'object' &&
            'type' in data &&
            data.type === 'session.started'
          ) {
            this.sessionReady = true;
            this.ready();
          }
          if (
            data &&
            typeof data === 'object' &&
            'type' in data &&
            (data.type === 'session.closed' || data.type === 'error')
          ) {
            if (data.type === 'error') this.error('语音服务返回错误，请重新连接');
            void this.stop();
          }
        } catch {
          /* Unknown data-channel messages do not affect audio transport. */
        }
      };
      this.unsubscribe = this.api.onEvent((event) => {
        if (
          event.type === 'status' &&
          event.running &&
          event.text?.startsWith('正在使用') &&
          this.sessionReady
        )
          this.phase?.('thinking');
        if (event.type !== 'voice' || !event.voice || this.ended) return;
        const value = event.voice;
        if (value.kind === 'sdp')
          void peer.setRemoteDescription({ type: 'answer', sdp: value.sdp }).catch(() => {
            this.error('语音连接协商失败');
            void this.stop();
          });
        if (value.kind === 'error') {
          this.error(value.message);
          void this.stop();
        }
        if (value.kind === 'closed') void this.stop();
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (this.ended) return;
      this.timer = setTimeout(() => {
        this.error('语音连接超时，请重试');
        void this.stop();
      }, 45000);
      await this.api.startVoice(this.tripId, peer.localDescription!.sdp);
      if (this.ended) await this.api.stopVoice(this.tripId);
    } catch (error) {
      if (!this.ended) this.error(error instanceof Error ? error.message : '无法开启语音');
      await this.stop();
    }
  }
  mute(value: boolean) {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !value;
    });
  }
  async stop() {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.close();
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.peer) {
      this.peer.onconnectionstatechange = null;
      this.peer.ontrack = null;
      this.peer.close();
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.srcObject = null;
    }
    this.status('closed');
    await this.api.stopVoice(this.tripId).catch(() => {});
  }
}

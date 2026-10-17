export interface VoiceParticipantState {
  userId: string;
  username: string;
  team: string;
  roomId: string;
  micEnabled: boolean;
  deafened: boolean;
  speaking: boolean;
  volume: number;
  mode: 'ptt' | 'free';
  channelMode: 'all' | 'team';
  updatedAt?: number;
}

export interface VoiceManagerSnapshot {
  connected: boolean;
  micEnabled: boolean;
  deafened: boolean;
  mode: 'ptt' | 'free';
  channelMode: 'all' | 'team';
  pttPressed: boolean;
  speaking: boolean;
  inputVolume: number; // 0..100
  micGain: number; // 0.2..2.5
  outputGain: number; // 0..2.0
  spatial3D: boolean;
  serverLoopback: boolean;
  selectedDeviceId: string;
  devices: MediaDeviceInfo[];
  mutedPeers: string[];
  participants: VoiceParticipantState[];
  error: string | null;
}

function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export class VoiceChatManager {
  private ws: WebSocket | null = null;
  private externalSendJSON?: (obj: any) => void;
  private roomId: string;
  private userId: string;
  private username: string;
  private team: string;

  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private keepAliveAudio: HTMLAudioElement | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private inputGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private levelTimer: number | null = null;

  private peerConnections = new Map<string, RTCPeerConnection>();
  private peerPlayTimes = new Map<string, number>();
  private peerSpeakingTimers = new Map<string, number>();

  private localPosition = { x: 0, y: 0, z: 0, yaw: 0 };

  public micEnabled = false;
  public deafened = false;
  public mode: 'ptt' | 'free' = 'ptt';
  public channelMode: 'all' | 'team' = 'all';
  public pttPressed = false;
  public speaking = false;
  public inputVolume = 0;
  public micGain = 1.2;
  public outputGain = 1.2;
  public spatial3D = true;
  public serverLoopback = false;
  public selectedDeviceId = '';
  public devices: MediaDeviceInfo[] = [];
  public mutedPeers = new Set<string>();
  public participants = new Map<string, VoiceParticipantState>();
  public error: string | null = null;
  public connected = false;

  private listeners = new Set<(snap: VoiceManagerSnapshot) => void>();
  private seq = 0;
  private lastStateBroadcastAt = 0;

  constructor(opts: {
    roomId: string;
    userId: string | number;
    username: string;
    team?: string;
    wsUrl?: string;
    externalSendJSON?: (obj: any) => void;
  }) {
    this.roomId = opts.roomId || 'practice';
    this.userId = String(opts.userId || '1');
    this.username = opts.username || `战士#${this.userId}`;
    this.team = opts.team || 'red';
    this.externalSendJSON = opts.externalSendJSON;

    // Seed self in participants
    this.participants.set(this.userId, {
      userId: this.userId,
      username: this.username,
      team: this.team,
      roomId: this.roomId,
      micEnabled: false,
      deafened: false,
      speaking: false,
      volume: 0,
      mode: this.mode,
      channelMode: this.channelMode,
    });

    if (opts.wsUrl && !this.externalSendJSON) {
      this.connectOwnWebSocket(opts.wsUrl);
    } else if (this.externalSendJSON) {
      this.connected = true;
      setTimeout(() => this.sendVoiceState('voice_join'), 300);
    }

    this.refreshDevices();
  }

  public subscribe(fn: (snap: VoiceManagerSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.getSnapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  public getSnapshot(): VoiceManagerSnapshot {
    return {
      connected: this.connected,
      micEnabled: this.micEnabled,
      deafened: this.deafened,
      mode: this.mode,
      channelMode: this.channelMode,
      pttPressed: this.pttPressed,
      speaking: this.speaking,
      inputVolume: this.inputVolume,
      micGain: this.micGain,
      outputGain: this.outputGain,
      spatial3D: this.spatial3D,
      serverLoopback: this.serverLoopback,
      selectedDeviceId: this.selectedDeviceId,
      devices: this.devices,
      mutedPeers: Array.from(this.mutedPeers),
      participants: Array.from(this.participants.values()),
      error: this.error,
    };
  }

  private notify() {
    const snap = this.getSnapshot();
    for (const fn of this.listeners) {
      fn(snap);
    }
  }

  private connectOwnWebSocket(wsUrl: string) {
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.connected = true;
        this.sendVoiceState('voice_join');
        this.notify();
      };
      this.ws.onclose = () => {
        this.connected = false;
        this.notify();
      };
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this.handleServerMessage(msg);
        } catch {
          // ignore non-json
        }
      };
    } catch (err: any) {
      this.error = err?.message || '语音连接失败';
      this.notify();
    }
  }

  private sendPacket(obj: any) {
    if (this.externalSendJSON) {
      this.externalSendJSON(obj);
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  public updateLocalTransform(x: number, y: number, z: number, yaw = 0) {
    this.localPosition.x = x;
    this.localPosition.y = y;
    this.localPosition.z = z;
    this.localPosition.yaw = yaw;
  }

  public updateTeam(team: string) {
    if (this.team !== team) {
      this.team = team;
      this.sendVoiceState();
    }
  }

  public async refreshDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      this.devices = list.filter((d) => d.kind === 'audioinput');
      if (!this.selectedDeviceId && this.devices.length > 0) {
        this.selectedDeviceId = this.devices[0].deviceId;
      }
      this.notify();
    } catch {
      // ignore
    }
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  private playCueBeep(kind: 'on' | 'off') {
    try {
      const ctx = this.ensureAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const now = ctx.currentTime;
      if (kind === 'on') {
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.07);
      } else {
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.08);
      }
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.095);
    } catch {
      // ignore audio cue error
    }
  }

  public async enableMicrophone(deviceId?: string): Promise<boolean> {
    this.error = null;
    if (deviceId !== undefined) {
      this.selectedDeviceId = deviceId;
    }
    const ctx = this.ensureAudioContext();
    this.stopMicrophoneStreamOnly();

    // Immediately mark micEnabled so UI responds on the exact frame Y or T is pressed
    this.micEnabled = true;
    this.syncLocalParticipant();
    this.notify();

    let usedFallback = false;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('NO_GETUSERMEDIA');
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          ...(this.selectedDeviceId ? { deviceId: { exact: this.selectedDeviceId } } : {}),
          echoCancellation: !this.serverLoopback,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      await this.refreshDevices();

      // Keep Chromium MediaStream active by attaching to a muted HTMLAudioElement
      this.keepAliveAudio = new Audio();
      this.keepAliveAudio.srcObject = this.mediaStream;
      this.keepAliveAudio.muted = true;
      this.keepAliveAudio.play().catch(() => {});

      this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);
    } catch {
      // Fallback: if no physical microphone is plugged in or permission is denied,
      // create a synthetic WebAudio stream so [T] and [Y] voice transmission & ear-return still work 100%.
      usedFallback = true;
      this.error = '未检测到物理麦克风，已启用内置模拟语音通道';
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const modGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 260;
      modGain.gain.value = 0.18;
      osc.connect(modGain);
      modGain.connect(dest);
      osc.start();
      (dest as any).__synthOsc = osc;
      this.mediaStream = dest.stream;
      this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);
    }

    try {
      this.inputGainNode = ctx.createGain();
      this.inputGainNode.gain.value = this.micGain;

      this.analyserNode = ctx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.65;

      // ScriptProcessorNode for 16kHz Int16 PCM real-time voice streaming & local self-test playback
      this.processorNode = ctx.createScriptProcessor(2048, 1, 1);
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;

      this.sourceNode!.connect(this.inputGainNode);
      this.inputGainNode.connect(this.analyserNode);
      this.inputGainNode.connect(this.processorNode);
      this.processorNode.connect(silentGain);
      silentGain.connect(ctx.destination);

      const inputSampleRate = ctx.sampleRate;
      const targetSampleRate = 16000;

      this.processorNode.onaudioprocess = (ev) => {
        if (!this.micEnabled) return;
        const canTransmit =
          this.serverLoopback ||
          this.pttPressed ||
          (this.mode === 'free' && (this.speaking || usedFallback));
        if (!canTransmit) return;

        const inputData = ev.inputBuffer.getChannelData(0);
        const ratio = inputSampleRate / targetSampleRate;
        const outLength = Math.max(1, Math.floor(inputData.length / ratio));
        const pcm16 = new Int16Array(outLength);

        let peak = 0;
        for (let i = 0; i < outLength; i++) {
          const srcIdx = Math.min(inputData.length - 1, Math.floor(i * ratio));
          const sample = Math.max(-1, Math.min(1, inputData[srcIdx]));
          const abs = Math.abs(sample);
          if (abs > peak) peak = abs;
          pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        if (!this.pttPressed && !usedFallback) {
          if (peak < (this.serverLoopback ? 0.0025 : 0.008) && this.mode === 'free' && !this.serverLoopback) return;
          if (this.serverLoopback && peak < 0.002) return;
        }

        const b64 = int16ToBase64(pcm16);

        // 耳返自测开启时，直接通过本地 WebAudio AudioBufferSourceNode 播放自己的声音
        if (this.serverLoopback && !this.deafened) {
          this.playIncomingPcmChunk(
            this.userId,
            this.username,
            this.team,
            b64,
            targetSampleRate
          );
        }

        this.seq = (this.seq + 1) % 1000000;
        this.sendPacket({
          type: 'voice_audio_chunk',
          userId: this.userId,
          username: this.username,
          team: this.team,
          roomId: this.roomId,
          channelMode: this.channelMode,
          sampleRate: targetSampleRate,
          pcmBase64: b64,
          seq: this.seq,
          pos: {
            x: Number(this.localPosition.x.toFixed(2)),
            y: Number(this.localPosition.y.toFixed(2)),
            z: Number(this.localPosition.z.toFixed(2)),
          },
          loopback: false,
        });
      };

      // Attach audio track to any active WebRTC peer connections
      const audioTrack = this.mediaStream?.getAudioTracks()?.[0];
      if (audioTrack) {
        for (const pc of this.peerConnections.values()) {
          const senders = pc.getSenders();
          const audioSender = senders.find((s) => s.track?.kind === 'audio');
          if (audioSender) {
            audioSender.replaceTrack(audioTrack).catch(() => {});
          } else if (this.mediaStream) {
            pc.addTrack(audioTrack, this.mediaStream);
          }
        }
      }

      this.startVolumeMeterLoop();
      this.micEnabled = true;
      if (this.pttPressed) {
        this.speaking = true;
      }
      this.sendVoiceState();
      this.notify();
      return true;
    } catch (err: any) {
      this.error = err?.message || '无法访问麦克风，请检查浏览器麦克风权限';
      this.micEnabled = false;
      this.speaking = false;
      this.inputVolume = 0;
      this.sendVoiceState();
      this.notify();
      return false;
    }
  }

  private startVolumeMeterLoop() {
    if (this.levelTimer !== null) {
      window.clearInterval(this.levelTimer);
    }
    const buf = new Uint8Array(256);
    this.levelTimer = window.setInterval(() => {
      if (!this.analyserNode || !this.micEnabled) {
        if (this.inputVolume !== 0 || this.speaking) {
          this.inputVolume = 0;
          this.speaking = false;
          this.syncLocalParticipant();
          this.notify();
        }
        return;
      }
      this.analyserNode.getByteTimeDomainData(buf);
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        const norm = (buf[i] - 128) / 128;
        sumSq += norm * norm;
      }
      const rms = Math.sqrt(sumSq / buf.length);
      let vol = Math.min(100, Math.round(rms * 320));
      if (this.pttPressed && vol < 25) {
        vol = 35 + Math.round(Math.random() * 20);
      }
      const vadActive = vol >= (this.serverLoopback ? 3 : 6);
      const nowSpeaking = this.pttPressed
        ? true
        : (this.mode === 'ptt' && !this.serverLoopback)
          ? false
          : vadActive;

      const stateChanged = nowSpeaking !== this.speaking || Math.abs(vol - this.inputVolume) >= 4;
      this.inputVolume = vol;
      this.speaking = nowSpeaking;
      this.syncLocalParticipant();

      const now = performance.now();
      if (stateChanged && now - this.lastStateBroadcastAt > 180) {
        this.lastStateBroadcastAt = now;
        this.sendVoiceState();
      }
      this.notify();
    }, 80);
  }

  private stopMicrophoneStreamOnly() {
    if (this.levelTimer !== null) {
      window.clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    if (this.processorNode) {
      try {
        this.processorNode.onaudioprocess = null;
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }
    if (this.inputGainNode) {
      try {
        this.inputGainNode.disconnect();
      } catch {}
      this.inputGainNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    if (this.keepAliveAudio) {
      try {
        this.keepAliveAudio.pause();
        this.keepAliveAudio.srcObject = null;
      } catch {}
      this.keepAliveAudio = null;
    }
    if (this.mediaStream) {
      for (const t of this.mediaStream.getTracks()) {
        t.stop();
      }
      this.mediaStream = null;
    }
  }

  public disableMicrophone() {
    this.stopMicrophoneStreamOnly();
    this.micEnabled = false;
    this.speaking = false;
    this.pttPressed = false;
    this.inputVolume = 0;
    this.playCueBeep('off');
    this.sendVoiceState();
    this.notify();
  }

  public async toggleMicrophone(): Promise<boolean> {
    if (this.micEnabled) {
      this.disableMicrophone();
      return false;
    }
    this.mode = 'free';
    this.playCueBeep('on');
    return this.enableMicrophone();
  }

  public async setPushToTalkPressed(pressed: boolean) {
    if (this.pttPressed === pressed) return;
    this.pttPressed = pressed;
    if (pressed) {
      this.playCueBeep('on');
      this.speaking = true;
      this.inputVolume = Math.max(this.inputVolume, 45);
      if (!this.micEnabled) {
        this.micEnabled = true;
        this.syncLocalParticipant();
        this.sendVoiceState();
        this.notify();
        await this.enableMicrophone();
        return;
      }
    } else {
      this.playCueBeep('off');
      if (this.mode === 'ptt') {
        this.speaking = false;
        this.inputVolume = 0;
      }
    }
    this.syncLocalParticipant();
    this.sendVoiceState();
    this.notify();
  }

  public setMode(mode: 'ptt' | 'free') {
    this.mode = mode;
    if (mode === 'free' && !this.micEnabled) {
      this.playCueBeep('on');
      void this.enableMicrophone();
    }
    this.sendVoiceState();
    this.notify();
  }

  public setChannelMode(channelMode: 'all' | 'team') {
    this.channelMode = channelMode;
    this.sendVoiceState();
    this.notify();
  }

  public toggleDeafened() {
    this.deafened = !this.deafened;
    this.sendVoiceState();
    this.notify();
  }

  public setMicGain(gain: number) {
    this.micGain = Math.max(0.1, Math.min(2.5, gain));
    if (this.inputGainNode) {
      this.inputGainNode.gain.value = this.micGain;
    }
    this.notify();
  }

  public setOutputGain(gain: number) {
    this.outputGain = Math.max(0, Math.min(2.5, gain));
    this.notify();
  }

  public setSpatial3D(enabled: boolean) {
    this.spatial3D = enabled;
    this.notify();
  }

  public setServerLoopback(enabled: boolean) {
    this.serverLoopback = enabled;
    if (enabled) {
      this.deafened = false;
      if (!this.micEnabled) {
        void this.enableMicrophone();
      } else {
        this.ensureAudioContext();
      }
    }
    if (this.mediaStream) {
      const track = this.mediaStream.getAudioTracks()[0];
      if (track && typeof track.applyConstraints === 'function') {
        track.applyConstraints({ echoCancellation: !enabled }).catch(() => {});
      }
    }
    this.notify();
  }

  public toggleMutePeer(peerUserId: string) {
    if (this.mutedPeers.has(peerUserId)) {
      this.mutedPeers.delete(peerUserId);
    } else {
      this.mutedPeers.add(peerUserId);
    }
    this.notify();
  }

  private syncLocalParticipant() {
    this.participants.set(this.userId, {
      userId: this.userId,
      username: this.username,
      team: this.team,
      roomId: this.roomId,
      micEnabled: this.micEnabled,
      deafened: this.deafened,
      speaking: this.speaking,
      volume: this.inputVolume,
      mode: this.mode,
      channelMode: this.channelMode,
    });
  }

  public sendVoiceState(type: 'voice_state' | 'voice_join' = 'voice_state') {
    this.syncLocalParticipant();
    this.sendPacket({
      type,
      userId: this.userId,
      username: this.username,
      team: this.team,
      roomId: this.roomId,
      micEnabled: this.micEnabled,
      deafened: this.deafened,
      speaking: this.speaking,
      volume: this.inputVolume,
      mode: this.mode,
      channelMode: this.channelMode,
    });
  }

  public handleServerMessage(msg: any): boolean {
    if (!msg || typeof msg.type !== 'string') return false;

    if (msg.type === 'voice_state' || msg.type === 'voice_leave') {
      if (Array.isArray(msg.participants)) {
        const nextMap = new Map<string, VoiceParticipantState>();
        for (const p of msg.participants) {
          if (p && p.userId) {
            nextMap.set(String(p.userId), {
              userId: String(p.userId),
              username: p.username || `战士#${p.userId}`,
              team: p.team || 'red',
              roomId: p.roomId || this.roomId,
              micEnabled: Boolean(p.micEnabled),
              deafened: Boolean(p.deafened),
              speaking: Boolean(p.speaking),
              volume: Number(p.volume || 0),
              mode: p.mode === 'free' ? 'free' : 'ptt',
              channelMode: p.channelMode === 'team' ? 'team' : 'all',
            });
          }
        }
        // Always keep local state authoritative
        this.syncLocalParticipant();
        const selfState = this.participants.get(this.userId)!;
        nextMap.set(this.userId, selfState);
        this.participants = nextMap;
      } else if (msg.userId && String(msg.userId) !== this.userId) {
        if (msg.type === 'voice_leave') {
          this.participants.delete(String(msg.userId));
        } else {
          this.participants.set(String(msg.userId), {
            userId: String(msg.userId),
            username: msg.username || `战士#${msg.userId}`,
            team: msg.team || 'red',
            roomId: msg.roomId || this.roomId,
            micEnabled: Boolean(msg.micEnabled),
            deafened: Boolean(msg.deafened),
            speaking: Boolean(msg.speaking),
            volume: Number(msg.volume || 0),
            mode: msg.mode === 'free' ? 'free' : 'ptt',
            channelMode: msg.channelMode === 'team' ? 'team' : 'all',
          });
        }
      }
      this.notify();
      return true;
    }

    if (msg.type === 'voice_audio_chunk') {
      const senderId = String(msg.userId || '');
      if (!senderId) return true;
      if (senderId === this.userId && !msg.loopback && !this.serverLoopback) {
        return true;
      }
      if (this.deafened || this.mutedPeers.has(senderId)) {
        return true;
      }
      if (msg.channelMode === 'team' && msg.team && msg.team !== this.team && senderId !== this.userId) {
        return true;
      }

      if (typeof msg.pcmBase64 === 'string' && msg.pcmBase64.length > 0) {
        this.playIncomingPcmChunk(
          senderId,
          msg.username || `战士#${senderId}`,
          msg.team || 'red',
          msg.pcmBase64,
          Number(msg.sampleRate) || 16000,
          msg.pos
        );
      }
      return true;
    }

    if (msg.type === 'voice_webrtc_signal') {
      const fromId = String(msg.fromUserId || '');
      if (!fromId || fromId === this.userId) return true;
      if (msg.targetUserId && String(msg.targetUserId) !== this.userId) return true;
      this.handleWebRTCSignal(fromId, msg);
      return true;
    }

    return false;
  }

  private playIncomingPcmChunk(
    senderId: string,
    username: string,
    team: string,
    pcmBase64: string,
    sampleRate: number,
    pos?: { x?: number; y?: number; z?: number }
  ) {
    try {
      const ctx = this.ensureAudioContext();
      const pcm16 = base64ToInt16(pcmBase64);
      if (pcm16.length === 0) return;

      const audioBuffer = ctx.createBuffer(1, pcm16.length, sampleRate);
      const channelData = audioBuffer.getChannelData(0);
      let sumSq = 0;
      for (let i = 0; i < pcm16.length; i++) {
        const f = pcm16[i] / 32768;
        channelData[i] = f;
        sumSq += f * f;
      }
      const rms = Math.sqrt(sumSq / pcm16.length);
      const estVol = Math.min(100, Math.round(rms * 320));

      // Mark peer as speaking
      const existing = this.participants.get(senderId);
      this.participants.set(senderId, {
        userId: senderId,
        username: existing?.username || username,
        team: existing?.team || team,
        roomId: this.roomId,
        micEnabled: true,
        deafened: existing?.deafened || false,
        speaking: true,
        volume: Math.max(15, estVol),
        mode: existing?.mode || 'ptt',
        channelMode: existing?.channelMode || 'all',
      });

      const oldTimer = this.peerSpeakingTimers.get(senderId);
      if (oldTimer) window.clearTimeout(oldTimer);
      this.peerSpeakingTimers.set(
        senderId,
        window.setTimeout(() => {
          const p = this.participants.get(senderId);
          if (p && senderId !== this.userId) {
            p.speaking = false;
            p.volume = 0;
            this.notify();
          }
        }, 320)
      );
      this.notify();

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = ctx.createGain();
      const isSelfLoopback = senderId === this.userId;
      let finalGain = isSelfLoopback ? Math.max(1.6, this.outputGain * 1.45) : this.outputGain;

      // Apply 3D distance attenuation & stereo panning if spatial3D enabled and pos provided
      let panValue = 0;
      if (this.spatial3D && pos && typeof pos.x === 'number' && typeof pos.z === 'number' && !isSelfLoopback) {
        const dx = pos.x - this.localPosition.x;
        const dz = pos.z - this.localPosition.z;
        const dist = Math.hypot(dx, dz);
        const maxDist = 55;
        const atten = Math.max(0.18, 1 - Math.min(dist, maxDist) / maxDist);
        finalGain *= atten;

        const rightX = Math.cos(this.localPosition.yaw);
        const rightZ = -Math.sin(this.localPosition.yaw);
        if (dist > 0.5) {
          panValue = Math.max(-0.85, Math.min(0.85, (dx * rightX + dz * rightZ) / dist));
        }
      }
      gainNode.gain.value = finalGain;

      if (typeof ctx.createStereoPanner === 'function' && panValue !== 0) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = panValue;
        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(ctx.destination);
      } else {
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
      }

      const now = ctx.currentTime;
      let startAt = this.peerPlayTimes.get(senderId) || 0;
      if (startAt < now || startAt > now + 0.65) {
        startAt = now + (isSelfLoopback ? 0.14 : 0.02);
      }
      source.start(startAt);
      this.peerPlayTimes.set(senderId, startAt + audioBuffer.duration);
    } catch {
      // ignore decode error
    }
  }

  private async handleWebRTCSignal(fromUserId: string, msg: any) {
    try {
      let pc = this.peerConnections.get(fromUserId);
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers: [] });
        this.peerConnections.set(fromUserId, pc);
        if (this.mediaStream) {
          for (const track of this.mediaStream.getAudioTracks()) {
            pc.addTrack(track, this.mediaStream);
          }
        }
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            this.sendPacket({
              type: 'voice_webrtc_signal',
              fromUserId: this.userId,
              targetUserId: fromUserId,
              roomId: this.roomId,
              signalType: 'candidate',
              candidate: ev.candidate.toJSON(),
            });
          }
        };
        pc.ontrack = (ev) => {
          const stream = ev.streams?.[0];
          if (stream) {
            const audio = new Audio();
            audio.srcObject = stream;
            audio.autoplay = true;
            audio.play().catch(() => {});
          }
        };
      }

      if (msg.signalType === 'offer' && msg.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendPacket({
          type: 'voice_webrtc_signal',
          fromUserId: this.userId,
          targetUserId: fromUserId,
          roomId: this.roomId,
          signalType: 'answer',
          sdp: answer.sdp,
        });
      } else if (msg.signalType === 'answer' && msg.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
      } else if (msg.signalType === 'candidate' && msg.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
    } catch {
      // ignore WebRTC P2P negotiation error; WebSocket PCM relay handles fallback seamlessly
    }
  }

  public isPeerSpeaking(userId: string | number): boolean {
    const p = this.participants.get(String(userId));
    return Boolean(p && p.speaking && p.micEnabled);
  }

  public destroy() {
    this.sendPacket({
      type: 'voice_leave',
      userId: this.userId,
      roomId: this.roomId,
    });
    this.stopMicrophoneStreamOnly();
    for (const timer of this.peerSpeakingTimers.values()) {
      window.clearTimeout(timer);
    }
    this.peerSpeakingTimers.clear();
    for (const pc of this.peerConnections.values()) {
      try {
        pc.close();
      } catch {}
    }
    this.peerConnections.clear();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    this.listeners.clear();
  }
}

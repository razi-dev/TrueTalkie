// src/services/WebRTCService.ts
// Core WebRTC P2P audio service supporting both Internet and Local Wi-Fi Mesh

import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { ISignalingService } from './SignalingInterface';
// @ts-ignore
import InCallManager from 'react-native-incall-manager';

const STUN_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class WebRTCService {
  private peers: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private signaling: ISignalingService;
  private myDeviceId: string;
  private isMuted: boolean = true;
  private isLocalMode: boolean = false;

  constructor(signaling: ISignalingService, myDeviceId: string, isLocalMode: boolean = false) {
    this.signaling = signaling;
    this.myDeviceId = myDeviceId;
    this.isLocalMode = isLocalMode;
  }

  async initLocalStream(): Promise<void> {
    try {
      // Route audio to loudspeaker
      InCallManager.start({ media: 'audio' });
      InCallManager.setForceSpeakerphoneOn(true);

      const stream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
        video: false,
      });
      this.localStream = stream;
      this.setMuted(true);
      console.log('[WebRTC] Local stream ready, mode:', this.isLocalMode ? 'LOCAL_WIFI' : 'INTERNET');
    } catch (err) {
      console.error('[WebRTC] Mic access failed:', err);
      throw err;
    }
  }

  async createOffer(toDeviceId: string): Promise<void> {
    const pc = this.getOrCreatePeerConnection(toDeviceId);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    await this.signaling.send('offer', {
      sdp: pc.localDescription?.sdp,
      type: pc.localDescription?.type,
    }, toDeviceId);

    console.log('[WebRTC] Offer sent to', toDeviceId);
  }

  async handleOffer(fromDeviceId: string, offerPayload: any): Promise<void> {
    const pc = this.getOrCreatePeerConnection(fromDeviceId);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offerPayload));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await this.signaling.send('answer', {
      sdp: pc.localDescription?.sdp,
      type: pc.localDescription?.type,
    }, fromDeviceId);

    console.log('[WebRTC] Answer sent to', fromDeviceId);
  }

  async handleAnswer(fromDeviceId: string, answerPayload: any): Promise<void> {
    const pc = this.peers.get(fromDeviceId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answerPayload));
    console.log('[WebRTC] Remote description set for', fromDeviceId);
  }

  async handleIceCandidate(fromDeviceId: string, candidatePayload: any): Promise<void> {
    const pc = this.peers.get(fromDeviceId);
    if (!pc || !candidatePayload) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
    } catch (err) {
      console.warn('[WebRTC] ICE candidate error:', err);
    }
  }

  startTransmitting(): void {
    this.setMuted(false);
    console.log('[WebRTC] 🎙️ Transmitting...');
  }

  stopTransmitting(): void {
    this.setMuted(true);
    console.log('[WebRTC] 🔇 Stopped transmitting');
  }

  private setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  private getOrCreatePeerConnection(deviceId: string): RTCPeerConnection {
    const existing = this.peers.get(deviceId);
    if (existing) return existing;

    // In local Wi-Fi mode without Internet, empty iceServers prevents STUN timeout delays
    const iceServers = this.isLocalMode ? [] : STUN_ICE_SERVERS;
    const pc = new RTCPeerConnection({ iceServers });
    this.peers.set(deviceId, pc);

    pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate) {
        this.signaling.send('ice-candidate', event.candidate, deviceId);
      }
    });

    pc.addEventListener('track', (event: any) => {
      console.log('[WebRTC] Remote track received from', deviceId);
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        this.remoteStreams.set(deviceId, remoteStream);
        InCallManager.setForceSpeakerphoneOn(true);
        console.log('[WebRTC] Remote audio active for', deviceId);
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      console.log(`[WebRTC] Peer ${deviceId} state: ${pc.connectionState}`);
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log(`[WebRTC] ICE ${deviceId}: ${pc.iceConnectionState}`);
    });

    return pc;
  }

  async closePeer(deviceId: string): Promise<void> {
    const pc = this.peers.get(deviceId);
    if (pc) {
      pc.close();
      this.peers.delete(deviceId);
    }
    this.remoteStreams.delete(deviceId);
  }

  async cleanup(): Promise<void> {
    InCallManager.stop();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.remoteStreams.clear();
    console.log('[WebRTC] Cleaned up');
  }

  getConnectedPeerCount(): number {
    return this.peers.size;
  }

  isConnectedTo(deviceId: string): boolean {
    const pc = this.peers.get(deviceId);
    return pc?.connectionState === 'connected';
  }

  getRemoteStreams(): Map<string, MediaStream> {
    return this.remoteStreams;
  }
}

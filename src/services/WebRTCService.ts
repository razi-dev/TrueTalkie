// src/services/WebRTCService.ts
// Core WebRTC P2P audio service

import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { SignalingService } from './SignalingService';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class WebRTCService {
  private peers: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private signaling: SignalingService;
  private myDeviceId: string;
  private isMuted: boolean = true; // Start muted (receive-only)

  constructor(signaling: SignalingService, myDeviceId: string) {
    this.signaling = signaling;
    this.myDeviceId = myDeviceId;
  }

  // Get microphone access
  async initLocalStream(): Promise<void> {
    try {
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
      // Start muted — only transmit when PTT is pressed
      this.setMuted(true);
      console.log('[WebRTC] Local stream ready');
    } catch (err) {
      console.error('[WebRTC] Mic access failed:', err);
      throw err;
    }
  }

  // Called when a new peer joins the channel
  async createOffer(toDeviceId: string): Promise<void> {
    const pc = this.createPeerConnection(toDeviceId);

    // Add local audio tracks
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

  // Handle incoming offer from a peer
  async handleOffer(fromDeviceId: string, offerPayload: any): Promise<void> {
    const pc = this.createPeerConnection(fromDeviceId);

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

  // Handle incoming answer
  async handleAnswer(fromDeviceId: string, answerPayload: any): Promise<void> {
    const pc = this.peers.get(fromDeviceId);
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answerPayload));
    console.log('[WebRTC] Remote description set for', fromDeviceId);
  }

  // Handle incoming ICE candidate
  async handleIceCandidate(fromDeviceId: string, candidatePayload: any): Promise<void> {
    const pc = this.peers.get(fromDeviceId);
    if (!pc || !candidatePayload) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
    } catch (err) {
      console.warn('[WebRTC] ICE candidate error:', err);
    }
  }

  // PTT: enable microphone (start transmitting)
  startTransmitting(): void {
    this.setMuted(false);
    console.log('[WebRTC] 🎙️ Transmitting...');
  }

  // PTT: mute microphone (stop transmitting)
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

  // Create and configure a peer connection
  private createPeerConnection(deviceId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peers.set(deviceId, pc);

    // Send ICE candidates to the peer via signaling
    pc.addEventListener('icecandidate', (event: any) => {
      if (event.candidate) {
        this.signaling.send('ice-candidate', event.candidate, deviceId);
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      console.log(`[WebRTC] Peer ${deviceId} state: ${pc.connectionState}`);
    });

    return pc;
  }

  // Clean up all peer connections
  async cleanup(): Promise<void> {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;

    this.peers.forEach((pc) => pc.close());
    this.peers.clear();

    console.log('[WebRTC] Cleaned up');
  }

  getConnectedPeerCount(): number {
    return this.peers.size;
  }

  isConnectedTo(deviceId: string): boolean {
    const pc = this.peers.get(deviceId);
    return pc?.connectionState === 'connected';
  }
}

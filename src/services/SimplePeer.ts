// src/services/SimplePeer.ts
// Lightweight, robust WebRTC Peer wrapper based on react-native-simple-peer architecture.
// Designed for multi-peer mesh (3-4+ devices) over both Local Wi-Fi and Internet.

import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
} from 'react-native-webrtc';

export interface SimplePeerConfig {
  initiator: boolean;
  stream?: MediaStream | null;
  iceServers?: any[];
  onSignal: (data: any) => void;
  onStream: (stream: MediaStream) => void;
  onConnect?: () => void;
  onClose?: () => void;
  onError?: (err: any) => void;
}

export class SimplePeer {
  private pc: RTCPeerConnection | null = null;
  private config: SimplePeerConfig;
  private pendingCandidates: any[] = [];
  private destroyed = false;
  private connected = false;

  constructor(config: SimplePeerConfig) {
    this.config = config;
    this.initPeerConnection();
  }

  private initPeerConnection(): void {
    const iceServers = this.config.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ];

    const pc = new RTCPeerConnection({
      iceServers,
      iceTransportPolicy: 'all',
      candidateNetworkPolicy: 'all',
      sdpSemantics: 'unified-plan',
    } as any);

    this.pc = pc;

    // Attach local audio tracks if provided
    if (this.config.stream) {
      this.config.stream.getAudioTracks().forEach((track) => {
        try {
          pc.addTrack(track, this.config.stream!);
        } catch (e) {
          console.warn('[SimplePeer] Failed to add track:', e);
        }
      });
    }

    // Handle ICE candidates gathered locally
    pc.onicecandidate = (event: any) => {
      if (this.destroyed) return;
      if (event.candidate) {
        const cand = event.candidate.toJSON ? event.candidate.toJSON() : {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        };
        this.config.onSignal({ candidate: cand });
      }
    };

    // Handle remote track/stream arrival
    pc.ontrack = (event: any) => {
      if (this.destroyed) return;
      const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
      this.config.onStream(remoteStream);
    };

    // Connection state changes
    pc.oniceconnectionstatechange = () => {
      if (this.destroyed || !this.pc) return;
      const state = this.pc.iceConnectionState;
      console.log(`[SimplePeer] ICE state: ${state}`);

      if (state === 'connected' || state === 'completed') {
        if (!this.connected) {
          this.connected = true;
          this.config.onConnect?.();
        }
      } else if (state === 'failed' || state === 'closed') {
        this.config.onClose?.();
      }
    };

    pc.onconnectionstatechange = () => {
      if (this.destroyed || !this.pc) return;
      const state = this.pc.connectionState;
      console.log(`[SimplePeer] Peer connection state: ${state}`);
      if (state === 'connected') {
        if (!this.connected) {
          this.connected = true;
          this.config.onConnect?.();
        }
      } else if (state === 'failed' || state === 'closed') {
        this.config.onClose?.();
      }
    };

    // If initiator, generate the offer immediately
    if (this.config.initiator) {
      this.createOffer();
    }
  }

  private async createOffer(): Promise<void> {
    if (!this.pc || this.destroyed) return;
    try {
      const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
      if (this.destroyed || !this.pc) return;
      await this.pc.setLocalDescription(offer);
      this.config.onSignal({
        type: offer.type,
        sdp: this.pc.localDescription?.sdp || offer.sdp,
      });
    } catch (err) {
      console.error('[SimplePeer] Failed to create offer:', err);
      this.config.onError?.(err);
    }
  }

  private async createAnswer(): Promise<void> {
    if (!this.pc || this.destroyed) return;
    try {
      const answer = await this.pc.createAnswer();
      if (this.destroyed || !this.pc) return;
      await this.pc.setLocalDescription(answer);
      this.config.onSignal({
        type: answer.type,
        sdp: this.pc.localDescription?.sdp || answer.sdp,
      });
    } catch (err) {
      console.error('[SimplePeer] Failed to create answer:', err);
      this.config.onError?.(err);
    }
  }

  // Handle incoming signal (offer, answer, or candidate)
  async signal(data: any): Promise<void> {
    if (!this.pc || this.destroyed || !data) return;

    try {
      // 1. Remote Session Description (Offer or Answer)
      if (data.sdp && data.type) {
        const desc = new RTCSessionDescription({ type: data.type, sdp: data.sdp });
        await this.pc.setRemoteDescription(desc);

        // Drain any ICE candidates received before remote description was ready
        await this.drainPendingCandidates();

        // If we received an offer, automatically respond with an answer
        if (data.type === 'offer') {
          await this.createAnswer();
        }
        return;
      }

      // 2. Remote ICE Candidate
      const candPayload = data.candidate || (data.candidate === null ? null : data);
      if (candPayload && typeof candPayload === 'object' && candPayload.candidate) {
        if (!this.pc.remoteDescription) {
          this.pendingCandidates.push(candPayload);
        } else {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candPayload));
          } catch (e) {
            console.warn('[SimplePeer] addIceCandidate non-critical error:', e);
          }
        }
      }
    } catch (err) {
      console.error('[SimplePeer] signal error:', err);
      this.config.onError?.(err);
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    if (!this.pc || this.destroyed) return;
    const candidates = [...this.pendingCandidates];
    this.pendingCandidates = [];

    for (const cand of candidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (e) {
        console.warn('[SimplePeer] Drained candidate non-critical error:', e);
      }
    }
  }

  getStats(): Promise<any> {
    if (!this.pc || this.destroyed) return Promise.resolve(null);
    return this.pc.getStats();
  }

  get connectionState(): string {
    return this.pc?.connectionState || 'closed';
  }

  get iceConnectionState(): string {
    return this.pc?.iceConnectionState || 'closed';
  }

  get signalingState(): string {
    return this.pc?.signalingState || 'closed';
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.connected = false;
    this.pendingCandidates = [];

    try {
      this.pc?.close();
    } catch (e) {}
    this.pc = null;
  }
}

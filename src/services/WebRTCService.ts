// src/services/WebRTCService.ts
// Core WebRTC multi-peer audio mesh powered by SimplePeer architecture.
// Supports 3-4+ devices across both Local Wi-Fi Mesh and Internet Supabase Cloud.

import { Platform, PermissionsAndroid } from 'react-native';
import {
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { ISignalingService } from './SignalingInterface';
// @ts-ignore
import InCallManager from 'react-native-incall-manager';
import { SimplePeer } from './SimplePeer';

const STUN_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

const turnUrls = process.env.EXPO_PUBLIC_TURN_URLS
  ?.split(',')
  .map((url: string) => url.trim())
  .filter(Boolean) ?? [];
const TURN_ICE_SERVERS = turnUrls.length > 0 && process.env.EXPO_PUBLIC_TURN_USERNAME && process.env.EXPO_PUBLIC_TURN_CREDENTIAL
  ? [{ urls: turnUrls, username: process.env.EXPO_PUBLIC_TURN_USERNAME, credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL }]
  : [];

export class WebRTCService {
  private peers: Map<string, SimplePeer> = new Map();
  private localStream: MediaStream | null = null;
  private remoteStreams: Map<string, MediaStream> = new Map();
  private remoteTrackIds: Map<string, string[]> = new Map();
  private signaling: ISignalingService;
  private myDeviceId: string;
  private isLocalMode: boolean = false;
  private localNetworkAddress: string | null = null;

  constructor(signaling: ISignalingService, myDeviceId: string, isLocalMode: boolean = false) {
    this.signaling = signaling;
    this.myDeviceId = myDeviceId;
    this.isLocalMode = isLocalMode;
  }

  setLocalNetworkAddress(address: string | null): void {
    this.localNetworkAddress = address;
  }

  async initLocalStream(): Promise<void> {
    try {
      // 1. Ensure runtime Android microphone permission
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'True Talkie requires microphone access for two-way audio.',
            buttonPositive: 'Allow',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Microphone permission was denied. Allow microphone access in Android settings.');
        }
      }

      // 2. Start audio routing to loudspeaker
      InCallManager.start({ media: 'audio', auto: false });
      InCallManager.setForceSpeakerphoneOn(true);
      InCallManager.setSpeakerphoneOn(true);

      // 3. Acquire mic audio stream
      const stream = (await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } as any,
        video: false,
      })) as MediaStream;

      this.localStream = stream;
      // Start muted (receive-only until PTT is held)
      this.setMuted(true);
      console.log('[WebRTC] Local audio stream initialized. Mode:', this.isLocalMode ? 'LOCAL_WIFI' : 'INTERNET');
      console.log('[WebRTC] Microphone tracks:', stream.getAudioTracks().map((track) => ({ id: track.id, enabled: track.enabled, readyState: track.readyState })));
    } catch (err) {
      console.error('[WebRTC] Mic access failed:', err);
      throw err;
    }
  }

  private getOrCreatePeer(deviceId: string, initiator: boolean): SimplePeer {
    const existing = this.peers.get(deviceId);
    if (existing) return existing;

    const iceServers = this.isLocalMode ? [] : [...STUN_ICE_SERVERS, ...TURN_ICE_SERVERS];

    const peer = new SimplePeer({
      initiator,
      stream: this.localStream,
      iceServers,
      onSignal: (data: any) => {
        if (data.type === 'offer' || data.type === 'answer') {
          this.signaling.send(data.type, { sdp: data.sdp, type: data.type }, deviceId)
            .catch((err) => console.error('[WebRTC] Signal send failed:', err));
        } else if (data.candidate) {
          this.signaling.send('ice-candidate', data.candidate, deviceId)
            .catch((err) => console.error('[WebRTC] Candidate send failed:', err));
        }
      },
      onStream: (remoteStream: MediaStream) => {
        console.log('[WebRTC] Remote stream received from', deviceId);
        this.remoteStreams.set(deviceId, remoteStream);
        const tracks = remoteStream.getAudioTracks().map((t) => `audio:${t.id}`);
        this.remoteTrackIds.set(deviceId, tracks);

        InCallManager.start({ media: 'audio', auto: false });
        InCallManager.setForceSpeakerphoneOn(true);
        InCallManager.setSpeakerphoneOn(true);
        console.log('[WebRTC] Remote audio active on loudspeaker for', deviceId);
      },
      onConnect: () => {
        console.log('[WebRTC] Peer connected successfully:', deviceId);
        InCallManager.start({ media: 'audio', auto: false });
        InCallManager.setForceSpeakerphoneOn(true);
        InCallManager.setSpeakerphoneOn(true);
      },
      onClose: () => {
        console.log('[WebRTC] Peer disconnected:', deviceId);
        this.closePeer(deviceId);
      },
      onError: (err) => {
        console.warn('[WebRTC] Peer error for', deviceId, err);
      },
    });

    this.peers.set(deviceId, peer);
    return peer;
  }

  async createOffer(toDeviceId: string): Promise<void> {
    if (this.peers.has(toDeviceId)) {
      console.log('[WebRTC] Peer already exists for', toDeviceId);
      return;
    }
    console.log('[WebRTC] Initiating P2P mesh connection to', toDeviceId);
    this.getOrCreatePeer(toDeviceId, true);
  }

  async handleOffer(fromDeviceId: string, offerPayload: any): Promise<void> {
    console.log('[WebRTC] Handling offer from', fromDeviceId);
    const peer = this.getOrCreatePeer(fromDeviceId, false);
    await peer.signal(offerPayload);
  }

  async handleAnswer(fromDeviceId: string, answerPayload: any): Promise<void> {
    console.log('[WebRTC] Handling answer from', fromDeviceId);
    const peer = this.peers.get(fromDeviceId);
    if (peer) {
      await peer.signal(answerPayload);
    }
  }

  async handleIceCandidate(fromDeviceId: string, candidatePayload: any): Promise<void> {
    const peer = this.peers.get(fromDeviceId) || this.getOrCreatePeer(fromDeviceId, false);
    await peer.signal({ candidate: candidatePayload });
  }

  startTransmitting(): void {
    this.setMuted(false);
    InCallManager.setForceSpeakerphoneOn(true);
    InCallManager.setSpeakerphoneOn(true);
    console.log('[WebRTC] Transmitting mic unmuted');
  }

  stopTransmitting(): void {
    this.setMuted(true);
    console.log('[WebRTC] Stopped transmitting mic muted');
  }

  private setMuted(muted: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  async closePeer(deviceId: string): Promise<void> {
    const peer = this.peers.get(deviceId);
    if (peer) {
      peer.destroy();
      this.peers.delete(deviceId);
    }
    this.remoteStreams.delete(deviceId);
    this.remoteTrackIds.delete(deviceId);
  }

  async cleanup(): Promise<void> {
    InCallManager.stop();
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.peers.forEach((peer) => peer.destroy());
    this.peers.clear();
    this.remoteStreams.clear();
    this.remoteTrackIds.clear();
    console.log('[WebRTC] Cleaned up all peers');
  }

  getConnectedPeerCount(): number {
    return Array.from(this.peers.values()).filter((p) => p.connectionState === 'connected').length;
  }

  hasPeer(deviceId: string): boolean {
    return this.peers.has(deviceId);
  }

  isConnectedTo(deviceId: string): boolean {
    const peer = this.peers.get(deviceId);
    return peer?.connectionState === 'connected';
  }

  getRemoteStreams(): Map<string, MediaStream> {
    return this.remoteStreams;
  }

  async getAudioDiagnostics(): Promise<any[]> { return this.getDiagnostics(); }

  async getDiagnostics(): Promise<{ deviceId: string; connection: string; ice: string; signaling: string; localMic: string; remoteAudio: string; inboundBytes: number; outboundBytes: number; candidatePair: string; candidateTypes: string; candidateCounts: string; candidateAddresses: string; failedPairs: number; iceError: string; iceSetup: string }[]> {
    const result = [];
    for (const [deviceId, peer] of this.peers) {
      let inboundBytes = 0;
      let outboundBytes = 0;
      let candidatePair = 'not selected';
      let candidateTypes = 'not available';
      const candidateAddresses = new Set<string>();
      const candidateCounts = { host: 0, srflx: 0, relay: 0, prflx: 0 };
      let failedPairs = 0;

      try {
        const stats: any = await peer.getStats();
        const reports = typeof stats?.forEach === 'function' ? Array.from(stats.values?.() ?? []) : Object.values(stats ?? {});
        const byId = new Map<string, any>();
        for (const item of reports as any[]) {
          if (item.id) byId.set(item.id, item);
          if (item.type === 'inbound-rtp' && (!item.kind || item.kind === 'audio')) inboundBytes += item.bytesReceived ?? 0;
          if (item.type === 'outbound-rtp' && (!item.kind || item.kind === 'audio')) outboundBytes += item.bytesSent ?? 0;
        }
        const foundTypes = new Set<string>();
        const selectedPairId = (reports as any[]).find((item) => item.type === 'transport')?.selectedCandidatePairId;
        for (const item of reports as any[]) {
          if (item.type === 'candidate-pair' && item.state === 'failed') failedPairs += 1;
          if ((item.type === 'local-candidate' || item.type === 'remote-candidate') && item.candidateType && item.candidateType in candidateCounts) {
            candidateCounts[item.candidateType as keyof typeof candidateCounts] += 1;
          }
          if ((item.type === 'local-candidate' || item.type === 'remote-candidate') && (item.address || item.ip)) {
            candidateAddresses.add(`${item.type === 'local-candidate' ? 'local' : 'remote'} ${item.address ?? item.ip}`);
          }
          if (item.type === 'candidate-pair' && (item.id === selectedPairId || item.selected || (item.nominated && item.state === 'succeeded'))) {
            const local = byId.get(item.localCandidateId);
            const remote = byId.get(item.remoteCandidateId);
            candidateTypes = `${local?.candidateType ?? 'unknown'} → ${remote?.candidateType ?? 'unknown'}`;
            candidatePair = `${item.state}; ${local?.protocol ?? '?'} → ${remote?.protocol ?? '?'}; ${item.bytesReceived ?? 0} received / ${item.bytesSent ?? 0} sent`;
          }
          if ((item.type === 'local-candidate' || item.type === 'remote-candidate') && item.candidateType) foundTypes.add(item.candidateType);
        }
        if (foundTypes.size > 0 && candidateTypes === 'not available') candidateTypes = Array.from(foundTypes).join(', ');
      } catch (err) {
        console.warn('[WebRTC] getStats failed for', deviceId, err);
      }

      const mic = this.localStream?.getAudioTracks().map((track) => `${track.readyState}${track.enabled ? ', enabled' : ', muted'}`).join('; ') || 'missing';
      const remoteAudio = this.remoteTrackIds.get(deviceId)?.join(', ') || 'no remote track';
      const iceSetup = this.isLocalMode
        ? `LAN host candidates${this.localNetworkAddress ? ` (${this.localNetworkAddress})` : ''}`
        : 'STUN Google + Twilio configured';
      const candidateSummary = Object.entries(candidateCounts).filter(([, count]) => count > 0).map(([type, count]) => `${type}:${count}`).join(' ') || 'none';

      result.push({
        deviceId,
        connection: peer.connectionState,
        ice: peer.iceConnectionState,
        signaling: peer.signalingState,
        localMic: mic,
        remoteAudio,
        inboundBytes,
        outboundBytes,
        candidatePair,
        candidateTypes,
        candidateCounts: candidateSummary,
        candidateAddresses: Array.from(candidateAddresses).join(', ') || 'none',
        failedPairs,
        iceError: 'none',
        iceSetup,
      });
    }
    return result;
  }
}

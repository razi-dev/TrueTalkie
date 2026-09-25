// src/services/LocalSignalingService.ts
// Handles 100% offline local Wi-Fi peer discovery and WebRTC signaling via UDP

import LocalMesh from '../../modules/local-mesh';
import { ISignalingService, SignalType, SignalMessage, OnSignalCallback } from './SignalingInterface';

const LOCAL_PORT = 8888;
const HEARTBEAT_INTERVAL = 2000;
const PEER_TIMEOUT = 7000;

interface PeerInfo {
  deviceId: string;
  name: string;
  ip: string;
  lastSeen: number;
}

export interface LocalSignalingCallbacks {
  onSignal: OnSignalCallback;
  onPeersChanged: (peers: { deviceId: string; name: string }[]) => void;
  onTransmittingChanged: (deviceId: string | null, name: string | null) => void;
  onNewPeer: (peerDeviceId: string) => void;
}

export class LocalSignalingService implements ISignalingService {
  private channelCode: string;
  private myDeviceId: string;
  private myName: string;
  private callbacks: LocalSignalingCallbacks;
  private peers: Map<string, PeerInfo> = new Map();
  private heartbeatTimer: any = null;
  private pruneTimer: any = null;
  private subscription: any = null;
  private myIp: string | null = null;

  constructor(
    channelCode: string,
    myDeviceId: string,
    myName: string,
    callbacks: LocalSignalingCallbacks
  ) {
    this.channelCode = channelCode.toUpperCase();
    this.myDeviceId = myDeviceId;
    this.myName = myName;
    this.callbacks = callbacks;
  }

  async subscribe(): Promise<void> {
    try {
      this.myIp = LocalMesh.getLocalIpAddress();
      console.log('[LocalSignaling] Starting UDP socket on port', LOCAL_PORT, 'My IP:', this.myIp);

      await LocalMesh.start(LOCAL_PORT);

      // Listen for UDP packets
      this.subscription = LocalMesh.addListener('onMessage', ({ message, senderIp }) => {
        this.handleIncomingPacket(message, senderIp);
      });

      // Broadcast initial presence immediately
      this.sendPresence();

      // Start periodic heartbeat
      this.heartbeatTimer = setInterval(() => {
        this.sendPresence();
      }, HEARTBEAT_INTERVAL);

      // Start peer timeout pruner
      this.pruneTimer = setInterval(() => {
        this.pruneStalePeers();
      }, 3000);
    } catch (err) {
      console.error('[LocalSignaling] Subscribe failed:', err);
      throw err;
    }
  }

  private handleIncomingPacket(rawMessage: string, senderIp: string): void {
    try {
      const data = JSON.parse(rawMessage);
      if (!data || data.channel !== this.channelCode) return;
      if (data.from_device === this.myDeviceId) return; // Ignore own packets

      switch (data.type) {
        case 'presence':
          this.handlePresence(data, senderIp);
          break;

        case 'offer':
        case 'answer':
        case 'ice-candidate':
          if (data.to_device && data.to_device !== this.myDeviceId) return;
          this.callbacks.onSignal({
            type: data.type as SignalType,
            payload: data.payload,
            from_device: data.from_device,
            to_device: data.to_device,
          });
          break;

        case 'ptt':
          if (data.transmitting) {
            this.callbacks.onTransmittingChanged(data.from_device, data.name);
          } else {
            this.callbacks.onTransmittingChanged(null, null);
          }
          break;

        case 'leave':
          if (this.peers.has(data.from_device)) {
            this.peers.delete(data.from_device);
            this.notifyPeersChanged();
          }
          break;
      }
    } catch (e) {
      // Ignore malformed packets
    }
  }

  private handlePresence(data: any, senderIp: string): void {
    const isNew = !this.peers.has(data.from_device);

    this.peers.set(data.from_device, {
      deviceId: data.from_device,
      name: data.name || 'Worker',
      ip: senderIp,
      lastSeen: Date.now(),
    });

    if (isNew) {
      console.log('[LocalSignaling] Discovered new peer:', data.name, '(', data.from_device, ') at', senderIp);
      this.notifyPeersChanged();

      // Send direct unicast response so the other device knows about us immediately
      this.sendDirectPresence(senderIp);

      // Deterministic tie-breaker: Device with higher string ID initiates WebRTC offer
      if (this.myDeviceId > data.from_device) {
        console.log('[LocalSignaling] Initiating WebRTC offer to', data.from_device);
        this.callbacks.onNewPeer(data.from_device);
      }
    }
  }

  private sendPresence(): void {
    const packet = JSON.stringify({
      type: 'presence',
      channel: this.channelCode,
      from_device: this.myDeviceId,
      name: this.myName,
    });
    LocalMesh.sendBroadcast(packet, LOCAL_PORT);
  }

  private sendDirectPresence(targetIp: string): void {
    const packet = JSON.stringify({
      type: 'presence',
      channel: this.channelCode,
      from_device: this.myDeviceId,
      name: this.myName,
    });
    LocalMesh.sendDirect(targetIp, LOCAL_PORT, packet);
  }

  async sendPttState(transmitting: boolean): Promise<void> {
    const packet = JSON.stringify({
      type: 'ptt',
      channel: this.channelCode,
      from_device: this.myDeviceId,
      name: this.myName,
      transmitting,
    });
    await LocalMesh.sendBroadcast(packet, LOCAL_PORT);
  }

  async send(type: SignalType, payload: any, toDevice?: string): Promise<void> {
    const packet = JSON.stringify({
      type,
      channel: this.channelCode,
      from_device: this.myDeviceId,
      to_device: toDevice,
      payload,
    });

    const targetPeer = toDevice ? this.peers.get(toDevice) : null;
    if (targetPeer && targetPeer.ip) {
      await LocalMesh.sendDirect(targetPeer.ip, LOCAL_PORT, packet);
    } else {
      await LocalMesh.sendBroadcast(packet, LOCAL_PORT);
    }
  }

  private pruneStalePeers(): void {
    const now = Date.now();
    let changed = false;

    this.peers.forEach((peer, deviceId) => {
      if (now - peer.lastSeen > PEER_TIMEOUT) {
        console.log('[LocalSignaling] Peer timed out:', peer.name, '(', deviceId, ')');
        this.peers.delete(deviceId);
        changed = true;
      }
    });

    if (changed) {
      this.notifyPeersChanged();
    }
  }

  private notifyPeersChanged(): void {
    const list = Array.from(this.peers.values()).map((p) => ({
      deviceId: p.deviceId,
      name: p.name,
    }));
    this.callbacks.onPeersChanged(list);
  }

  getLocalIp(): string | null {
    return this.myIp || LocalMesh.getLocalIpAddress();
  }

  async unsubscribe(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);

    // Announce departure
    try {
      const packet = JSON.stringify({
        type: 'leave',
        channel: this.channelCode,
        from_device: this.myDeviceId,
      });
      await LocalMesh.sendBroadcast(packet, LOCAL_PORT);
    } catch (e) {}

    this.subscription?.remove?.();
    await LocalMesh.stop();
    this.peers.clear();
    console.log('[LocalSignaling] Stopped');
  }
}

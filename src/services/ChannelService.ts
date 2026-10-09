// src/services/ChannelService.ts

import { Platform, PermissionsAndroid } from 'react-native';
import { supabase } from '../lib/supabase';
import { WebRTCService } from './WebRTCService';
import { SignalingService } from './SignalingService';
import { LocalSignalingService } from './LocalSignalingService';
import { ISignalingService, SignalMessage } from './SignalingInterface';
import LocalMesh from '../../modules/local-mesh';

export interface JoinOptions {
  channelCode: string;
  myDeviceId: string;
  myName: string;
  mode?: 'internet' | 'local';
  onPeersChanged: (peers: { deviceId: string; name: string }[]) => void;
  onTransmittingChanged: (deviceId: string | null, name: string | null) => void;
  onStatusChanged: (status: 'connecting' | 'connected' | 'disconnected') => void;
  onLocalIpResolved?: (ip: string | null) => void;
}

export class ChannelService {
  private webrtc: WebRTCService | null = null;
  private signaling: ISignalingService | null = null;
  private presenceChannel: any = null;
  private channelId: string | null = null;
  private opts: JoinOptions | null = null;
  private mode: 'internet' | 'local' = 'internet';
  private localAudioSub: any = null;

  async join(opts: JoinOptions): Promise<string> {
    this.opts = opts;
    this.mode = opts.mode || 'internet';
    opts.onStatusChanged('connecting');

    if (this.mode === 'local') {
      return await this.joinLocalMesh(opts);
    }
    return await this.joinInternetWebRTC(opts);
  }

  private async joinLocalMesh(opts: JoinOptions): Promise<string> {
    // 1. Ensure runtime Android microphone permission
    if (Platform.OS === 'android') {
      try {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone Permission',
            message: 'True Talkie requires microphone access for offline walkie-talkie audio.',
            buttonPositive: 'Allow',
          }
        );
      } catch (e) {
        console.warn('[ChannelService] Mic permission request error:', e);
      }
    }

    // 2. Start UDP Local Signaling on port 8888 for peer discovery
    const localSignaling = new LocalSignalingService(
      opts.channelCode,
      opts.myDeviceId,
      opts.myName,
      {
        onSignal: (msg) => this.handleSignal(msg),
        onPeersChanged: opts.onPeersChanged,
        onTransmittingChanged: opts.onTransmittingChanged,
        onNewPeer: (_peerDeviceId) => {
          // Native UDP multicast/broadcast audio does not require 1-to-1 WebRTC negotiation
        },
      }
    );

    this.signaling = localSignaling;
    await localSignaling.subscribe();

    // 3. Start native high-performance UDP Audio Receiver on port 8889
    try {
      if (typeof (LocalMesh as any).startAudioReceiver === 'function') {
        await (LocalMesh as any).startAudioReceiver(opts.channelCode, 8889);
        console.log('[ChannelService] Local UDP Audio Receiver running on port 8889 for', opts.channelCode);
      } else {
        console.warn('[ChannelService] LocalMesh.startAudioReceiver not available');
      }
    } catch (e) {
      console.warn('[ChannelService] Error starting UDP audio receiver:', e);
    }

    // 4. Listen to native audio state changes
    try {
      if (typeof (LocalMesh as any).addListener === 'function') {
        this.localAudioSub = (LocalMesh as any).addListener('onAudioStateChanged', (event: any) => {
          if (event.state === 'receiving' && event.senderIp) {
            // Audio actively coming in over UDP
          }
        });
      }
    } catch (e) {}

    const localIp = localSignaling.getLocalIp();
    opts.onLocalIpResolved?.(localIp);
    opts.onStatusChanged('connected');

    const localChannelId = `local_${opts.channelCode}`;
    this.channelId = localChannelId;
    return localChannelId;
  }

  private async joinInternetWebRTC(opts: JoinOptions): Promise<string> {
    const channelId = await this.findOrCreateChannel(opts.channelCode);
    this.channelId = channelId;

    const supabaseSignaling = new SignalingService(
      channelId,
      opts.myDeviceId,
      (msg) => this.handleSignal(msg)
    );
    this.signaling = supabaseSignaling;
    await supabaseSignaling.subscribe();

    this.webrtc = new WebRTCService(supabaseSignaling, opts.myDeviceId, false);
    await this.webrtc.initLocalStream();

    await this.joinSupabasePresence(channelId, opts);

    opts.onStatusChanged('connected');
    return channelId;
  }

  // PTT pressed
  startTransmitting(): void {
    if (this.mode === 'local') {
      try {
        const peerIps = (this.signaling as LocalSignalingService)?.getPeerIps?.() || [];
        if (typeof (LocalMesh as any).startTransmittingAudio === 'function') {
          (LocalMesh as any).startTransmittingAudio(
            this.opts?.channelCode || '',
            8889,
            this.opts?.myDeviceId || '',
            peerIps
          );
          console.log('[ChannelService] Local UDP transmission started. Targets:', peerIps);
        } else {
          console.warn('[ChannelService] LocalMesh.startTransmittingAudio not available');
        }
      } catch (e) {
        console.error('[ChannelService] Error transmitting local audio:', e);
      }
      (this.signaling as LocalSignalingService)?.sendPttState(true);
    } else {
      this.webrtc?.startTransmitting();
      this.presenceChannel?.track({
        deviceId: this.opts?.myDeviceId,
        name: this.opts?.myName,
        transmitting: true,
      });
    }
  }

  // PTT released
  stopTransmitting(): void {
    if (this.mode === 'local') {
      try {
        if (typeof (LocalMesh as any).stopTransmittingAudio === 'function') {
          (LocalMesh as any).stopTransmittingAudio();
          console.log('[ChannelService] Local UDP transmission stopped');
        }
      } catch (e) {
        console.error('[ChannelService] Error stopping local audio:', e);
      }
      (this.signaling as LocalSignalingService)?.sendPttState(false);
    } else {
      this.webrtc?.stopTransmitting();
      this.presenceChannel?.track({
        deviceId: this.opts?.myDeviceId,
        name: this.opts?.myName,
        transmitting: false,
      });
    }
  }

  async leave(): Promise<void> {
    if (this.mode === 'local') {
      try {
        if (typeof (LocalMesh as any).stopAudioReceiver === 'function') {
          await (LocalMesh as any).stopAudioReceiver();
        }
        if (typeof (LocalMesh as any).stopTransmittingAudio === 'function') {
          await (LocalMesh as any).stopTransmittingAudio();
        }
        this.localAudioSub?.remove?.();
        this.localAudioSub = null;
      } catch (e) {
        console.warn('[ChannelService] Error cleaning up local audio:', e);
      }
    }

    await this.signaling?.unsubscribe();
    this.signaling = null;

    await this.webrtc?.cleanup();
    this.webrtc = null;

    if (this.presenceChannel) {
      await supabase.removeChannel(this.presenceChannel);
      this.presenceChannel = null;
    }

    this.channelId = null;
    this.opts = null;
    console.log('[ChannelService] Left channel');
  }

  // HUD Audio Diagnostics for Tactical Screen
  async getAudioDiagnostics(): Promise<any[]> {
    if (this.mode === 'local') {
      const peerIps = (this.signaling as LocalSignalingService)?.getPeerIps?.() || [];
      return [{
        deviceId: this.opts?.myDeviceId || 'local',
        connection: 'Direct UDP LAN Mesh',
        ice: 'Port 8889 (Loudspeaker)',
        signaling: 'UDP 8888',
        localMic: '16kHz AudioRecord (PCM16)',
        remoteAudio: 'AudioTrack LOUDSPEAKER (USAGE_MEDIA)',
        inboundBytes: 0,
        outboundBytes: 0,
        candidatePair: 'Unicast Direct + Broadcast',
        candidateTypes: 'UDP Direct',
        candidateCounts: `${peerIps.length} active peers`,
        candidateAddresses: peerIps.join(', ') || '10.91.110.255',
        failedPairs: 0,
        iceError: 'None',
        iceSetup: 'Native Kotlin'
      }];
    }
    if (this.webrtc && typeof (this.webrtc as any).getAudioDiagnostics === 'function') {
      return await (this.webrtc as any).getAudioDiagnostics();
    }
    return [];
  }

  private async findOrCreateChannel(code: string): Promise<string> {
    let { data } = await supabase
      .from('channels')
      .select('id')
      .eq('code', code.toUpperCase())
      .single();

    if (data) return data.id;

    const { data: created, error: createError } = await supabase
      .from('channels')
      .insert({ code: code.toUpperCase() })
      .select('id')
      .single();

    if (createError) throw createError;
    return created.id;
  }

  private async joinSupabasePresence(channelId: string, opts: JoinOptions): Promise<void> {
    this.presenceChannel = supabase.channel(`presence_${channelId}`, {
      config: { presence: { key: opts.myDeviceId } },
    });

    this.presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = this.presenceChannel.presenceState();
        const peerList: { deviceId: string; name: string }[] = [];
        let transmittingUser: { deviceId: string; name: string } | null = null;

        for (const [key, presences] of Object.entries(state) as [string, any[]][]) {
          if (key === opts.myDeviceId) continue;
          for (const p of presences) {
            peerList.push({ deviceId: p.deviceId, name: p.name });
            if (p.transmitting) {
              transmittingUser = { deviceId: p.deviceId, name: p.name };
            }
          }
        }

        opts.onPeersChanged(peerList);
        opts.onTransmittingChanged(
          transmittingUser?.deviceId || null,
          transmittingUser?.name || null
        );
      })
      .on('presence', { event: 'join' }, ({ newPresences }: any) => {
        for (const p of newPresences) {
          if (p.deviceId === opts.myDeviceId) continue;
          this.webrtc?.createOffer(p.deviceId);
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
        for (const p of leftPresences) {
          this.webrtc?.closePeer(p.deviceId);
        }
      });

    await this.presenceChannel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await this.presenceChannel.track({
          deviceId: opts.myDeviceId,
          name: opts.myName,
          transmitting: false,
        });
      }
    });
  }

  private handleSignal(msg: SignalMessage): void {
    if (this.mode === 'internet' && this.webrtc) {
      if (msg.type === 'offer') {
        this.webrtc.handleOffer(msg.from_device, msg.payload);
      } else if (msg.type === 'answer') {
        this.webrtc.handleAnswer(msg.from_device, msg.payload);
      } else if (msg.type === 'ice-candidate') {
        this.webrtc.handleIceCandidate(msg.from_device, msg.payload);
      }
    }
  }
}

export const channelService = new ChannelService();

// src/services/ChannelService.ts
// Orchestrates: join channel, manage presence, handle signaling, WebRTC across both Local Wi-Fi Mesh and Internet modes

import { supabase } from '../lib/supabase';
import { SignalingService } from './SignalingService';
import { LocalSignalingService } from './LocalSignalingService';
import { ISignalingService, SignalMessage } from './SignalingInterface';
import { WebRTCService } from './WebRTCService';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface JoinOptions {
  channelCode: string;
  myDeviceId: string;
  myName: string;
  mode: 'local' | 'internet';
  onPeersChanged: (peers: { deviceId: string; name: string }[]) => void;
  onTransmittingChanged: (deviceId: string | null, name: string | null) => void;
  onStatusChanged: (status: 'connecting' | 'connected' | 'error') => void;
  onLocalIpResolved?: (ip: string | null) => void;
}

export class ChannelService {
  private signaling: ISignalingService | null = null;
  private webrtc: WebRTCService | null = null;
  private presenceChannel: RealtimeChannel | null = null;
  private channelId: string | null = null;
  private opts: JoinOptions | null = null;
  private mode: 'local' | 'internet' = 'local';

  async join(opts: JoinOptions): Promise<string> {
    this.opts = opts;
    this.mode = opts.mode;
    opts.onStatusChanged('connecting');

    if (opts.mode === 'local') {
      return this.joinLocalMesh(opts);
    } else {
      return this.joinInternetSupabase(opts);
    }
  }

  // 📶 Phase 2: 100% Offline Local Wi-Fi Mesh (Zero Internet)
  private async joinLocalMesh(opts: JoinOptions): Promise<string> {
    const localSignaling = new LocalSignalingService(
      opts.channelCode,
      opts.myDeviceId,
      opts.myName,
      {
        onSignal: (msg) => this.handleSignal(msg),
        onPeersChanged: opts.onPeersChanged,
        onTransmittingChanged: opts.onTransmittingChanged,
        onNewPeer: (peerDeviceId) => {
          this.webrtc?.createOffer(peerDeviceId);
        },
      }
    );

    this.signaling = localSignaling;
    await localSignaling.subscribe();

    this.webrtc = new WebRTCService(localSignaling, opts.myDeviceId, true);
    await this.webrtc.initLocalStream();

    const localIp = localSignaling.getLocalIp();
    opts.onLocalIpResolved?.(localIp);
    opts.onStatusChanged('connected');

    const localChannelId = `local_${opts.channelCode}`;
    this.channelId = localChannelId;
    return localChannelId;
  }

  // 🌐 Phase 1: Internet via Supabase Cloud
  private async joinInternetSupabase(opts: JoinOptions): Promise<string> {
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
    this.webrtc?.startTransmitting();

    if (this.mode === 'local') {
      (this.signaling as LocalSignalingService)?.sendPttState(true);
    } else {
      this.presenceChannel?.track({
        deviceId: this.opts?.myDeviceId,
        name: this.opts?.myName,
        transmitting: true,
      });
    }
  }

  // PTT released
  stopTransmitting(): void {
    this.webrtc?.stopTransmitting();

    if (this.mode === 'local') {
      (this.signaling as LocalSignalingService)?.sendPttState(false);
    } else {
      this.presenceChannel?.track({
        deviceId: this.opts?.myDeviceId,
        name: this.opts?.myName,
        transmitting: false,
      });
    }
  }

  async leave(): Promise<void> {
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

    if (createError || !created) throw new Error('Failed to create channel: ' + createError?.message);
    return created.id;
  }

  private async joinSupabasePresence(channelId: string, opts: JoinOptions): Promise<void> {
    this.presenceChannel = supabase.channel(`presence:${channelId}`, {
      config: { presence: { key: opts.myDeviceId } },
    });

    this.presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = this.presenceChannel!.presenceState<{
          deviceId: string;
          name: string;
          transmitting?: boolean;
        }>();

        const peers: { deviceId: string; name: string }[] = [];
        let transmittingId: string | null = null;
        let transmittingName: string | null = null;

        Object.values(state).forEach((presences) => {
          presences.forEach((p) => {
            if (p.deviceId === opts.myDeviceId) return;
            peers.push({ deviceId: p.deviceId, name: p.name });
            if (p.transmitting) {
              transmittingId = p.deviceId;
              transmittingName = p.name;
            }
          });
        });

        opts.onPeersChanged(peers);
        opts.onTransmittingChanged(transmittingId, transmittingName);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[Presence] Joined:', key);
        newPresences.forEach((p: any) => {
          if (p.deviceId && p.deviceId !== opts.myDeviceId) {
            this.webrtc?.createOffer(p.deviceId);
          }
        });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        console.log('[Presence] Left:', key);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.presenceChannel!.track({
            deviceId: opts.myDeviceId,
            name: opts.myName,
            transmitting: false,
          });
        }
      });
  }

  private async handleSignal(msg: SignalMessage): Promise<void> {
    if (!this.webrtc) return;

    switch (msg.type) {
      case 'offer':
        await this.webrtc.handleOffer(msg.from_device, msg.payload);
        break;
      case 'answer':
        await this.webrtc.handleAnswer(msg.from_device, msg.payload);
        break;
      case 'ice-candidate':
        await this.webrtc.handleIceCandidate(msg.from_device, msg.payload);
        break;
    }
  }
}

export const channelService = new ChannelService();

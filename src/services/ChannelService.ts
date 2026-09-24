// src/services/ChannelService.ts
// Orchestrates: join channel, manage presence, handle signaling, WebRTC

import { supabase } from '../lib/supabase';
import { SignalingService } from './SignalingService';
import { WebRTCService } from './WebRTCService';
import { RealtimeChannel } from '@supabase/supabase-js';

export interface JoinOptions {
  channelCode: string;
  myDeviceId: string;
  myName: string;
  onPeersChanged: (peers: { deviceId: string; name: string }[]) => void;
  onTransmittingChanged: (deviceId: string | null, name: string | null) => void;
  onStatusChanged: (status: 'connecting' | 'connected' | 'error') => void;
}

export class ChannelService {
  private signaling: SignalingService | null = null;
  private webrtc: WebRTCService | null = null;
  private presenceChannel: RealtimeChannel | null = null;
  private channelId: string | null = null;
  private opts: JoinOptions | null = null;

  async join(opts: JoinOptions): Promise<string> {
    this.opts = opts;
    opts.onStatusChanged('connecting');

    // 1. Find or create channel in Supabase
    const channelId = await this.findOrCreateChannel(opts.channelCode);
    this.channelId = channelId;

    // 2. Start signaling
    this.signaling = new SignalingService(
      channelId,
      opts.myDeviceId,
      (msg) => this.handleSignal(msg)
    );
    await this.signaling.subscribe();

    // 3. Init WebRTC (get mic access)
    this.webrtc = new WebRTCService(this.signaling, opts.myDeviceId);
    await this.webrtc.initLocalStream();

    // 4. Join presence channel (who's in the room)
    await this.joinPresence(channelId, opts);

    opts.onStatusChanged('connected');
    return channelId;
  }

  // PTT pressed
  startTransmitting(): void {
    this.webrtc?.startTransmitting();
    // Broadcast PTT state via presence
    this.presenceChannel?.track({
      deviceId: this.opts?.myDeviceId,
      name: this.opts?.myName,
      transmitting: true,
    });
  }

  // PTT released
  stopTransmitting(): void {
    this.webrtc?.stopTransmitting();
    this.presenceChannel?.track({
      deviceId: this.opts?.myDeviceId,
      name: this.opts?.myName,
      transmitting: false,
    });
  }

  async leave(): Promise<void> {
    await this.signaling?.unsubscribe();
    await this.webrtc?.cleanup();
    if (this.presenceChannel) {
      await supabase.removeChannel(this.presenceChannel);
      this.presenceChannel = null;
    }
    this.channelId = null;
    this.opts = null;
    console.log('[ChannelService] Left channel');
  }

  // ─── Private helpers ──────────────────────────────────────

  private async findOrCreateChannel(code: string): Promise<string> {
    // Try to find existing channel
    let { data, error } = await supabase
      .from('channels')
      .select('id')
      .eq('code', code.toUpperCase())
      .single();

    if (data) return data.id;

    // Create new channel
    const { data: created, error: createError } = await supabase
      .from('channels')
      .insert({ code: code.toUpperCase() })
      .select('id')
      .single();

    if (createError || !created) throw new Error('Failed to create channel: ' + createError?.message);
    return created.id;
  }

  private async joinPresence(channelId: string, opts: JoinOptions): Promise<void> {
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
            if (p.deviceId === opts.myDeviceId) return; // Skip self
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
        // New peer arrived → send them a WebRTC offer
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

  private async handleSignal(msg: {
    type: 'offer' | 'answer' | 'ice-candidate';
    payload: any;
    from_device: string;
  }): Promise<void> {
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

// Singleton
export const channelService = new ChannelService();

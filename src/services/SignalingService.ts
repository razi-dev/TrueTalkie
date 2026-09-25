// src/services/SignalingService.ts
// Handles WebRTC signaling via Supabase Realtime (Phase 1)

import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ISignalingService, SignalType, SignalMessage, OnSignalCallback } from './SignalingInterface';

export class SignalingService implements ISignalingService {
  private channel: RealtimeChannel | null = null;
  private channelId: string;
  private myDeviceId: string;
  private onSignal: OnSignalCallback;

  constructor(channelId: string, myDeviceId: string, onSignal: OnSignalCallback) {
    this.channelId = channelId;
    this.myDeviceId = myDeviceId;
    this.onSignal = onSignal;
  }

  // Subscribe to incoming signals for this device
  async subscribe(): Promise<void> {
    this.channel = supabase
      .channel(`signaling:${this.channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signaling',
          filter: `channel_id=eq.${this.channelId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row.from_device === this.myDeviceId) return;
          if (row.to_device && row.to_device !== this.myDeviceId) return;

          this.onSignal({
            type: row.type as SignalType,
            payload: row.payload,
            from_device: row.from_device,
            to_device: row.to_device,
          });
        }
      )
      .subscribe();
  }

  // Send a signal to a specific peer (or broadcast if no toDevice)
  async send(type: SignalType, payload: any, toDevice?: string): Promise<void> {
    const { error } = await supabase.from('signaling').insert({
      channel_id: this.channelId,
      from_device: this.myDeviceId,
      to_device: toDevice ?? null,
      type,
      payload,
    });

    if (error) {
      console.error('[SignalingService] Send error:', error.message);
    }
  }

  // Unsubscribe when leaving channel
  async unsubscribe(): Promise<void> {
    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }
}

// src/services/SignalingService.ts
// Handles WebRTC signaling via Supabase Realtime Broadcast (Phase 1)

import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';
import { ISignalingService, SignalType, OnSignalCallback } from './SignalingInterface';

export class SignalingService implements ISignalingService {
  private channel: RealtimeChannel | null = null;
  private channelId: string;
  private myDeviceId: string;
  private onSignal: OnSignalCallback;
  private subscribed = false;

  constructor(channelId: string, myDeviceId: string, onSignal: OnSignalCallback) {
    this.channelId = channelId;
    this.myDeviceId = myDeviceId;
    this.onSignal = onSignal;
  }

  async subscribe(): Promise<void> {
    this.channel = supabase.channel('signaling:' + this.channelId);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('Timed out connecting to Internet audio signaling.')); }
      }, 15000);
      this.channel!
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        if (!payload) return;
        if (payload.from_device === this.myDeviceId) return;
        if (payload.to_device && payload.to_device !== this.myDeviceId) return;

        console.log('[SignalingService] Signal received:', payload.type, 'from', payload.from_device);

        this.onSignal({
          type: payload.type as SignalType,
          payload: payload.payload,
          from_device: payload.from_device,
          to_device: payload.to_device,
        });
      })
      .subscribe((status, err) => {
        console.log('[SignalingService] Channel status:', status);
        if (status === 'SUBSCRIBED') {
          this.subscribed = true;
          if (!settled) { settled = true; clearTimeout(timer); resolve(); }
        } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && !settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`Internet audio signaling ${status.toLowerCase()}${err?.message ? `: ${err.message}` : ''}`));
        }
      });
    });
  }

  async send(type: SignalType, payload: any, toDevice?: string): Promise<void> {
    if (!this.channel || !this.subscribed) {
      console.warn('[SignalingService] Dropped signal before channel subscribed:', type);
      return;
    }

    try {
      await this.channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: {
          from_device: this.myDeviceId,
          to_device: toDevice ?? null,
          type,
          payload,
        },
      });
      console.log('[SignalingService] Signal sent:', type, 'to', toDevice || 'all');
    } catch (err) {
      console.error('[SignalingService] Broadcast error:', err);
    }
  }

  async unsubscribe(): Promise<void> {
    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
      this.subscribed = false;
    }
  }
}

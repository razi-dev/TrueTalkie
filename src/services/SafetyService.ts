// src/services/SafetyService.ts
// Handles user safety, device-based blocklists, abuse reports, and Terms of Service EULA agreements.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const STORAGE_KEY_BLOCKED = 'truetalkie_blocked_peers_v1';
const STORAGE_KEY_TERMS = 'truetalkie_terms_accepted_v1';
export const CURRENT_TERMS_VERSION = '1.0.0';

export interface ReportPayload {
  reportedDeviceId: string;
  reportedName?: string;
  channelId: string;
  reason: string;
  description?: string;
  reporterDeviceId: string;
}

export type BlockListener = (blockedIds: string[]) => void;

class SafetyService {
  private blockedSet: Set<string> = new Set();
  private listeners: Set<BlockListener> = new Set();
  private initialized = false;
  private recentReports: Set<string> = new Set();

  constructor() {
    this.init();
  }

  // Load blocked peer IDs from persistent device storage
  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_BLOCKED);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.blockedSet = new Set(parsed);
        }
      }
      this.initialized = true;
      this.notifyListeners();
    } catch (e) {
      console.warn('[SafetyService] Error loading blocked peers:', e);
      this.initialized = true;
    }
  }

  // Check if a specific peer ID is currently blocked
  isPeerBlocked(deviceId: string): boolean {
    if (!deviceId) return false;
    return this.blockedSet.has(deviceId);
  }

  // Retrieve array of all currently blocked peer IDs
  getBlockedPeers(): string[] {
    return Array.from(this.blockedSet);
  }

  // Block a peer permanently across app restarts
  async blockPeer(deviceId: string, name?: string): Promise<void> {
    if (!deviceId) return;
    await this.init();
    this.blockedSet.add(deviceId);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_BLOCKED,
        JSON.stringify(Array.from(this.blockedSet))
      );
      console.log(`[SafetyService] Blocked peer ${deviceId} (${name || 'Anonymous'})`);
    } catch (e) {
      console.error('[SafetyService] Failed to persist block:', e);
    }
    this.notifyListeners();
  }

  // Unblock a previously blocked peer
  async unblockPeer(deviceId: string): Promise<void> {
    if (!deviceId) return;
    await this.init();
    this.blockedSet.delete(deviceId);
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY_BLOCKED,
        JSON.stringify(Array.from(this.blockedSet))
      );
      console.log(`[SafetyService] Unblocked peer ${deviceId}`);
    } catch (e) {
      console.error('[SafetyService] Failed to persist unblock:', e);
    }
    this.notifyListeners();
  }

  // Register listener for real-time audio muting updates
  addBlockedListener(listener: BlockListener): () => void {
    this.listeners.add(listener);
    listener(this.getBlockedPeers());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const list = this.getBlockedPeers();
    this.listeners.forEach((fn) => {
      try {
        fn(list);
      } catch (err) {
        console.warn('[SafetyService] Error in block listener:', err);
      }
    });
  }

  // Terms of Use & Community Guidelines Verification
  async hasAcceptedTerms(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_TERMS);
      if (!raw) return false;
      const data = JSON.parse(raw);
      return data?.accepted === true && data?.version === CURRENT_TERMS_VERSION;
    } catch (e) {
      return false;
    }
  }

  async acceptTerms(deviceId: string): Promise<void> {
    try {
      const record = {
        accepted: true,
        version: CURRENT_TERMS_VERSION,
        timestamp: new Date().toISOString(),
        deviceId,
      };
      await AsyncStorage.setItem(STORAGE_KEY_TERMS, JSON.stringify(record));
      console.log('[SafetyService] Terms accepted for device:', deviceId);
    } catch (e) {
      console.error('[SafetyService] Failed to save terms agreement:', e);
    }
  }

  // Submit Abuse Report to Supabase
  async submitReport(payload: ReportPayload): Promise<{ success: boolean; error?: string }> {
    if (!payload.reportedDeviceId) {
      return { success: false, error: 'Invalid participant.' };
    }
    if (payload.reportedDeviceId === payload.reporterDeviceId) {
      return { success: false, error: 'You cannot report yourself.' };
    }
    if (!payload.reason || payload.reason.trim().length === 0) {
      return { success: false, error: 'Please select a reason for reporting.' };
    }

    // Rate-limiting check: prevent spamming duplicate reports in 60s
    const reportKey = `${payload.reporterDeviceId}:${payload.reportedDeviceId}:${payload.reason}`;
    if (this.recentReports.has(reportKey)) {
      // Auto-block and return success to user gracefully
      await this.blockPeer(payload.reportedDeviceId, payload.reportedName);
      return { success: true };
    }

    try {
      const { error } = await supabase.from('user_reports').insert({
        reporter_device_id: payload.reporterDeviceId,
        reported_device_id: payload.reportedDeviceId,
        reported_name: payload.reportedName || null,
        channel_id: payload.channelId || 'general',
        reason: payload.reason.trim(),
        description: payload.description?.trim() || null,
        status: 'pending',
      });

      if (error) {
        console.warn('[SafetyService] Supabase report insert warning:', error.message);
        // Even if database has network issue, ALWAYS block locally to safeguard the user immediately
        await this.blockPeer(payload.reportedDeviceId, payload.reportedName);
        return { success: true };
      }

      this.recentReports.add(reportKey);
      setTimeout(() => this.recentReports.delete(reportKey), 60000);

      // Auto-block the reported abuser on this device
      await this.blockPeer(payload.reportedDeviceId, payload.reportedName);
      return { success: true };
    } catch (e: any) {
      console.error('[SafetyService] Report submission exception:', e);
      // Failsafe: block locally anyway
      await this.blockPeer(payload.reportedDeviceId, payload.reportedName);
      return { success: true };
    }
  }
}

export const safetyService = new SafetyService();

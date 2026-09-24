// src/screens/ChannelScreen.tsx
// Active PTT channel screen — the main walkie-talkie UI

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Vibration,
  StatusBar,
  Animated,
  ScrollView,
} from 'react-native';
import { useChannelStore } from '../store/channelStore';
import { channelService } from '../services/ChannelService';
import { stopForegroundService, updateForegroundService } from '../services/ForegroundService';

interface Props {
  onLeft: () => void;
}

export default function ChannelScreen({ onLeft }: Props) {
  const {
    myName,
    channelCode,
    peers,
    status,
    isTransmitting,
    setTransmitting,
    transmittingPeer,
  } = useChannelStore();

  // Pulse animation for PTT button
  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Glow animation when receiving
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Start pulse when transmitting
  useEffect(() => {
    if (isTransmitting) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    }
  }, [isTransmitting]);

  // Glow when someone else is talking
  useEffect(() => {
    if (transmittingPeer) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.4, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      glowAnim.stopAnimation();
      Animated.timing(glowAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [transmittingPeer]);

  const handlePTTPress = useCallback(() => {
    setTransmitting(true);
    channelService.startTransmitting();
    updateForegroundService(channelCode, true);
    Vibration.vibrate(30); // Short haptic on press
  }, [channelCode]);

  const handlePTTRelease = useCallback(() => {
    setTransmitting(false);
    channelService.stopTransmitting();
    updateForegroundService(channelCode, false);
    Vibration.vibrate(20);
  }, [channelCode]);

  const handleLeave = async () => {
    await channelService.leave();
    await stopForegroundService();
    onLeft();
  };

  const statusColor = {
    connected: '#00e676',
    connecting: '#FFD600',
    disconnected: '#666',
    error: '#ff4444',
  }[status];

  const statusLabel = {
    connected: 'CONNECTED',
    connecting: 'CONNECTING...',
    disconnected: 'DISCONNECTED',
    error: 'ERROR',
  }[status];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.channelLabel}>CHANNEL</Text>
          <Text style={styles.channelCode}>{channelCode}</Text>
        </View>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Receiving indicator */}
      {transmittingPeer && !isTransmitting ? (
        <Animated.View style={[styles.receivingBanner, { opacity: glowAnim.interpolate({
          inputRange: [0, 1], outputRange: [0.7, 1]
        })}]}>
          <Text style={styles.receivingEmoji}>🔊</Text>
          <Text style={styles.receivingText}>{transmittingPeer.toUpperCase()} IS SPEAKING</Text>
        </Animated.View>
      ) : (
        <View style={styles.receivingPlaceholder} />
      )}

      {/* Peers list */}
      <View style={styles.peersSection}>
        <Text style={styles.peersLabel}>ON THIS CHANNEL</Text>
        <ScrollView style={styles.peersList}>
          {/* Self */}
          <View style={styles.peerRow}>
            <View style={[styles.peerDot, { backgroundColor: '#00e676' }]} />
            <Text style={styles.peerName}>{myName} (you)</Text>
            {isTransmitting && <Text style={styles.peerTx}>🎙️</Text>}
          </View>
          {/* Others */}
          {peers.length === 0 ? (
            <Text style={styles.noPeers}>Waiting for others to join...</Text>
          ) : (
            peers.map((peer) => (
              <View key={peer.deviceId} style={styles.peerRow}>
                <View style={[styles.peerDot, { backgroundColor: '#00e676' }]} />
                <Text style={styles.peerName}>{peer.name}</Text>
                {peer.isTransmitting && <Text style={styles.peerTx}>🎙️</Text>}
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* PTT Button */}
      <View style={styles.pttArea}>
        {isTransmitting && (
          <Text style={styles.transmittingLabel}>🎙️ TRANSMITTING</Text>
        )}

        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[styles.pttBtn, isTransmitting && styles.pttBtnActive]}
            onPressIn={handlePTTPress}
            onPressOut={handlePTTRelease}
            activeOpacity={1}
            delayPressIn={0}
          >
            <Text style={styles.pttIcon}>{isTransmitting ? '🎙️' : '📢'}</Text>
            <Text style={styles.pttLabel}>
              {isTransmitting ? 'TALKING' : 'HOLD TO TALK'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.pttHint}>Hold the button to speak. Release to listen.</Text>
      </View>

      {/* Leave button */}
      <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
        <Text style={styles.leaveBtnText}>✕  LEAVE CHANNEL</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  channelLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
  },
  channelCode: {
    color: '#FFD600',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  receivingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#001a00',
    borderWidth: 1,
    borderColor: '#00e676',
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 10,
  },
  receivingPlaceholder: {
    height: 58,
    marginTop: 16,
  },
  receivingEmoji: {
    fontSize: 20,
  },
  receivingText: {
    color: '#00e676',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
  peersSection: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  peersLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 12,
  },
  peersList: {
    flex: 1,
  },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#151515',
  },
  peerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  peerName: {
    color: '#ddd',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  peerTx: {
    fontSize: 16,
  },
  noPeers: {
    color: '#444',
    fontSize: 13,
    paddingTop: 8,
    fontStyle: 'italic',
  },
  pttArea: {
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 16,
  },
  transmittingLabel: {
    color: '#ff4444',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 12,
  },
  pttBtn: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#1a1a1a',
    borderWidth: 4,
    borderColor: '#FFD600',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // Shadow
    shadowColor: '#FFD600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  pttBtnActive: {
    backgroundColor: '#1a0000',
    borderColor: '#ff4444',
    shadowColor: '#ff4444',
    shadowOpacity: 0.6,
    elevation: 20,
  },
  pttIcon: {
    fontSize: 48,
  },
  pttLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  pttHint: {
    color: '#333',
    fontSize: 11,
    marginTop: 16,
  },
  leaveBtn: {
    marginHorizontal: 24,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
  },
  leaveBtnText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
});

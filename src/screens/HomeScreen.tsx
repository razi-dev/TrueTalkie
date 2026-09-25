// src/screens/HomeScreen.tsx
// Channel entry screen — enter name + frequency + mode, join channel

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { useChannelStore, NetworkMode } from '../store/channelStore';
import { channelService } from '../services/ChannelService';
import { startForegroundService } from '../services/ForegroundService';

interface Props {
  onJoined: () => void;
}

export default function HomeScreen({ onJoined }: Props) {
  const {
    myName,
    setMyName,
    myDeviceId,
    mode,
    setMode,
    setLocalIp,
    setChannel,
    setStatus,
    upsertPeer,
    removePeer,
    setTransmittingPeer,
  } = useChannelStore();

  const [channelCode, setChannelCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    const code = channelCode.trim().toUpperCase();
    const name = myName.trim();
    if (!code) return setError('Enter a channel (e.g. CH-7)');
    if (!name) return setError('Enter your name');

    setLoading(true);
    setError('');

    try {
      const channelId = await channelService.join({
        channelCode: code,
        myDeviceId,
        myName: name,
        mode,
        onPeersChanged: (peers) => {
          peers.forEach((p) => upsertPeer({ ...p, isTransmitting: false }));
        },
        onTransmittingChanged: (_, name) => {
          setTransmittingPeer(name);
        },
        onStatusChanged: (s) => setStatus(s),
        onLocalIpResolved: (ip) => setLocalIp(ip),
      });

      setChannel(code, channelId);
      await startForegroundService(code);
      onJoined();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to join. Check your network.');
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Logo */}
        <View style={styles.logoArea}>
          <Text style={styles.emoji}>📻</Text>
          <Text style={styles.appName}>TRUE TALKIE</Text>
          <Text style={styles.tagline}>Construction Walkie-Talkie</Text>
        </View>

        {/* Network Mode Selector */}
        <View style={styles.modeContainer}>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'local' && styles.modeTabActive]}
            onPress={() => setMode('local')}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeText, mode === 'local' && styles.modeTextActive]}>
              📶 LOCAL WI-FI (OFFLINE)
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, mode === 'internet' && styles.modeTabActive]}
            onPress={() => setMode('internet')}
            activeOpacity={0.8}
          >
            <Text style={[styles.modeText, mode === 'internet' && styles.modeTextActive]}>
              🌐 INTERNET (CLOUD)
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.modeDescription}>
          {mode === 'local'
            ? '⚡ 100% Offline: Phones on the same Wi-Fi or Hotspot communicate directly without Internet.'
            : '🌐 Cloud: Connect over mobile cellular data (4G/5G) or across different networks.'}
        </Text>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>YOUR NAME</Text>
          <TextInput
            style={styles.input}
            value={myName}
            onChangeText={setMyName}
            placeholder="e.g. Worker A"
            placeholderTextColor="#555"
            maxLength={20}
            autoCapitalize="words"
          />

          <Text style={styles.label}>CHANNEL FREQUENCY</Text>
          <TextInput
            style={[styles.input, styles.channelInput]}
            value={channelCode}
            onChangeText={(t) => setChannelCode(t.toUpperCase())}
            placeholder="CH-7"
            placeholderTextColor="#555"
            maxLength={10}
            autoCapitalize="characters"
          />

          {error ? <Text style={styles.error}>⚠️ {error}</Text> : null}

          <TouchableOpacity
            style={[styles.joinBtn, loading && styles.joinBtnDisabled]}
            onPress={handleJoin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.joinBtnText}>
                {mode === 'local' ? 'JOIN LOCAL MESH' : 'JOIN CLOUD CHANNEL'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          All workers on the same channel frequency can hear each other.
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 24,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 6,
  },
  appName: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFD600',
    letterSpacing: 5,
  },
  tagline: {
    fontSize: 12,
    color: '#666',
    letterSpacing: 2,
    marginTop: 2,
  },
  modeContainer: {
    flexDirection: 'row',
    backgroundColor: '#141414',
    borderRadius: 10,
    padding: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#FFD600',
  },
  modeText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  modeTextActive: {
    color: '#000',
    fontWeight: '900',
  },
  modeDescription: {
    color: '#aaa',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  form: {
    gap: 8,
  },
  label: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    color: '#fff',
    fontSize: 17,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  channelInput: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
    color: '#FFD600',
  },
  error: {
    color: '#ff4444',
    fontSize: 13,
    marginTop: 8,
  },
  joinBtn: {
    backgroundColor: '#FFD600',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 20,
  },
  joinBtnDisabled: {
    opacity: 0.5,
  },
  joinBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2,
  },
  hint: {
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
});

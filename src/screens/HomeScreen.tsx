// src/screens/HomeScreen.tsx
// Redesigned Walkie-Talkie Tactical Entry Screen with Mode Animation, Volume Control, & Channel Frequency Selector

import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
  Modal,
  ScrollView,
} from 'react-native';
import LottieView from 'lottie-react-native';
import { useChannelStore } from '../store/channelStore';
import { channelService } from '../services/ChannelService';
import { startForegroundService } from '../services/ForegroundService';
// @ts-ignore
import InCallManager from 'react-native-incall-manager';

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
    setPeers,
    setTransmittingPeer,
  } = useChannelStore();

  // Channel Selection State
  
  const [customChannelCode, setCustomChannelCode] = useState('CH-01');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Settings & Volume Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [volume, setVolumeState] = useState(80);
  const [speakerOn, setSpeakerOn] = useState(true);

  // Animated Pill position for Mode Switcher (0 for local, 1 for internet)
  const modeAnim = useRef(new Animated.Value(mode === 'local' ? 0 : 1)).current;

  useEffect(() => {
    Animated.spring(modeAnim, {
      toValue: mode === 'local' ? 0 : 1,
      useNativeDriver: false,
      friction: 8,
      tension: 50,
    }).start();
  }, [mode]);

  // Color Theme Variables based on current mode
  const accentColor = mode === 'local' ? '#FFB800' : '#00E5FF';
  const ambientGlowColor = mode === 'local' ? 'rgba(255, 184, 0, 0.12)' : 'rgba(0, 229, 255, 0.12)';



  const handleToggleSpeaker = (val: boolean) => {
    setSpeakerOn(val);
    try {
      InCallManager.setForceSpeakerphoneOn(val);
      InCallManager.setSpeakerphoneOn(val);
    } catch (e) {}
  };

  const handleJoin = async () => {
    const code = customChannelCode.trim().toUpperCase();
    const name = myName.trim();
    if (!code) return setError('Enter a channel name (e.g. ALPHA-1 or CH-01)');
    if (!name) return setError('Enter your callsign / handle');

    setLoading(true);
    setError('');

    try {
      const channelId = await channelService.join({
        channelCode: code,
        myDeviceId,
        myName: name,
        mode,
        onPeersChanged: (peers) => {
          setPeers(peers.map((p) => ({ ...p, isTransmitting: false })));
        },
        onTransmittingChanged: (peerDeviceId) => {
          setTransmittingPeer(peerDeviceId);
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

  // Interpolate sliding pill left offset (0% to 50%)
  const pillLeftInterpolate = modeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['2%', '50%'],
  });



  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0c0e12" />

      {/* Dynamic Ambient Top Glow */}
      <View style={[styles.ambientGlow, { backgroundColor: ambientGlowColor }]} />

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* HEADER BAR */}
          <View style={styles.header}>
            <View />

            {/* Hardware Status & Settings Button */}
            <View style={styles.headerRight}>
              {/* Signal Bars */}
              <View style={styles.signalContainer}>
                <View style={[styles.signalBar, { height: 6 }]} />
                <View style={[styles.signalBar, { height: 9 }]} />
                <View style={[styles.signalBar, { height: 12 }]} />
                <View style={[styles.signalBar, { height: 15, backgroundColor: accentColor }]} />
              </View>

              {/* Settings Button */}
              <TouchableOpacity
                style={styles.settingsHeaderBtn}
                onPress={() => setShowSettings(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.settingsHeaderBtnText}>SETTINGS</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* BRAND HERO SECTION */}
          <View style={styles.brandHero}>
            <View style={[styles.brandIconCard, { borderColor: accentColor + '40', backgroundColor: accentColor + '15' }]}>
              <Text style={styles.brandBadgeText}>TT</Text>
            </View>
            <Text style={styles.brandTitle}>TRUE TALKIE</Text>
            <Text style={styles.brandSubtitle}>TACTICAL SITE AUDIO RELAY</Text>
          </View>

          {/* COMMUNICATION LOTTIE ANIMATION */}
          <View style={styles.communicationLottieWrapper}>
            <LottieView
              source={require('../../assets/communication.json')}
              autoPlay
              loop
              style={styles.communicationLottieAnim}
            />
          </View>

          {/* MODE TOGGLE SEGMENT */}
          <View style={styles.modeToggleSection}>
            <View style={styles.modeToggleContainer}>
              {/* Animated Sliding Active Background */}
              <Animated.View
                style={[
                  styles.activePill,
                  {
                    left: pillLeftInterpolate,
                    backgroundColor: accentColor,
                  },
                ]}
              />

              <TouchableOpacity
                style={styles.modeOption}
                onPress={() => setMode('local')}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeOptionText, mode === 'local' && styles.modeOptionTextActive]}>
                  LOCAL MESH
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modeOption}
                onPress={() => setMode('internet')}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeOptionText, mode === 'internet' && styles.modeOptionTextActive]}>
                  CLOUD NET
                </Text>
              </TouchableOpacity>
            </View>

            {/* Mode Description Subtext */}
            <View style={styles.modeDescContainer}>
              <View style={[styles.modeDot, { backgroundColor: accentColor }]} />
              <Text style={styles.modeDescText}>
                {mode === 'local'
                  ? 'Zero Internet Needed \u2022 Peer-to-Peer Wi-Fi & Hotspot'
                  : 'Worldwide Cloud HQ \u2022 Low-Latency LTE / 5G Relay'}
              </Text>
            </View>
          </View>

          {/* CONTROLS SECTION */}
          <View style={styles.formSection}>

            {/* CALLSIGN / HANDLE INPUT */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>CALLSIGN / HANDLE</Text>
                <Text style={styles.reqTag}>REQ</Text>
              </View>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  value={myName}
                  onChangeText={setMyName}
                  placeholder="e.g. Foreman_01"
                  placeholderTextColor="#555"
                  maxLength={20}
                  autoCapitalize="words"
                />
                
              </View>
            </View>

            {/* CHANNEL NAME / FREQUENCY INPUT */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>CHANNEL NAME / FREQUENCY</Text>
                <Text style={styles.reqTag}>REQ</Text>
              </View>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.textInput}
                  value={customChannelCode}
                  onChangeText={(t) => setCustomChannelCode(t.toUpperCase())}
                  placeholder="e.g. ALPHA-1, TACTICAL-9, or CH-01"
                  placeholderTextColor="#555"
                  maxLength={20}
                  autoCapitalize="characters"
                />
                
              </View>

              
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          {/* MAIN CTA BUTTON */}
          <View style={styles.actionSection}>
            <TouchableOpacity
              style={[
                styles.mainCtaBtn,
                { backgroundColor: accentColor },
                loading && styles.btnDisabled,
              ]}
              onPress={handleJoin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.mainCtaBtnText}>
                  {mode === 'local' ? 'JOIN LOCAL MESH' : 'CONNECT CLOUD NET'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={styles.subtextNotice}>
              Encrypted {'\u2022'} Press & hold volume button on job site for PTT
            </Text>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* SETTINGS / VOLUME CONTROL MODAL */}
      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>AUDIO & VOLUME SETTINGS</Text>
              <TouchableOpacity
                onPress={() => setShowSettings(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>{'\u2715'}</Text>
              </TouchableOpacity>
            </View>

            {/* Volume Control */}
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>OUTPUT VOLUME ({volume}%)</Text>
              <View style={styles.volumeRow}>
                <TouchableOpacity
                  style={styles.volStepBtn}
                  onPress={() => setVolumeState((v) => Math.max(0, v - 10))}
                >
                  <Text style={styles.volStepText}>-</Text>
                </TouchableOpacity>
                <View style={styles.volBarTrack}>
                  <View style={[styles.volBarFill, { width: (volume + '%') as any, backgroundColor: accentColor }]} />
                </View>
                <TouchableOpacity
                  style={styles.volStepBtn}
                  onPress={() => setVolumeState((v) => Math.min(100, v + 10))}
                >
                  <Text style={styles.volStepText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Loudspeaker Toggle */}
            <View style={styles.settingItemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>LOUDSPEAKER MODE</Text>
                <Text style={styles.settingSubtext}>Route audio directly to speakerphone</Text>
              </View>
              <TouchableOpacity
                style={[styles.toggleSwitch, speakerOn && { backgroundColor: accentColor }]}
                onPress={() => handleToggleSpeaker(!speakerOn)}
                activeOpacity={0.8}
              >
                <View style={[styles.toggleThumb, speakerOn && styles.toggleThumbActive]} />
              </TouchableOpacity>
            </View>

            {/* Save & Close Button */}
            <TouchableOpacity
              style={[styles.modalDoneBtn, { backgroundColor: accentColor }]}
              onPress={() => setShowSettings(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalDoneText}>DONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  settingsHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsHeaderBtnText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    color: '#ffffff',
    letterSpacing: 1,
  },
  brandBadgeText: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 20,
    color: '#ffffff',
    letterSpacing: 2,
  },

  communicationLottieWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
    height: 190,
  },
  communicationLottieAnim: {
    width: 240,
    height: 190,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  presetChip: {
    backgroundColor: '#161F33',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  presetChipText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#A0AEC0',
    fontSize: 11,
  },
  container: {
    flex: 1,
    backgroundColor: '#0c0e12',
  },
  flex1: {
    flex: 1,
  },
  ambientGlow: {
    position: 'absolute',
    top: -80,
    left: '10%',
    right: '10%',
    height: 300,
    borderRadius: 150,
    opacity: 0.8,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 12,
    paddingBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  headerRight: {
    flexDirection: 'row',
    marginTop: 6,
    alignItems: 'center',
    gap: 12,
  },
  signalContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 16,
  },
  signalBar: {
    width: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 1.5,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  gearIcon: {
    fontSize: 16,
  },
  brandHero: {
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 4,
  },
  brandIconCard: {
    width: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  brandTitle: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 30,
    color: '#ffffff',
    letterSpacing: 3,
  },
  brandSubtitle: {
    fontFamily: 'Fredoka_500Medium',
    fontSize: 11,
    color: '#888888',
    letterSpacing: 2,
    marginTop: 3,
  },
  modeToggleSection: {
    marginVertical: 14,
  },
  modeToggleContainer: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: '#17191e',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    width: '48%',
    borderRadius: 11,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  modeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  modeOptionText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    color: '#888888',
    letterSpacing: 1,
  },
  modeOptionTextActive: {
    fontFamily: 'Fredoka_700Bold',
    color: '#000000',
  },
  modeDescContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  modeDescText: {
    fontFamily: 'Fredoka_400Regular',
    fontSize: 11,
    color: '#999999',
  },
  formSection: {
    gap: 14,
    marginVertical: 10,
  },
  inputGroup: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  label: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 11,
    color: '#888888',
    letterSpacing: 1.5,
  },
  reqTag: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 10,
    color: '#555555',
  },
  freqValueText: {
    fontSize: 12,
    fontFamily: 'Fredoka_600SemiBold',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14161b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 14,
  },
  textInput: {
    fontFamily: 'Fredoka_500Medium',
    flex: 1,
    height: 48,
    color: '#ffffff',
    fontSize: 15,
  },
  inputRightIcon: {
    fontSize: 16,
  },
  channelStepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#14161b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 8,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 22,
    color: '#ffffff',
  },
  channelDisplayCenter: {
    alignItems: 'center',
  },
  activeBandLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 9,
    color: '#666666',
    letterSpacing: 1.5,
  },
  channelNumRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 2,
  },
  chPrefix: {
    fontSize: 12,
    color: '#888888',
    fontFamily: 'Fredoka_600SemiBold',
  },
  channelNumInput: {
    fontSize: 22,
    color: '#ffffff',
    letterSpacing: 1,
    fontFamily: 'Fredoka_600SemiBold',
    minWidth: 40,
    textAlign: 'center',
    padding: 0,
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: 4,
  },
  actionSection: {
    gap: 10,
    marginTop: 14,
    marginBottom: 6,
  },
  mainCtaBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  mainCtaBtnText: {
    fontFamily: 'Fredoka_700Bold',
    color: '#000000',
    fontSize: 18,
    letterSpacing: 2,
  },
  subtextNotice: {
    fontSize: 11,
    color: '#666666',
    textAlign: 'center',
    fontFamily: 'Fredoka_600SemiBold',
  },

  /* MODAL STYLES */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#14161b',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 13,
    color: '#ffffff',
    letterSpacing: 1.5,
    fontFamily: 'Fredoka_600SemiBold',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 18,
    color: '#888888',
  },
  settingItem: {
    gap: 8,
  },
  settingItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 12,
    color: '#aaaaaa',
    letterSpacing: 1,
  },
  settingSubtext: {
    fontFamily: 'Fredoka_400Regular',
    fontSize: 10,
    color: '#666666',
    marginTop: 2,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  volStepBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  volStepText: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 18,
    color: '#ffffff',
  },
  volBarTrack: {
    flex: 1,
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  volBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  toggleSwitch: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: 3,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  modalDoneBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalDoneText: {
    fontFamily: 'Fredoka_700Bold',
    color: '#000000',
    fontSize: 15,
    letterSpacing: 1.5,
  },
});

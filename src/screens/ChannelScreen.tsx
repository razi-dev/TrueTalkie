// src/screens/ChannelScreen.tsx
// Redesigned Tactical Channel Screen with Lottie Hold-To-Talk Animation

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Platform,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Animated,
  Vibration,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import LottieView from 'lottie-react-native';
// @ts-ignore
import InCallManager from 'react-native-incall-manager';
import { useChannelStore } from '../store/channelStore';
import { channelService } from '../services/ChannelService';
import {
  updateForegroundService,
  stopForegroundService,
} from '../services/ForegroundService';

interface Props {
  onLeft: () => void;
}

export default function ChannelScreen({ onLeft }: Props) {
  const {
    channelCode,
    status,
    peers,
    myName,
    mode,
    localIp,
    isTransmitting,
    setTransmitting,
    transmittingPeer,
  } = useChannelStore();

  const [isLoudspeaker, setIsLoudspeaker] = useState(true);

  useEffect(() => {
    if (mode !== 'local') {
      try {
        InCallManager.start({ media: 'audio', auto: false });
        InCallManager.setForceSpeakerphoneOn(true);
        InCallManager.setSpeakerphoneOn(true);
      } catch (e) {}
      return () => {
        try { InCallManager.stop(); } catch (e) {}
      };
    }
  }, [mode]);
  const [isMuted, setIsMuted] = useState(false);
  const [audioDiagnostics, setAudioDiagnostics] = useState<{ deviceId: string; connection: string; ice: string; signaling: string; localMic: string; remoteAudio: string; inboundBytes: number; outboundBytes: number; candidatePair: string; candidateTypes: string; candidateCounts: string; candidateAddresses: string; failedPairs: number; iceError: string; iceSetup: string }[]>([]);

  const refreshAudioDiagnostics = useCallback(async () => {
    try {
      if (typeof channelService?.getAudioDiagnostics === 'function') {
        const diag = await channelService.getAudioDiagnostics();
        setAudioDiagnostics(diag || []);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    const initial = setTimeout(refreshAudioDiagnostics, 0);
    const timer = setInterval(refreshAudioDiagnostics, 3000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [refreshAudioDiagnostics, peers.length]);

  const lottieRef = useRef<LottieView>(null);
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [glowAnim] = useState(() => new Animated.Value(0));

  const isMeshMode = mode === 'local';
  const accentColor = isMeshMode ? '#10B981' : '#3B82F6';

  // Handle Lottie and pulse animation when transmitting state changes
  useEffect(() => {
    if (isTransmitting) {
      lottieRef.current?.play();
      Animated.parallel([
        Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, { toValue: 1.12, duration: 400, useNativeDriver: true }),
            Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          ])
        ),
        Animated.timing(glowAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      lottieRef.current?.pause();
      lottieRef.current?.reset();
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      Animated.timing(glowAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [isTransmitting, glowAnim, pulseAnim]);

  // Update foreground service notification
  useEffect(() => {
    if (status === 'connected') {
      updateForegroundService(channelCode, isTransmitting);
    }
  }, [status, channelCode, isTransmitting]);

  const handlePressIn = useCallback(() => {
    if (isMuted) {
      Alert.alert('Microphone Muted', 'Unmute microphone to transmit voice.');
      return;
    }
    try {
      Vibration.vibrate(45);
    } catch (e) {}
    setTransmitting(true);
    channelService.startTransmitting();
  }, [isMuted, setTransmitting]);

  const handlePressOut = useCallback(() => {
    try {
      Vibration.vibrate(25);
    } catch (e) {}
    setTransmitting(false);
    channelService.stopTransmitting();
  }, [setTransmitting]);

  const handleLeave = useCallback(async () => {
    await channelService.leave();
    await stopForegroundService();
    onLeft();
  }, [onLeft]);

  const toggleSpeaker = useCallback(() => {
    const nextState = !isLoudspeaker;
    setIsLoudspeaker(nextState);
    try {
      InCallManager.setForceSpeakerphoneOn(nextState);
    } catch (e) {}
  }, [isLoudspeaker]);

  const toggleMute = useCallback(() => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    try {
      InCallManager.setMicrophoneMute(nextState);
    } catch (e) {}
  }, [isMuted]);

  const activeSpeakerName = transmittingPeer
    ? peers.find((p) => p.deviceId === transmittingPeer)?.name || transmittingPeer
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='light-content' backgroundColor='#0A0F1D' />

      {/* HEADER BAR */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleLeave} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>‹ LEAVE</Text>
        </TouchableOpacity>

        {/* Mode Badge */}
        <View style={[styles.modeBadge, { borderColor: accentColor + '66', backgroundColor: accentColor + '1A' }]}>
          <View style={[styles.statusDot, { backgroundColor: status === 'connected' ? accentColor : '#F59E0B' }]} />
          <Text style={[styles.modeBadgeText, { color: accentColor }]}>
            {isMeshMode ? 'P2P MESH' : 'CLOUD RELAY'}
          </Text>
        </View>

        {/* Signal Bars */}
        <View style={styles.signalContainer}>
          {[40, 60, 80, 100].map((h, i) => (
            <View
              key={i}
              style={[
                styles.signalBar,
                { height: h * 0.14, backgroundColor: i < 3 ? accentColor : '#334155' },
              ]}
            />
          ))}
        </View>
      </View>

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
        
        {/* CHANNEL FREQUENCY CARD */}
        <View style={styles.channelCard}>
          <View style={styles.channelCardTop}>
            <Text style={styles.channelCardTag}>TACTICAL BAND</Text>
            <View style={styles.latencyBadge}>
              <Text style={styles.latencyText}>{isMeshMode ? 'P2P LATENCY <20ms' : 'ENCRYPTED'}</Text>
            </View>
          </View>

          <View style={styles.freqRow}>
            <Text style={styles.channelBigText}>{channelCode}</Text>
            <View style={styles.freqRight}>
              <Text style={styles.freqHz}>{isMeshMode ? 'P2P MESH CHANNEL' : 'CLOUD RELAY'}</Text>

              {isMeshMode && localIp ? (
                <View style={styles.ipContainer}>
                  <Text style={styles.ipText}>IP: {localIp}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* WORKERS / PEERS LIST */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>CONNECTED WORKERS</Text>
          <View style={styles.workerCountBadge}>
            <Text style={styles.workerCountText}>{peers.length + 1} ONLINE</Text>
          </View>
        </View>

        <View style={styles.peersGrid}>
          {/* Myself */}
          <View style={[styles.peerCard, isTransmitting && styles.peerCardActive]}>
            <View style={[styles.peerAvatar, { backgroundColor: accentColor + '33', borderColor: accentColor }]}>
              <Text style={[styles.peerAvatarText, { color: accentColor }]}>
                {(myName || 'YOU').slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.peerInfo}>
              <Text style={styles.peerName} numberOfLines={1}>
                {myName || 'My Device'} (You)
              </Text>
              <Text style={styles.peerRole}>{isMeshMode ? 'Mesh Host' : 'Relay Peer'}</Text>
            </View>
            <View style={[styles.peerStatusBadge, { backgroundColor: isTransmitting ? '#EF444433' : '#10B98122' }]}>
              <Text style={[styles.peerStatusText, { color: isTransmitting ? '#EF4444' : '#10B981' }]}>
                {isTransmitting ? 'TALKING' : 'READY'}
              </Text>
            </View>
          </View>

          {/* Other Peers */}
          {peers.map((peer) => {
            const isPeerSpeaking = transmittingPeer === peer.deviceId;
            return (
              <View
                key={peer.deviceId}
                style={[styles.peerCard, isPeerSpeaking && styles.peerCardSpeaking]}
              >
                <View style={[styles.peerAvatar, isPeerSpeaking && { backgroundColor: '#3B82F644', borderColor: '#3B82F6' }]}>
                  <Text style={styles.peerAvatarText}>
                    {(peer.name || peer.deviceId).slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.peerInfo}>
                  <Text style={styles.peerName} numberOfLines={1}>
                    {peer.name || 'Worker-' + peer.deviceId.slice(0, 4)}
                  </Text>
                  <Text style={styles.peerRole}>{'ID: ' + peer.deviceId.slice(0, 8)}</Text>
                </View>
                <View
                  style={[
                    styles.peerStatusBadge,
                    { backgroundColor: isPeerSpeaking ? '#3B82F633' : '#64748B22' },
                  ]}
                >
                  <Text style={[styles.peerStatusText, { color: isPeerSpeaking ? '#3B82F6' : '#94A3B8' }]}>
                    {isPeerSpeaking ? 'LISTENING' : 'IDLE'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.diagnosticsCard}>
          <Text style={styles.diagnosticsTitle}>AUDIO DIAGNOSTICS · LIVE</Text>
          {audioDiagnostics.length === 0 ? (
            <Text style={styles.diagnosticsLine}>No WebRTC peer connection yet. Check peer discovery and signaling.</Text>
          ) : audioDiagnostics.map((peer) => (
            <View key={peer.deviceId} style={styles.diagnosticsPeer}>
              <Text style={styles.diagnosticsLine}>{peer.deviceId.slice(0, 10)} · connection {peer.connection} · ICE {peer.ice}</Text>
              <Text style={styles.diagnosticsLine}>Signaling {peer.signaling} · mic {peer.localMic}</Text>
              <Text style={styles.diagnosticsLine}>Remote {peer.remoteAudio} · audio bytes in/out {peer.inboundBytes}/{peer.outboundBytes}</Text>
              <Text style={styles.diagnosticsLine}>ICE setup {peer.iceSetup} · candidates {peer.candidateCounts} ({peer.candidateTypes})</Text>
              {isMeshMode ? <Text style={styles.diagnosticsLine}>Candidate addresses {peer.candidateAddresses}</Text> : null}
              {peer.ice === 'failed' ? <Text style={styles.diagnosticsLine}>Failed candidate pairs {peer.failedPairs}</Text> : null}
              <Text style={styles.diagnosticsLine}>Route {peer.candidatePair} · ICE error {peer.iceError}</Text>
              {peer.ice === 'failed' ? (
                <Text style={styles.diagnosticsHint}>{isMeshMode
                  ? 'Peer discovery is working, but the audio UDP route failed. Compare both phones’ candidate addresses: they should be on the same LAN/subnet. If they are, the access point may still block device-to-device media UDP even while discovery broadcasts pass.'
                  : peer.iceSetup.includes('no TURN')
                    ? 'No media route was found. This build has no TURN relay configured; STUN alone cannot connect through some mobile carriers, VPNs, or strict routers. Configure a TURN service and rebuild.'
                    : 'No media route was found even with TURN configured. Check the TURN credentials, server reachability, and the ICE error above; try another network to isolate carrier or firewall blocking.'}</Text>
              ) : peer.ice === 'connected' || peer.ice === 'completed' ? (
                <Text style={styles.diagnosticsHint}>{peer.inboundBytes === 0
                  ? 'ICE is connected. Ask the other phone to hold PTT for a few seconds; if inbound bytes stay at 0, check its microphone permission and transmitting state.'
                  : 'Audio data is arriving. If you still hear nothing, check speaker mode, phone volume, Bluetooth routing, and mute state.'}</Text>
              ) : null}
            </View>
          ))}
          <Text style={styles.diagnosticsHint}>Audio byte totals increase only while audio is flowing. A remote track by itself does not mean a usable media route was selected.</Text>
        </View>

        {/* HOLD TO TALK SECTION */}
        <View style={styles.pttContainer}>
          {/* Animated Glow Ring */}
          <Animated.View
            style={[
              styles.glowRing,
              {
                borderColor: isTransmitting ? '#EF4444' : accentColor,
                transform: [{ scale: pulseAnim }],
                opacity: isTransmitting ? 1 : 0.4,
              },
            ]}
          />

          {/* Main PTT Circular Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[
              styles.pttButton,
              {
                borderColor: isTransmitting ? '#EF4444' : accentColor,
                backgroundColor: isTransmitting ? '#1A0505' : '#0F172A',
              },
            ]}
          >
            {/* Full-Circle Lottie Animation (Active only while holding) */}
            {isTransmitting && (
              <View style={StyleSheet.absoluteFill}>
                <LottieView
                  ref={lottieRef}
                  source={require('../../assets/listening.json')}
                  loop
                  style={styles.fullCircleLottie}
                  autoPlay={true}
                  resizeMode="cover"
                />
              </View>
            )}

            {/* Center Text Overlay (Shown only when idle) */}
            {!isTransmitting && (
              <View style={styles.pttOverlay}>
                
                <Text style={styles.pttTextMain}>HOLD TO TALK</Text>
                <Text style={styles.pttTextSub}>PRESS & HOLD</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* STATUS BANNER BELOW PTT */}
        <View style={styles.statusBanner}>
          {isTransmitting ? (
            <Text style={styles.statusBannerTransmitting}>YOUR VOICE IS LIVE ON AIR</Text>
          ) : activeSpeakerName ? (
            <Text style={styles.statusBannerReceiving}>{activeSpeakerName.toUpperCase()} IS SPEAKING...</Text>
          ) : (
            <Text style={styles.statusBannerReady}>READY TO TRANSMIT</Text>
          )}
        </View>

        {/* QUICK CONTROL TOGGLES */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.ctrlBtn, !isLoudspeaker && styles.ctrlBtnInactive]}
            onPress={toggleSpeaker}
            activeOpacity={0.7}
          >
            
            <Text style={styles.ctrlLabel}>{isLoudspeaker ? 'SPEAKER' : 'EARPIECE'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, isMuted && styles.ctrlBtnMuted]}
            onPress={toggleMute}
            activeOpacity={0.7}
          >
            
            <Text style={styles.ctrlLabel}>{isMuted ? 'MUTED' : 'MIC ON'}</Text>
          </TouchableOpacity>
        </View>

        {/* LEAVE CHANNEL BUTTON AT BOTTOM */}
        <TouchableOpacity
          style={styles.leaveBottomBtn}
          onPress={handleLeave}
          activeOpacity={0.8}
        >
          <Text style={styles.leaveBottomBtnText}>LEAVE CHANNEL</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  diagnosticsCard: { backgroundColor: '#0B1220', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4 },
  diagnosticsTitle: { fontFamily: 'Fredoka_700Bold', color: '#F59E0B', fontSize: 11, letterSpacing: 0.8, marginBottom: 6 },
  diagnosticsPeer: { borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 7, marginTop: 5 },
  diagnosticsLine: { fontFamily: 'Fredoka_400Regular', color: '#CBD5E1', fontSize: 10, marginTop: 2 },
  diagnosticsHint: { fontFamily: 'Fredoka_400Regular', color: '#64748B', fontSize: 9, marginTop: 8, lineHeight: 14 },
  leaveBottomBtn: {
    backgroundColor: '#1E0A0A',
    borderColor: '#EF444466',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  leaveBottomBtnText: {
    fontFamily: 'Fredoka_700Bold',
    color: '#EF4444',
    fontSize: 14,
    letterSpacing: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 28) + 12 : 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1E293B',
    borderRadius: 8,
  },
  backBtnText: {
    fontFamily: 'Fredoka_700Bold',
    color: '#94A3B8',
    fontSize: 12,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  modeBadgeText: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  signalContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 16,
    gap: 3,
  },
  signalBar: {
    width: 4,
    borderRadius: 2,
  },
  scrollContent: {
    flex: 1,
  },
  scrollInner: {
    padding: 16,
    paddingBottom: 40,
  },
  channelCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1E293B',
    marginBottom: 20,
  },
  channelCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  channelCardTag: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#64748B',
    fontSize: 11,
    letterSpacing: 1,
  },
  latencyBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  latencyText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#10B981',
    fontSize: 10,
  },
  freqRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  channelBigText: {
    fontFamily: 'Fredoka_700Bold',
    color: '#F8FAFC',
    fontSize: 32,
    letterSpacing: 1,
  },
  freqRight: {
    alignItems: 'flex-end',
  },
  freqHz: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#38BDF8',
    fontSize: 14,
  },
  ipContainer: {
    marginTop: 4,
    backgroundColor: '#1E293B88',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  ipText: {
    fontFamily: 'Fredoka_500Medium',
    color: '#94A3B8',
    fontSize: 11,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: 'Fredoka_700Bold',
    color: '#64748B',
    fontSize: 11,
    letterSpacing: 1,
  },
  workerCountBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  workerCountText: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#94A3B8',
    fontSize: 10,
  },
  peersGrid: {
    gap: 8,
    marginBottom: 24,
  },
  peerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  peerCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#064E3B22',
  },
  peerCardSpeaking: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E3A8A22',
  },
  peerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 10,
  },
  peerAvatarText: {
    fontFamily: 'Fredoka_700Bold',
    color: '#F8FAFC',
    fontSize: 12,
  },
  peerInfo: {
    flex: 1,
  },
  peerName: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#F8FAFC',
    fontSize: 13,
  },
  peerRole: {
    fontFamily: 'Fredoka_400Regular',
    color: '#64748B',
    fontSize: 10,
    marginTop: 1,
  },
  peerStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  peerStatusText: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  pttContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
    height: 220,
  },
  glowRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
  },
  pttButton: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  fullCircleLottie: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    transform: [{ scale: 1.25 }],
  },
  pttOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    backgroundColor: 'rgba(7, 10, 18, 0.45)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  pttTextTransmitting: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(239, 68, 68, 0.9)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  pttTextMain: {
    fontFamily: 'Fredoka_700Bold',
    color: '#F8FAFC',
    fontSize: 15,
    letterSpacing: 1,
    marginTop: 4,
  },
  pttTextSub: {
    fontFamily: 'Fredoka_500Medium',
    color: '#64748B',
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statusBanner: {
    alignItems: 'center',
    marginVertical: 12,
  },
  statusBannerReady: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#64748B',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  statusBannerTransmitting: {
    fontFamily: 'Fredoka_700Bold',
    color: '#EF4444',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  statusBannerReceiving: {
    fontFamily: 'Fredoka_700Bold',
    color: '#3B82F6',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  ctrlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 8,
  },
  ctrlBtnInactive: {
    backgroundColor: '#1E293B55',
  },
  ctrlBtnMuted: {
    borderColor: '#EF444466',
    backgroundColor: '#EF44441A',
  },
  ctrlIcon: {
    fontSize: 16,
  },
  ctrlLabel: {
    fontFamily: 'Fredoka_600SemiBold',
    color: '#F8FAFC',
    fontSize: 12,
    letterSpacing: 0.5,
  },
});


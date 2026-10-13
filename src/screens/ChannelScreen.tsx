// src/screens/ChannelScreen.tsx
// Redesigned Tactical Channel Screen with Lottie Hold-To-Talk Animation

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Modal,
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
import { safetyService } from '../services/SafetyService';
import ReportUserModal from '../components/ReportUserModal';
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
    myDeviceId,
    blockedPeerIds,
    setBlockedPeerIds,
    mutedPeerIds,
    toggleMutePeer,
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


  const lottieRef = useRef<LottieView>(null);
  const [pulseAnim] = useState(() => new Animated.Value(1));
  const [glowAnim] = useState(() => new Animated.Value(0));

  const [selectedPeerMenu, setSelectedPeerMenu] = useState<{ deviceId: string; name: string } | null>(null);
  const [reportPeerTarget, setReportPeerTarget] = useState<{ deviceId: string; name: string } | null>(null);

  useEffect(() => {
    const unsub = safetyService.addBlockedListener((ids) => {
      setBlockedPeerIds(ids);
    });
    return unsub;
  }, [setBlockedPeerIds]);

  const handleBlockToggle = (targetPeer: { deviceId: string; name: string }) => {
    const isAlreadyBlocked = blockedPeerIds.includes(targetPeer.deviceId);
    setSelectedPeerMenu(null);

    if (isAlreadyBlocked) {
      Alert.alert(
        'Unblock Participant?',
        `Do you want to unblock "${targetPeer.name}" and restore hearing their voice transmissions?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: async () => {
              await safetyService.unblockPeer(targetPeer.deviceId);
            },
          },
        ]
      );
    } else {
      Alert.alert(
        'Block Participant?',
        `Do you want to block "${targetPeer.name}"?

You will no longer hear audio packets from them on any channel.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block & Mute',
            style: 'destructive',
            onPress: async () => {
              await safetyService.blockPeer(targetPeer.deviceId, targetPeer.name);
            },
          },
        ]
      );
    }
  };

  const handleOpenReport = (targetPeer: { deviceId: string; name: string }) => {
    setSelectedPeerMenu(null);
    setReportPeerTarget(targetPeer);
  };

  const handleToggleMutePeer = useCallback((peerDeviceId: string) => {
    try {
      Vibration.vibrate(25);
    } catch (e) {}
    const isCurrentlyMuted = mutedPeerIds.includes(peerDeviceId);
    toggleMutePeer(peerDeviceId);
    channelService.setPeerAudioMuted(peerDeviceId, !isCurrentlyMuted);
  }, [mutedPeerIds, toggleMutePeer]);

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
              <View style={styles.peerNameRow}>
                <Text style={styles.peerName} numberOfLines={1}>
                  {myName || 'My Device'} (You)
                </Text>
                {/* 1-Tap Mic Mute Button for Self (No Popup) */}
                <TouchableOpacity
                  style={[styles.peerMuteBtn, isMuted && styles.peerMuteBtnMuted]}
                  onPress={toggleMute}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  activeOpacity={0.6}
                  accessibilityLabel={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  <Text style={styles.peerMuteBtnIcon}>{isMuted ? '🔇' : (isTransmitting ? '🎙️' : '🎤')}</Text>
                  <Text style={[styles.peerMuteBtnText, isMuted && styles.peerMuteBtnTextMuted]}>
                    {isMuted ? 'MUTED' : 'MIC ON'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.peerRole}>{isMeshMode ? 'Mesh Host' : 'Relay Peer'}</Text>
            </View>
            <View style={[styles.peerStatusBadge, { backgroundColor: isTransmitting ? '#EF444433' : (isMuted ? '#64748B33' : '#10B98122') }]}>
              <Text style={[styles.peerStatusText, { color: isTransmitting ? '#EF4444' : (isMuted ? '#94A3B8' : '#10B981') }]}>
                {isTransmitting ? 'TALKING' : (isMuted ? 'MUTED' : 'READY')}
              </Text>
            </View>
          </View>

          {/* Connected Participants */}
          {peers.map((peer) => {
            const isPeerSpeaking = transmittingPeer === peer.deviceId;
            const isBlocked = blockedPeerIds.includes(peer.deviceId);
            const isPeerMuted = mutedPeerIds.includes(peer.deviceId);
            const peerDisplayName = peer.name || 'Worker-' + peer.deviceId.slice(0, 4);

            return (
              <View
                key={peer.deviceId}
                style={[
                  styles.peerCard,
                  isPeerSpeaking && styles.peerCardSpeaking,
                  isBlocked && styles.peerCardBlocked,
                  isPeerMuted && !isBlocked && styles.peerCardMuted,
                ]}
              >
                <View
                  style={[
                    styles.peerAvatar,
                    isPeerSpeaking && { backgroundColor: '#3B82F644', borderColor: '#3B82F6' },
                    isBlocked && { backgroundColor: '#EF444422', borderColor: '#EF4444' },
                    isPeerMuted && !isBlocked && { backgroundColor: '#EF444415', borderColor: '#EF444466' },
                  ]}
                >
                  <Text
                    style={[
                      styles.peerAvatarText,
                      isBlocked && { color: '#EF4444' },
                      isPeerMuted && !isBlocked && { color: '#EF4444' },
                    ]}
                  >
                    {peerDisplayName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.peerInfo}>
                  <View style={styles.peerNameRow}>
                    <Text
                      style={[
                        styles.peerName,
                        isBlocked && styles.peerNameBlocked,
                        isPeerMuted && !isBlocked && styles.peerNameMuted,
                      ]}
                      numberOfLines={1}
                    >
                      {peerDisplayName}
                    </Text>

                    {/* Dedicated 1-Tap Voice Mute Button in Name Label (No Popup) */}
                    <TouchableOpacity
                      style={[
                        styles.peerMuteBtn,
                        isPeerMuted && styles.peerMuteBtnMuted,
                        isBlocked && styles.peerMuteBtnBlocked,
                      ]}
                      onPress={() => !isBlocked && handleToggleMutePeer(peer.deviceId)}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                      activeOpacity={0.6}
                      disabled={isBlocked}
                      accessibilityLabel={isPeerMuted ? 'Unmute ' + peerDisplayName : 'Mute ' + peerDisplayName}
                    >
                      <Text style={styles.peerMuteBtnIcon}>
                        {isBlocked ? '🚫' : (isPeerMuted ? '🔇' : (isPeerSpeaking ? '🎙️' : '🔊'))}
                      </Text>
                      <Text
                        style={[
                          styles.peerMuteBtnText,
                          isPeerMuted && styles.peerMuteBtnTextMuted,
                          isBlocked && styles.peerMuteBtnTextBlocked,
                        ]}
                      >
                        {isBlocked ? 'BLOCKED' : (isPeerMuted ? 'MUTED' : 'MUTE')}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text
                    style={[
                      styles.peerRole,
                      isBlocked && { color: '#EF4444' },
                      isPeerMuted && !isBlocked && { color: '#EF4444' },
                    ]}
                  >
                    {isBlocked
                      ? 'MUTED & BLOCKED'
                      : isPeerMuted
                      ? 'VOICE MUTED (TAP TO UNMUTE)'
                      : 'ID: ' + peer.deviceId.slice(0, 8)}
                  </Text>
                </View>

                {/* Status Badge */}
                <View
                  style={[
                    styles.peerStatusBadge,
                    {
                      backgroundColor: isBlocked
                        ? '#EF444433'
                        : isPeerMuted
                        ? '#EF444422'
                        : isPeerSpeaking
                        ? '#3B82F633'
                        : '#64748B22',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.peerStatusText,
                      {
                        color: isBlocked
                          ? '#EF4444'
                          : isPeerMuted
                          ? '#EF4444'
                          : isPeerSpeaking
                          ? '#3B82F6'
                          : '#94A3B8',
                      },
                    ]}
                  >
                    {isBlocked ? 'BLOCKED' : isPeerMuted ? 'MUTED' : isPeerSpeaking ? 'TALKING' : 'ONLINE'}
                  </Text>
                </View>

                {/* Three-Dot Menu Button (⋮) beside participant name */}
                <TouchableOpacity
                  style={styles.moreOptionsBtn}
                  onPress={() => setSelectedPeerMenu({ deviceId: peer.deviceId, name: peerDisplayName })}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.6}
                  accessibilityLabel={'Options for ' + peerDisplayName}
                >
                  <Text style={styles.moreOptionsIcon}>⋮</Text>
                </TouchableOpacity>
              </View>
            );
          })}


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
            <Text style={styles.ctrlIcon}>{isLoudspeaker ? '🔊' : '📱'}</Text>
            <Text style={styles.ctrlLabel}>{isLoudspeaker ? 'SPEAKER' : 'EARPIECE'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctrlBtn, isMuted && styles.ctrlBtnMuted]}
            onPress={toggleMute}
            activeOpacity={0.7}
          >
            <Text style={styles.ctrlIcon}>{isMuted ? '🔇' : '🎙️'}</Text>
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

      {/* Three-Dot Peer Action Menu Bottom Sheet */}
      <Modal
        visible={!!selectedPeerMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPeerMenu(null)}
      >
        <TouchableOpacity
          style={styles.actionSheetOverlay}
          activeOpacity={1}
          onPress={() => setSelectedPeerMenu(null)}
        >
          <View style={styles.actionSheetCard}>
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle} numberOfLines={1}>
                {selectedPeerMenu?.name}
              </Text>
              <Text style={styles.actionSheetSub}>
                ID: {selectedPeerMenu?.deviceId.slice(0, 10)}
              </Text>
            </View>

            {/* Block / Unblock Action */}
            <TouchableOpacity
              style={styles.actionSheetItem}
              onPress={() => selectedPeerMenu && handleBlockToggle(selectedPeerMenu)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionSheetIcon}>
                {selectedPeerMenu && blockedPeerIds.includes(selectedPeerMenu.deviceId) ? '🔊' : '🚫'}
              </Text>
              <View style={styles.actionSheetItemTextCol}>
                <Text
                  style={[
                    styles.actionSheetItemTitle,
                    selectedPeerMenu && !blockedPeerIds.includes(selectedPeerMenu.deviceId) && { color: '#EF4444' },
                  ]}
                >
                  {selectedPeerMenu && blockedPeerIds.includes(selectedPeerMenu.deviceId)
                    ? 'Unblock User'
                    : 'Block User'}
                </Text>
                <Text style={styles.actionSheetItemDesc}>
                  {selectedPeerMenu && blockedPeerIds.includes(selectedPeerMenu.deviceId)
                    ? 'Restore audio transmissions from this participant'
                    : 'Mute and drop all voice audio from this participant'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Report Action */}
            <TouchableOpacity
              style={styles.actionSheetItem}
              onPress={() => selectedPeerMenu && handleOpenReport(selectedPeerMenu)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionSheetIcon}>⚠️</Text>
              <View style={styles.actionSheetItemTextCol}>
                <Text style={[styles.actionSheetItemTitle, { color: '#F59E0B' }]}>
                  Report User
                </Text>
                <Text style={styles.actionSheetItemDesc}>
                  Submit an abuse report to moderators and automatically block
                </Text>
              </View>
            </TouchableOpacity>

            {/* Cancel Button */}
            <TouchableOpacity
              style={styles.actionSheetCancelBtn}
              onPress={() => setSelectedPeerMenu(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.actionSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report User Modal */}
      <ReportUserModal
        visible={!!reportPeerTarget}
        peerId={reportPeerTarget?.deviceId || null}
        peerName={reportPeerTarget?.name || null}
        channelId={channelCode}
        reporterDeviceId={myDeviceId}
        onClose={() => setReportPeerTarget(null)}
        onReportSubmitted={() => setReportPeerTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  peerCardBlocked: {
    borderColor: '#EF444466',
    backgroundColor: '#7F1D1D22',
    opacity: 0.85,
  },
  peerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  peerCardMuted: {
    borderColor: '#EF444444',
    backgroundColor: '#7F1D1D15',
  },
  peerNameMuted: {
    color: '#FCA5A5',
  },
  peerMuteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
    marginLeft: 6,
    gap: 3,
  },
  peerMuteBtnMuted: {
    backgroundColor: '#EF444422',
    borderColor: '#EF444488',
  },
  peerMuteBtnBlocked: {
    backgroundColor: '#7F1D1D22',
    borderColor: '#EF444444',
    opacity: 0.7,
  },
  peerMuteBtnIcon: {
    fontSize: 11,
  },
  peerMuteBtnText: {
    fontFamily: 'Fredoka_600SemiBold',
    fontSize: 9.5,
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  peerMuteBtnTextMuted: {
    color: '#EF4444',
  },
  peerMuteBtnTextBlocked: {
    color: '#EF4444',
  },
  peerNameBlocked: {
    color: '#EF4444',
    textDecorationLine: 'line-through',
  },
  micStatusIcon: {
    fontSize: 12,
  },
  moreOptionsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  moreOptionsIcon: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    paddingBottom: 36,
  },
  actionSheetHeader: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 16,
    marginBottom: 16,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontFamily: 'Fredoka_700Bold',
    color: '#FFFFFF',
  },
  actionSheetSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionSheetIcon: {
    fontSize: 22,
    marginRight: 14,
  },
  actionSheetItemTextCol: {
    flex: 1,
  },
  actionSheetItemTitle: {
    fontSize: 15,
    fontFamily: 'Fredoka_600SemiBold',
    color: '#FFFFFF',
  },
  actionSheetItemDesc: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 15,
  },
  actionSheetCancelBtn: {
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetCancelText: {
    fontSize: 14,
    fontFamily: 'Fredoka_600SemiBold',
    color: '#94A3B8',
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


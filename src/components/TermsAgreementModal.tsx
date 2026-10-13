// src/components/TermsAgreementModal.tsx
// Mandatory Terms of Service & Community Guidelines Agreement for Google Play UGC Compliance

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { safetyService, CURRENT_TERMS_VERSION } from '../services/SafetyService';

interface Props {
  visible: boolean;
  myDeviceId: string;
  onAccepted: () => void;
  onCancel?: () => void;
}

const PRIVACY_URL = 'https://raziahmedrz.github.io/truetalkie-privacy-policy/privacy.html';

export default function TermsAgreementModal({
  visible,
  myDeviceId,
  onAccepted,
  onCancel,
}: Props) {
  const [loading, setLoading] = useState(false);

  const handleAgree = async () => {
    setLoading(true);
    try {
      await safetyService.acceptTerms(myDeviceId);
      setLoading(false);
      onAccepted();
    } catch (e) {
      setLoading(false);
      onAccepted();
    }
  };

  const handleOpenPrivacy = () => {
    Linking.openURL(PRIVACY_URL).catch(() => {
      Alert.alert('Privacy Policy', `Visit ${PRIVACY_URL} in your browser.`);
    });
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>COMMUNITY GUIDELINES · v{CURRENT_TERMS_VERSION}</Text>
            </View>
          </View>

          <Text style={styles.title}>Safety & Moderation Policy</Text>
          <Text style={styles.subtitle}>
            True Talkie provides instant real-time push-to-talk voice. To maintain a safe and respectful network, you must agree to our community standards before connecting.
          </Text>

          <ScrollView style={styles.rulesScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.prohibitedHeader}>PROHIBITED CONDUCT ON ALL CHANNELS:</Text>

            <View style={styles.ruleItem}>
              <Text style={styles.ruleIcon}>🚫</Text>
              <View style={styles.ruleTextContainer}>
                <Text style={styles.ruleTitle}>No Harassment or Hate Speech</Text>
                <Text style={styles.ruleDesc}>
                  Verbal abuse, bullying, slurs, targeted threats, or discriminatory language are strictly prohibited.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <Text style={styles.ruleIcon}>🚫</Text>
              <View style={styles.ruleTextContainer}>
                <Text style={styles.ruleTitle}>No Explicit or Offensive Audio</Text>
                <Text style={styles.ruleDesc}>
                  Broadcasting sexually explicit content, vulgar audio, or graphic depictions of violence is not allowed.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <Text style={styles.ruleIcon}>🚫</Text>
              <View style={styles.ruleTextContainer}>
                <Text style={styles.ruleTitle}>No Channel Spam or Noise Jamming</Text>
                <Text style={styles.ruleDesc}>
                  Do not intentionally key the microphone to broadcast high-pitched screeches, siren noises, or disrupt ongoing communications.
                </Text>
              </View>
            </View>

            <View style={styles.ruleItem}>
              <Text style={styles.ruleIcon}>🛡️</Text>
              <View style={styles.ruleTextContainer}>
                <Text style={styles.ruleTitle}>Active User Moderation & Blocking</Text>
                <Text style={styles.ruleDesc}>
                  You have the ability to report and block any abusive participant at any time. Violating devices will be permanently banned from the network.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.privacyLinkRow}
              onPress={handleOpenPrivacy}
              activeOpacity={0.7}
            >
              <Text style={styles.privacyLinkText}>
                📄 Review Full Privacy Policy & Terms of Service →
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Action Row */}
          <View style={styles.footerRow}>
            {onCancel && (
              <TouchableOpacity
                style={styles.declineBtn}
                onPress={onCancel}
                disabled={loading}
                activeOpacity={0.7}
              >
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.agreeBtn, loading && { opacity: 0.7 }]}
              onPress={handleAgree}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#0A0F1D" />
              ) : (
                <Text style={styles.agreeText}>I Agree & Enter Voice Room</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: '#0A0F1D',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 133, 0.35)',
    padding: 24,
    shadowColor: '#00D285',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 12,
  },
  badgeRow: {
    marginBottom: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 210, 133, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 210, 133, 0.3)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#00D285',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 16,
  },
  rulesScroll: {
    maxHeight: 330,
  },
  prohibitedHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#CBD5E1',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  ruleIcon: {
    fontSize: 18,
    marginTop: 2,
  },
  ruleTextContainer: {
    flex: 1,
  },
  ruleTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  ruleDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  privacyLinkRow: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  privacyLinkText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#38BDF8',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  agreeBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#00D285',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D285',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  agreeText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#07090E',
    letterSpacing: 0.2,
  },
});

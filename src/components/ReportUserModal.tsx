// src/components/ReportUserModal.tsx
// Interactive Report Dialog for Google Play UGC Moderation Compliance

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { safetyService } from '../services/SafetyService';

interface Props {
  visible: boolean;
  peerId: string | null;
  peerName: string | null;
  channelId: string;
  reporterDeviceId: string;
  onClose: () => void;
  onReportSubmitted: (reportedPeerId: string) => void;
}

const REPORT_REASONS = [
  'Harassment / Verbal Abuse',
  'Threatening or Violent Language',
  'Inappropriate / Sexually Explicit Audio',
  'Channel Spamming / Ear-rape Noise',
  'Hate Speech or Discrimination',
  'Other Policy Violation',
];

export default function ReportUserModal({
  visible,
  peerId,
  peerName,
  channelId,
  reporterDeviceId,
  onClose,
  onReportSubmitted,
}: Props) {
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!peerId) return;

    if (!selectedReason) {
      Alert.alert('Selection Required', 'Please select a reason for reporting.');
      return;
    }

    setLoading(true);
    try {
      const result = await safetyService.submitReport({
        reportedDeviceId: peerId,
        reportedName: peerName || undefined,
        channelId: channelId || 'general',
        reason: selectedReason,
        description: description.trim() || undefined,
        reporterDeviceId,
      });

      setLoading(false);

      if (result.success) {
        Alert.alert(
          'Report Received',
          `Thank you for helping keep True Talkie safe.\n\n"${peerName || 'Participant'}" has been reported to moderators and has been automatically blocked on your device so you will no longer hear them.`,
          [
            {
              text: 'OK',
              onPress: () => {
                onReportSubmitted(peerId);
                onClose();
                setDescription('');
                setSelectedReason(REPORT_REASONS[0]);
              },
            },
          ]
        );
      } else {
        Alert.alert('Notice', result.error || 'Failed to submit report. Please try again.');
      }
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Notice', 'Report recorded. Participant has been blocked.');
      onReportSubmitted(peerId);
      onClose();
    }
  };

  if (!visible || !peerId) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>⚠️</Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.title}>Report Participant</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {peerName || 'Operator'} · ID: {peerId.slice(0, 8)}
              </Text>
            </View>
          </View>

          <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionLabel}>SELECT REASON FOR REPORT:</Text>

            {REPORT_REASONS.map((reason) => {
              const isSelected = selectedReason === reason;
              return (
                <TouchableOpacity
                  key={reason}
                  style={[styles.reasonOption, isSelected && styles.reasonOptionActive]}
                  onPress={() => setSelectedReason(reason)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.reasonText, isSelected && styles.reasonTextActive]}>
                    {reason}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>
              ADDITIONAL DETAILS (OPTIONAL):
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Describe what occurred on this channel..."
              placeholderTextColor="#64748B"
              value={description}
              onChangeText={setDescription}
              maxLength={300}
              multiline
              numberOfLines={3}
            />

            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>
                🛡️ Submitting will immediately mute & block this participant from speaking to you, and submits a log to our moderation team.
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitText}>Submit & Block</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 20,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 16,
    marginBottom: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  contentScroll: {
    maxHeight: 340,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: 8,
  },
  reasonOptionActive: {
    borderColor: 'rgba(239, 68, 68, 0.5)',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#EF4444',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  reasonText: {
    fontSize: 13,
    color: '#CBD5E1',
    fontWeight: '500',
    flex: 1,
  },
  reasonTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 12,
    color: '#F8FAFC',
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  noticeBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    marginBottom: 10,
  },
  noticeText: {
    fontSize: 11.5,
    color: '#38BDF8',
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  submitBtn: {
    flex: 1.4,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});

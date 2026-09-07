/**
 * SenderScreen.js
 * Authority phone UI.
 *
 * Features:
 *  - 4 alert-type buttons (FLOOD, LANDSLIDE, AVALANCHE, EARTHQUAKE)
 *  - Selected type highlighted with its colour
 *  - Send button broadcasts the selected alert type
 *  - Confirmation timestamp after send
 *  - Delivery stats panel
 *  - Send history log
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useMessage } from '../context/MessageContext';
import { ALERT_TYPES } from '../services/MessageService';

// ─── Helper ───────────────────────────────────────────────────────────────────

function formatTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const ALERT_TYPE_LIST = Object.values(ALERT_TYPES);

// ─── AlertTypeButton ──────────────────────────────────────────────────────────

function AlertTypeButton({ alertDef, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[
        styles.typeButton,
        selected && { backgroundColor: alertDef.color, borderColor: alertDef.color },
      ]}
      onPress={() => onPress(alertDef.key)}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${alertDef.label} alert type`}>
      <Text style={styles.typeIcon}>{alertDef.icon}</Text>
      <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>
        {alertDef.label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SenderScreen() {
  const { isBleReady, bleError, peerCount, sendAlert, sentAlerts, deliveryStats } =
    useMessage();

  const [sending,        setSending]        = useState(false);
  const [selectedType,   setSelectedType]   = useState('FLOOD');
  const [lastSentAt,     setLastSentAt]      = useState(null);
  const [lastSentType,   setLastSentType]    = useState(null);

  const selectedDef = ALERT_TYPES[selectedType];

  const handleSend = useCallback(async () => {
    if (sending || !isBleReady) return;

    setSending(true);
    try {
      await sendAlert(selectedType);
      setLastSentAt(Date.now());
      setLastSentType(selectedType);
    } catch (e) {
      console.error('[SenderScreen] Send failed:', e.message);
    } finally {
      setSending(false);
    }
  }, [sending, isBleReady, sendAlert, selectedType]);

  // ── Status ───────────────────────────────────────────────────────────────────
  const statusColor = isBleReady ? '#27ae60' : bleError ? '#e74c3c' : '#f39c12';
  const statusText  = bleError
    ? `BLE Error: ${bleError}`
    : isBleReady
    ? `● BLE Ready — ${peerCount} peer${peerCount !== 1 ? 's' : ''} connected`
    : '○ Initialising Bluetooth…';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled">
      <StatusBar backgroundColor="#1a1a2e" barStyle="light-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>OFFLINE MESH</Text>
        <Text style={styles.headerSub}>Authority Terminal</Text>
      </View>

      {/* ── Status ── */}
      <View style={[styles.statusBar, { borderLeftColor: statusColor }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
      </View>

      {/* ── Alert type selector ── */}
      <Text style={styles.sectionLabel}>SELECT ALERT TYPE</Text>
      <View style={styles.typeGrid}>
        {ALERT_TYPE_LIST.map(def => (
          <AlertTypeButton
            key={def.key}
            alertDef={def}
            selected={selectedType === def.key}
            onPress={setSelectedType}
          />
        ))}
      </View>

      {/* ── Send button ── */}
      <View style={styles.buttonArea}>
        {!isBleReady && !bleError ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={selectedDef.color} />
            <Text style={styles.loadingText}>Scanning for peers…</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: selectedDef.darkColor, borderColor: selectedDef.color },
              sending         && styles.sendButtonDisabled,
              peerCount === 0 && styles.sendButtonNoPeers,
            ]}
            onPress={handleSend}
            activeOpacity={0.8}
            accessibilityLabel={`Send ${selectedDef.label} alert`}
            accessibilityRole="button"
            accessibilityState={{ disabled: sending || peerCount === 0 }}
            disabled={sending}>
            {sending ? (
              <>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.sendButtonText}>SENDING…</Text>
              </>
            ) : (
              <>
                <Text style={styles.sendButtonIcon}>{selectedDef.icon}</Text>
                <Text style={styles.sendButtonText}>
                  SEND{'\n'}{selectedDef.label} ALERT
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {peerCount === 0 && isBleReady && (
          <Text style={styles.noPeersWarning}>
            ⚠ No peers connected. Ensure all phones have the app open with
            Bluetooth ON.
          </Text>
        )}
      </View>

      {/* ── Confirmation ── */}
      {lastSentAt && lastSentType && (
        <View style={[styles.confirmBox, { borderLeftColor: ALERT_TYPES[lastSentType].color }]}>
          <Text style={[styles.confirmIcon, { color: ALERT_TYPES[lastSentType].color }]}>
            {ALERT_TYPES[lastSentType].icon}
          </Text>
          <View>
            <Text style={styles.confirmText}>
              {ALERT_TYPES[lastSentType].label} alert sent
            </Text>
            <Text style={styles.confirmTime}>at {formatTime(lastSentAt)}</Text>
          </View>
        </View>
      )}

      {/* ── Delivery stats ── */}
      {deliveryStats && (
        <View style={styles.statsBox}>
          <Text style={styles.statsTitle}>Last Delivery Stats</Text>
          <Text style={styles.statsValue}>
            Delivered to: {deliveryStats.count}/{deliveryStats.total} phones
          </Text>
          <Text style={styles.statsValue}>Time: {deliveryStats.ms} ms</Text>
        </View>
      )}

      {/* ── Send history ── */}
      {sentAlerts.length > 0 && (
        <View style={styles.historyContainer}>
          <Text style={styles.historyTitle}>Send History</Text>
          {sentAlerts.map(alert => {
            const def = ALERT_TYPES[alert.type] || ALERT_TYPES.FLOOD;
            return (
              <View key={alert.message_id} style={styles.historyItem}>
                <Text style={[styles.historyBadge, { color: def.color }]}>
                  {def.icon} {def.label}
                </Text>
                <Text style={styles.historyTime}>{formatTime(alert.sentAt)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 4,
  },
  headerSub: {
    fontSize: 13,
    color: '#8888aa',
    letterSpacing: 2,
    marginTop: 4,
  },
  statusBar: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 24,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 11,
    color: '#8888aa',
    letterSpacing: 2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },

  // ── Type selector grid ──
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  typeButton: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16213e',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2a2a4a',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  typeIcon: {
    fontSize: 22,
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#aaaacc',
    letterSpacing: 1,
  },
  typeLabelSelected: {
    color: '#ffffff',
  },

  // ── Send button ──
  buttonArea: {
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#aaaacc',
    fontSize: 16,
  },
  sendButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 12,
    gap: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
    elevation: 2,
  },
  sendButtonNoPeers: {
    opacity: 0.5,
  },
  sendButtonIcon: {
    fontSize: 44,
  },
  sendButtonText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: 1,
  },
  noPeersWarning: {
    marginTop: 14,
    color: '#f39c12',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Confirm ──
  confirmBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  confirmIcon: {
    fontSize: 26,
  },
  confirmText: {
    fontSize: 15,
    color: '#ecf0f1',
    fontWeight: '700',
  },
  confirmTime: {
    fontSize: 13,
    color: '#8888aa',
    marginTop: 2,
  },

  // ── Stats ──
  statsBox: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  statsTitle: {
    fontSize: 11,
    color: '#8888aa',
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  statsValue: {
    fontSize: 15,
    color: '#ecf0f1',
    fontWeight: '600',
    marginBottom: 2,
  },

  // ── History ──
  historyContainer: {
    marginTop: 4,
  },
  historyTitle: {
    fontSize: 11,
    color: '#8888aa',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  historyItem: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyBadge: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyTime: {
    fontSize: 13,
    color: '#8888aa',
  },
});

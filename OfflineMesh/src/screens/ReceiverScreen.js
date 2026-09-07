/**
 * ReceiverScreen.js
 * User phone UI.
 *
 * Shows a full-screen alert overlay styled to the incoming alert type.
 * Each of the 4 types (FLOOD, LANDSLIDE, AVALANCHE, EARTHQUAKE) has its
 * own background colour, icon, and action text.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Animated,
  Vibration,
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

// Vibration pattern: 3 long bursts
const VIBRATION_PATTERN = [0, 500, 200, 500, 200, 1000];

// Border colour per type for history items
const HISTORY_BORDER = {
  FLOOD:      '#FF0000',
  LANDSLIDE:  '#FF8C00',
  AVALANCHE:  '#c8a800',
  EARTHQUAKE: '#8B008B',
};

// ─── Alert Overlay ────────────────────────────────────────────────────────────

function AlertOverlay({ alert, onDismiss }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  // Resolve type definition — fall back to FLOOD if unknown
  const def = ALERT_TYPES[alert.type] || ALERT_TYPES.FLOOD;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5,   useNativeDriver: true }),
    ]).start();

    Vibration.vibrate(VIBRATION_PATTERN);

    return () => Vibration.cancel();
  }, [fadeAnim, scaleAnim]);

  const latencyMs = alert.receivedAt - alert.timestamp;

  return (
    <Animated.View
      style={[styles.alertOverlay, { backgroundColor: def.darkColor, opacity: fadeAnim }]}
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${def.label} alert received. ${def.subtitle}`}>

      <StatusBar backgroundColor={def.darkColor} barStyle="light-content" />

      <Animated.View style={[styles.alertContent, { transform: [{ scale: scaleAnim }] }]}>
        {/* Icon */}
        <Text style={styles.alertIcon}>{def.icon}</Text>

        {/* Alert type badge */}
        <View style={[styles.typeBadge, { borderColor: def.color }]}>
          <Text style={[styles.typeBadgeText, { color: def.color }]}>{def.label}</Text>
        </View>

        {/* Main text */}
        <Text style={styles.alertTitle}>{def.message}</Text>
        <Text style={[styles.alertSubtitle, { color: def.color }]}>{def.subtitle}</Text>

        {/* Metadata */}
        <View style={styles.alertMeta}>
          <Text style={styles.alertMetaText}>
            Received at: {formatTime(alert.receivedAt)}
          </Text>
          <Text style={styles.alertMetaText}>From: Authority Phone</Text>
          {latencyMs > 0 && (
            <Text style={styles.alertMetaText}>Latency: {latencyMs} ms</Text>
          )}
        </View>

        {/* Dismiss */}
        <TouchableOpacity
          style={[styles.dismissButton, { borderColor: def.color }]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Acknowledge and dismiss alert">
          <Text style={styles.dismissText}>ACKNOWLEDGE</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ─── History Item ─────────────────────────────────────────────────────────────

function HistoryItem({ alert }) {
  const def = ALERT_TYPES[alert.type] || ALERT_TYPES.FLOOD;
  return (
    <View style={[styles.historyItem, { borderLeftColor: HISTORY_BORDER[def.key] || '#e74c3c' }]}>
      <View style={styles.historyLeft}>
        <Text style={styles.historyIcon}>{def.icon}</Text>
        <Text style={styles.historyMessage}>{def.message}</Text>
      </View>
      <Text style={styles.historyTime}>{formatTime(alert.receivedAt)}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ReceiverScreen() {
  const {
    currentAlert,
    alertHistory,
    peerCount,
    isBleReady,
    bleError,
    dismissAlert,
  } = useMessage();

  const statusColor = isBleReady ? '#27ae60' : bleError ? '#e74c3c' : '#f39c12';
  const statusText  = bleError
    ? `BLE Error: ${bleError}`
    : isBleReady
    ? `● Listening — ${peerCount} peer${peerCount !== 1 ? 's' : ''} connected`
    : '○ Initialising Bluetooth…';

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#1a1a2e" barStyle="light-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>OFFLINE MESH</Text>
        <Text style={styles.headerSub}>Receiver</Text>
      </View>

      {/* ── Status ── */}
      <View style={[styles.statusBar, { borderLeftColor: statusColor }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
      </View>

      {/* ── Idle state ── */}
      {!isBleReady && !bleError ? (
        <View style={styles.idleContainer}>
          <ActivityIndicator size="large" color="#8888aa" />
          <Text style={styles.idleText}>Scanning for mesh peers…</Text>
        </View>
      ) : (
        <View style={styles.idleContainer}>
          <Text style={styles.idleIcon}>📡</Text>
          <Text style={styles.idleText}>
            {alertHistory.length === 0
              ? 'Waiting for alerts…'
              : `${alertHistory.length} alert${alertHistory.length !== 1 ? 's' : ''} received`}
          </Text>
          {peerCount === 0 && isBleReady && (
            <Text style={styles.noPeersWarning}>
              ⚠ No peers connected. Make sure all phones run the app with Bluetooth ON.
            </Text>
          )}
        </View>
      )}

      {/* ── Alert history ── */}
      {alertHistory.length > 0 && (
        <ScrollView style={styles.historyContainer}>
          <Text style={styles.historyTitle}>Alert History</Text>
          {alertHistory.map(alert => (
            <HistoryItem key={alert.message_id + alert.receivedAt} alert={alert} />
          ))}
        </ScrollView>
      )}

      {/* ── Full-screen alert overlay ── */}
      {currentAlert && (
        <AlertOverlay alert={currentAlert} onDismiss={dismissAlert} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 20,
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
  idleContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  idleIcon: {
    fontSize: 64,
  },
  idleText: {
    fontSize: 18,
    color: '#aaaacc',
    textAlign: 'center',
  },
  noPeersWarning: {
    color: '#f39c12',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  historyContainer: {
    flex: 1,
    marginTop: 8,
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
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  historyIcon: {
    fontSize: 18,
  },
  historyMessage: {
    fontSize: 14,
    color: '#ecf0f1',
    fontWeight: '700',
    flex: 1,
  },
  historyTime: {
    fontSize: 13,
    color: '#8888aa',
    marginLeft: 8,
  },

  // ── Alert overlay ──
  alertOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  alertContent: {
    alignItems: 'center',
    paddingHorizontal: 30,
    gap: 14,
  },
  alertIcon: {
    fontSize: 80,
  },
  typeBadge: {
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 4,
  },
  typeBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
  },
  alertTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
    textAlign: 'center',
  },
  alertSubtitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  alertMeta: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 6,
    marginTop: 6,
  },
  alertMetaText: {
    fontSize: 16,
    color: '#f8f8f8',
    fontWeight: '600',
  },
  dismissButton: {
    marginTop: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 30,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderWidth: 2,
  },
  dismissText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 2,
  },
});

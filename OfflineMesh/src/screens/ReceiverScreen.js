/**
 * ReceiverScreen.js
 *
 * The citizen's screen. Simple, readable, actionable.
 *
 * When an alert arrives:
 *   1. Full-screen overlay appears, coloured per disaster type
 *   2. Phone vibrates urgently
 *   3. User sees: disaster type, action instruction, timestamp, latency
 *   4. Two action buttons:
 *        [ I ACKNOWLEDGE ]  — confirms receipt, sends confirmation back
 *        [ 🆘 SOS ]         — sends GPS location + distress signal to authority
 *   5. After acknowledging, alert dismisses and appears in history
 *
 * When idle:
 *   - Shows BLE peer count and listening status
 *   - Alert history list (type, time)
 */

import React, { useEffect, useRef, useState } from 'react';
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
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { useMessage } from '../context/MessageContext';
import { ALERT_TYPES } from '../services/MessageService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms) {
  const d  = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Vibration pattern — 3 urgent bursts, increasing length
const ALERT_VIBRATION = [0, 400, 150, 600, 150, 1000];
const SOS_VIBRATION   = [0, 300, 100, 300, 100, 300, 100, 900]; // SOS pattern

// ─── GPS helper ───────────────────────────────────────────────────────────────

/**
 * getGpsLocation
 *
 * Attempts to get the device's current GPS coordinates.
 * Returns { lat, lng } or null if unavailable or denied.
 *
 * Uses the built-in Geolocation API from React Native core.
 * For higher accuracy, swap with react-native-geolocation-service
 * and update the import accordingly.
 */
async function getGpsLocation() {
  // Request location permission on Android
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title:   'Location Permission',
          message: 'OfflineMesh needs your location for SOS alerts.',
          buttonPositive: 'Allow',
        },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('[ReceiverScreen] Location permission denied');
        return null;
      }
    } catch (e) {
      console.warn('[ReceiverScreen] Location permission error:', e.message);
      return null;
    }
  }

  return new Promise((resolve) => {
    const { Geolocation } = require('react-native');
    // Fall back to the global if the module isn't separately installed
    const geo = Geolocation || global.navigator?.geolocation;
    if (!geo) { resolve(null); return; }

    geo.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        console.warn('[ReceiverScreen] GPS error:', err.message);
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 },
    );
  });
}

// ─── Alert Overlay ────────────────────────────────────────────────────────────

function AlertOverlay({ alert, onAcknowledge, onSOS, sosState }) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const def       = ALERT_TYPES[alert.type] || ALERT_TYPES.FLOOD;
  const latencyMs = alert.receivedAt - alert.timestamp;

  useEffect(() => {
    // Animate in
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5,   useNativeDriver: true }),
    ]).start();

    // Urgent vibration
    Vibration.vibrate(ALERT_VIBRATION);
    return () => Vibration.cancel();
  }, [fadeAnim, scaleAnim]);

  return (
    <Animated.View
      style={[styles.alertOverlay, { backgroundColor: def.darkColor, opacity: fadeAnim }]}
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`${def.label} alert received. ${def.subtitle}`}>

      <StatusBar backgroundColor={def.darkColor} barStyle="light-content" />

      <Animated.View style={[styles.alertContent, { transform: [{ scale: scaleAnim }] }]}>

        {/* Disaster icon */}
        <Text style={styles.alertIcon}>{def.icon}</Text>

        {/* Type badge */}
        <View style={[styles.typeBadge, { borderColor: def.color }]}>
          <Text style={[styles.typeBadgeText, { color: def.color }]}>{def.label}</Text>
        </View>

        {/* Main message */}
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
          {alert.channel && (
            <Text style={styles.alertMetaText}>
              Via: {alert.channel === 'push' ? '🌐 PUSH' : '📡 BLE'}
            </Text>
          )}
        </View>

        {/* ── I ACKNOWLEDGE button ── */}
        <TouchableOpacity
          style={[styles.acknowledgeButton, { backgroundColor: def.color }]}
          onPress={onAcknowledge}
          accessibilityRole="button"
          accessibilityLabel="I acknowledge this alert">
          <Text style={styles.acknowledgeText}>✓  I ACKNOWLEDGE</Text>
        </TouchableOpacity>

        {/* ── SOS button ── */}
        <TouchableOpacity
          style={[
            styles.sosButton,
            sosState === 'sending' && styles.sosButtonSending,
            sosState === 'sent'    && styles.sosButtonSent,
          ]}
          onPress={onSOS}
          disabled={sosState === 'sending' || sosState === 'sent'}
          accessibilityRole="button"
          accessibilityLabel="Send SOS with my location">
          {sosState === 'sending' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : sosState === 'sent' ? (
            <Text style={styles.sosText}>✓ SOS Sent</Text>
          ) : (
            <Text style={styles.sosText}>🆘  SOS — Send My Location</Text>
          )}
        </TouchableOpacity>

      </Animated.View>
    </Animated.View>
  );
}

// ─── History Item ─────────────────────────────────────────────────────────────

function HistoryItem({ alert }) {
  const def = ALERT_TYPES[alert.type] || ALERT_TYPES.FLOOD;
  const borderColor = {
    FLOOD:      '#FF0000',
    LANDSLIDE:  '#FF8C00',
    AVALANCHE:  '#c8a800',
    EARTHQUAKE: '#8B008B',
  }[def.key] || '#e74c3c';

  return (
    <View style={[styles.historyItem, { borderLeftColor: borderColor }]}>
      <View style={styles.historyLeft}>
        <Text style={styles.historyIcon}>{def.icon}</Text>
        <View>
          <Text style={styles.historyMessage}>{def.message}</Text>
          {alert.acknowledged && (
            <Text style={styles.historyAcked}>✓ Acknowledged</Text>
          )}
        </View>
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
    acknowledgeAlert,
    sendSOS,
  } = useMessage();

  // SOS state per alert: null | 'sending' | 'sent' | 'failed'
  const [sosState, setSosState] = useState(null);

  // Reset SOS state whenever the alert changes
  useEffect(() => {
    setSosState(null);
  }, [currentAlert?.message_id]);

  // ── Acknowledge handler ─────────────────────────────────────────────────
  const handleAcknowledge = () => {
    if (acknowledgeAlert) acknowledgeAlert(currentAlert);
    dismissAlert();
  };

  // ── SOS handler ─────────────────────────────────────────────────────────
  const handleSOS = async () => {
    setSosState('sending');
    Vibration.vibrate(SOS_VIBRATION);

    try {
      const location = await getGpsLocation();
      if (sendSOS) {
        await sendSOS({ alert: currentAlert, location });
      }
      setSosState('sent');
    } catch (e) {
      console.error('[ReceiverScreen] SOS failed:', e.message);
      setSosState('failed');
    }
  };

  // ── Status bar ───────────────────────────────────────────────────────────
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

      {/* ── Full-screen overlay ── */}
      {currentAlert && (
        <AlertOverlay
          alert={currentAlert}
          onAcknowledge={handleAcknowledge}
          onSOS={handleSOS}
          sosState={sosState}
        />
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
  },
  historyAcked: {
    fontSize: 11,
    color: '#27ae60',
    marginTop: 2,
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
    paddingHorizontal: 28,
    gap: 12,
    width: '100%',
  },
  alertIcon: {
    fontSize: 72,
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
    fontSize: 36,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
    textAlign: 'center',
  },
  alertSubtitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  alertMeta: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 4,
    marginTop: 4,
    width: '100%',
  },
  alertMetaText: {
    fontSize: 14,
    color: '#f8f8f8',
    fontWeight: '600',
  },

  // ── Acknowledge button ──
  acknowledgeButton: {
    borderRadius: 30,
    paddingHorizontal: 32,
    paddingVertical: 16,
    marginTop: 8,
    width: '100%',
    alignItems: 'center',
    elevation: 4,
  },
  acknowledgeText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
  },

  // ── SOS button ──
  sosButton: {
    borderRadius: 30,
    paddingHorizontal: 32,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#7f0000',
    borderWidth: 2,
    borderColor: '#ef4444',
    elevation: 4,
  },
  sosButtonSending: {
    backgroundColor: '#5a0000',
    opacity: 0.8,
  },
  sosButtonSent: {
    backgroundColor: '#166534',
    borderColor: '#22c55e',
  },
  sosText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});

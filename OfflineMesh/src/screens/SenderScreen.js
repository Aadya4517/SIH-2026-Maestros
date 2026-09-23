/**
 * SenderScreen.js
 *
 * The authority phone's command screen. Everything a rescue coordinator
 * needs to send a disaster alert — nothing they don't.
 *
 * Features (in order of appearance):
 *   1. Connectivity badge  — shows ONLINE / OFFLINE / detecting
 *   2. Alert type grid     — FLOOD, LANDSLIDE, AVALANCHE, EARTHQUAKE
 *   3. Severity selector   — One-time / Moderate (3×) / CRITICAL (5×)
 *   4. CONFIRM gate        — must type "CONFIRM" to prevent accidents
 *   5. SEND ALERT button   — one tap, system routes automatically
 *   6. Send status banner  — shows which channel(s) were used
 *   7. Send history log    — timestamped record of past sends
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useMessage } from '../context/MessageContext';
import { ALERT_TYPES } from '../services/MessageService';
import {
  SEVERITY_CONFIG,
  checkInternetConnection,
} from '../services/HybridAlertService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms) {
  const d  = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const ALERT_TYPE_LIST   = Object.values(ALERT_TYPES);
const SEVERITY_LIST     = Object.values(SEVERITY_CONFIG);
const CONFIRM_WORD      = 'CONFIRM';

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function SeverityButton({ config, selected, onPress }) {
  const color = selected
    ? config.key === 'CRITICAL' ? '#ef4444'
    : config.key === 'MODERATE' ? '#f59e0b'
    : '#22c55e'
    : '#2a2a4a';

  return (
    <TouchableOpacity
      style={[
        styles.severityButton,
        selected && { borderColor: color, backgroundColor: `${color}18` },
      ]}
      onPress={() => onPress(config.key)}
      activeOpacity={0.75}
      accessibilityRole="radio"
      accessibilityState={{ selected }}>
      <Text style={styles.severityIcon}>{config.icon}</Text>
      <View style={styles.severityTextWrap}>
        <Text style={[styles.severityLabel, selected && { color }]}>
          {config.label}
        </Text>
        <Text style={styles.severityDesc}>{config.description}</Text>
      </View>
      {selected && (
        <View style={[styles.severityCheck, { backgroundColor: color }]}>
          <Text style={styles.severityCheckText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SenderScreen() {
  const {
    isBleReady,
    bleError,
    peerCount,
    sendAlert,
    sentAlerts,
    deliveryStats,
    lastSendStatus,
  } = useMessage();

  // ── Local state ─────────────────────────────────────────────────────────────
  const [sending,         setSending]         = useState(false);
  const [selectedType,    setSelectedType]    = useState('FLOOD');
  const [selectedSeverity,setSelectedSeverity]= useState('ONE_TIME');
  const [confirmText,     setConfirmText]     = useState('');
  const [lastSentAt,      setLastSentAt]      = useState(null);
  const [lastSentType,    setLastSentType]    = useState(null);
  const [isOnline,        setIsOnline]        = useState(null); // null = checking
  const [repeatCountdown, setRepeatCountdown] = useState(null); // "Repeat 2/4 in 1m 58s"

  const countdownRef = useRef(null);

  const selectedDef      = ALERT_TYPES[selectedType];
  const selectedSevConf  = SEVERITY_CONFIG[selectedSeverity];
  const confirmReady     = confirmText.toUpperCase() === CONFIRM_WORD;

  // ── Check internet on mount and periodically ─────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function check() {
      const online = await checkInternetConnection();
      if (mounted) setIsOnline(online);
    }

    check();
    const interval = setInterval(check, 8000); // re-check every 8 s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // ── Cleanup countdown on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearTimeout(countdownRef.current);
    };
  }, []);

  // ── Send handler ─────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (sending || !isBleReady || !confirmReady) return;

    setSending(true);
    setConfirmText('');

    try {
      await sendAlert(selectedType, selectedSeverity);
      setLastSentAt(Date.now());
      setLastSentType(selectedType);
    } catch (e) {
      console.error('[SenderScreen] Send failed:', e.message);
    } finally {
      setSending(false);
    }
  }, [sending, isBleReady, confirmReady, sendAlert, selectedType, selectedSeverity]);

  // ── Connectivity status ─────────────────────────────────────────────────
  const bleStatusColor = isBleReady ? '#27ae60' : bleError ? '#e74c3c' : '#f39c12';
  const bleStatusText  = bleError
    ? `BLE Error: ${bleError}`
    : isBleReady
    ? `● BLE Ready — ${peerCount} peer${peerCount !== 1 ? 's' : ''} connected`
    : '○ Initialising Bluetooth…';

  const netStatusColor =
    isOnline === null  ? '#f39c12'
    : isOnline         ? '#22c55e'
    :                    '#ef4444';

  const netStatusText =
    isOnline === null  ? '○ Checking connectivity…'
    : isOnline         ? '🌐 Online — PUSH + BLE available'
    :                    '📡 Offline — BLE mesh only';

  // ── Can send? ─────────────────────────────────────────────────────────────
  const canSend = isBleReady && !sending && confirmReady;

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

      {/* ── Status row ── */}
      <View style={[styles.statusBar, { borderLeftColor: bleStatusColor }]}>
        <Text style={[styles.statusText, { color: bleStatusColor }]}>
          {bleStatusText}
        </Text>
      </View>
      <View style={[styles.statusBar, { borderLeftColor: netStatusColor, marginBottom: 24 }]}>
        <Text style={[styles.statusText, { color: netStatusColor }]}>
          {netStatusText}
        </Text>
      </View>

      {/* ── Alert type ── */}
      <Text style={styles.sectionLabel}>1. SELECT ALERT TYPE</Text>
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

      {/* ── Severity ── */}
      <Text style={styles.sectionLabel}>2. SELECT SEVERITY</Text>
      <View style={styles.severityList}>
        {SEVERITY_LIST.map(cfg => (
          <SeverityButton
            key={cfg.key}
            config={cfg}
            selected={selectedSeverity === cfg.key}
            onPress={setSelectedSeverity}
          />
        ))}
      </View>

      {/* ── CONFIRM gate ── */}
      <Text style={styles.sectionLabel}>3. CONFIRM INTENT</Text>
      <View style={styles.confirmGate}>
        <Text style={styles.confirmInstruction}>
          Type <Text style={styles.confirmWord}>CONFIRM</Text> to unlock the send button.
          This prevents accidental alerts.
        </Text>
        <TextInput
          style={[
            styles.confirmInput,
            confirmReady && styles.confirmInputReady,
          ]}
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder="Type CONFIRM here…"
          placeholderTextColor="#444466"
          autoCapitalize="characters"
          maxLength={7}
          accessibilityLabel="Type CONFIRM to enable sending"
        />
        {confirmReady && (
          <Text style={styles.confirmReadyText}>✓ Ready to send</Text>
        )}
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
              !canSend && styles.sendButtonLocked,
            ]}
            onPress={handleSend}
            activeOpacity={0.8}
            accessibilityLabel={`Send ${selectedDef.label} alert`}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}>
            {sending ? (
              <>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.sendButtonText}>SENDING…</Text>
              </>
            ) : (
              <>
                <Text style={styles.sendButtonIcon}>{selectedDef.icon}</Text>
                <Text style={styles.sendButtonText}>SEND ALERT</Text>
                {!confirmReady && (
                  <Text style={styles.sendButtonLockHint}>🔒 Type CONFIRM first</Text>
                )}
              </>
            )}
          </TouchableOpacity>
        )}

        {peerCount === 0 && isBleReady && (
          <Text style={styles.noPeersWarning}>
            ⚠ No BLE peers connected. Make sure all phones have the app open with Bluetooth ON.
          </Text>
        )}
      </View>

      {/* ── Send status banner ── */}
      {lastSendStatus ? (
        <View style={[
          styles.statusBanner,
          lastSendStatus.includes('❌') ? styles.statusBannerFail : styles.statusBannerOk,
        ]}>
          <Text style={styles.statusBannerText}>{lastSendStatus}</Text>
        </View>
      ) : lastSentAt && lastSentType ? (
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
      ) : null}

      {/* ── Delivery stats ── */}
      {deliveryStats && (
        <View style={styles.statsBox}>
          <Text style={styles.statsTitle}>Last BLE Delivery</Text>
          <Text style={styles.statsValue}>
            Delivered to: {deliveryStats.count}/{deliveryStats.total} phones
          </Text>
          <Text style={styles.statsValue}>Round-trip: {deliveryStats.ms} ms</Text>
        </View>
      )}

      {/* ── Send history ── */}
      {sentAlerts.length > 0 && (
        <View style={styles.historyContainer}>
          <Text style={styles.historyTitle}>Send History</Text>
          {sentAlerts.map(alert => {
            const def = ALERT_TYPES[alert.type] || ALERT_TYPES.FLOOD;
            const sevConf = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.ONE_TIME;
            return (
              <View key={alert.message_id} style={styles.historyItem}>
                <View style={styles.historyLeft}>
                  <Text style={[styles.historyBadge, { color: def.color }]}>
                    {def.icon} {def.label}
                  </Text>
                  <Text style={styles.historySeverity}>{sevConf.icon}</Text>
                </View>
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
    paddingBottom: 40,
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
    marginBottom: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 11,
    color: '#8888aa',
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 4,
    textTransform: 'uppercase',
  },

  // ── Alert type grid ──
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
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

  // ── Severity ──
  severityList: {
    gap: 8,
    marginBottom: 20,
  },
  severityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2a2a4a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  severityIcon: {
    fontSize: 20,
  },
  severityTextWrap: {
    flex: 1,
  },
  severityLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#aaaacc',
  },
  severityDesc: {
    fontSize: 11,
    color: '#555577',
    marginTop: 2,
  },
  severityCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  severityCheckText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '900',
  },

  // ── CONFIRM gate ──
  confirmGate: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a4a',
    padding: 14,
    marginBottom: 20,
    gap: 10,
  },
  confirmInstruction: {
    fontSize: 13,
    color: '#8888aa',
    lineHeight: 20,
  },
  confirmWord: {
    color: '#f1c40f',
    fontWeight: '700',
  },
  confirmInput: {
    backgroundColor: '#0d0d1a',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2a2a4a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 6,
  },
  confirmInputReady: {
    borderColor: '#27ae60',
  },
  confirmReadyText: {
    fontSize: 13,
    color: '#27ae60',
    fontWeight: '700',
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
    gap: 6,
  },
  sendButtonLocked: {
    opacity: 0.35,
    elevation: 2,
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
  sendButtonLockHint: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  noPeersWarning: {
    marginTop: 14,
    color: '#f39c12',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Status banner ──
  statusBanner: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  statusBannerOk: {
    backgroundColor: 'rgba(39,174,96,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(39,174,96,0.3)',
  },
  statusBannerFail: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  statusBannerText: {
    fontSize: 14,
    color: '#ecf0f1',
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Confirm box (legacy style after send) ──
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
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyBadge: {
    fontSize: 14,
    fontWeight: '700',
  },
  historySeverity: {
    fontSize: 14,
  },
  historyTime: {
    fontSize: 13,
    color: '#8888aa',
  },
});

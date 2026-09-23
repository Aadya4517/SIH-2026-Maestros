/**
 * MessageContext.js
 *
 * The central nervous system of the OfflineMesh app. Every screen gets
 * its data and actions from here via the useMessage() hook.
 *
 * What changed in this version:
 *   - sendAlert() now routes through HybridAlertService (PUSH + BLE auto)
 *   - acknowledgeAlert() sends a confirmation message back via BLE
 *   - sendSOS() broadcasts a GPS+distress message via BLE
 *   - Alert repeats are managed via HybridAlertService.scheduleRepeats()
 *   - lastSendStatus shows the routing result on SenderScreen
 *   - confirmations[] tracks who has acknowledged on the authority phone
 *
 * BLE init sequence (unchanged — do not modify):
 *   1. Request Android permissions
 *   2. Wait for Bluetooth adapter
 *   3. Start peripheral (GATT server + advertising)
 *   4. Scan for peers
 *   5. Listen for messages (peripheral + central paths)
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';

import {
  requestAndroidPermissions,
  waitForBluetooth,
  startPeripheral,
  scanForDevices,
  broadcastAlert,
  listenForMessages,
  getPeerCount,
  onPeerListChanged,
  destroyBleManager,
} from '../services/BleService';

import {
  createMessage,
  handleIncomingMessage,
} from '../services/MessageService';

import {
  sendAlertAutomatic,
  scheduleRepeats,
  cancelAllRepeats,
} from '../services/HybridAlertService';

import {
  publishDashboardState,
} from '../services/DashboardBridgeService';

const MessageContext = createContext(null);

export function MessageProvider({ children }) {

  // ─── Core alert state ─────────────────────────────────────────────────────
  const [currentAlert,        setCurrentAlert]        = useState(null);
  const [alertHistory,        setAlertHistory]        = useState([]);
  const [peerCount,           setPeerCount]           = useState(0);
  const [isBleReady,          setIsBleReady]          = useState(false);
  const [bleError,            setBleError]            = useState(null);
  const [sentAlerts,          setSentAlerts]          = useState([]);
  const [deliveryStats,       setDeliveryStats]       = useState(null);
  const [connectedDevices,    setConnectedDevices]    = useState([]);
  const [lastAlertRecipients, setLastAlertRecipients] = useState(new Set());

  // ─── New state for hybrid features ───────────────────────────────────────
  // Status text from the last send (e.g. "✅ Sent via PUSH + BLE")
  const [lastSendStatus,   setLastSendStatus]   = useState(null);
  // Map of message_id → { phoneId, time, label } for acknowledgements
  const [confirmations,    setConfirmations]    = useState({});
  // List of SOS events received on the authority phone
  const [sosEvents,        setSosEvents]        = useState([]);

  const onNewAlertRef = useRef(null);

  // ─── BLE initialisation ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function initBle() {
      try {
        // Step 1: Android permissions
        const granted = await requestAndroidPermissions();
        if (!granted) {
          setBleError('Bluetooth permissions denied. Go to Settings → Apps → OfflineMesh → Permissions.');
          return;
        }
        if (cancelled) return;

        // Step 2: Wait for Bluetooth adapter
        await waitForBluetooth();
        if (cancelled) return;

        // Step 3: Start GATT server + advertising
        // This phone is now discoverable by other OfflineMesh phones.
        const peripheralStarted = await startPeripheral();
        if (!peripheralStarted) {
          setBleError('BLE peripheral could not start. Restart Bluetooth and reopen the app.');
          return;
        }
        if (cancelled) return;

        // Step 4: Scan for peers
        await scanForDevices((deviceId, deviceName) => {
          setConnectedDevices(prev => {
            if (prev.find(d => d.id === deviceId)) return prev;
            return [
              ...prev,
              {
                id:        deviceId,
                label:     deviceName || `Phone ${prev.length + 2}`,
                connected: true,
                rssi:      null, // real RSSI not available from GATT writes
              },
            ];
          });
        });
        if (cancelled) return;

        // Step 5: Keep peer count in sync
        onPeerListChanged(count => {
          if (cancelled) return;
          setPeerCount(count);
          setConnectedDevices(prev =>
            prev.map((d, idx) => ({ ...d, connected: idx < count })),
          );
          _publishNetworkState(count);
        });

        // Step 6: Listen for incoming messages (central path via ble-plx)
        listenForMessages(message => {
          if (onNewAlertRef.current) onNewAlertRef.current(message);
        });

        if (!cancelled) {
          setIsBleReady(true);
          console.log('[Context] ✓ BLE ready — peripheral advertising, scanning active');
        }

      } catch (e) {
        console.error('[Context] BLE init failed:', e?.message);
        if (!cancelled) setBleError(e?.message || 'BLE initialisation failed');
      }
    }

    initBle();

    return () => {
      cancelled = true;
      console.log('[Context] App closing — shutting down BLE and repeats');
      cancelAllRepeats();
      destroyBleManager();
    };
  }, []);

  // ─── Incoming message router ──────────────────────────────────────────────
  // Using a ref so we never need to re-register the BLE listener.
  useEffect(() => {
    onNewAlertRef.current = async (rawMessage) => {

      // ── Handle acknowledgement messages ─────────────────────────────────
      if (rawMessage?.type === 'ACK') {
        setConfirmations(prev => ({
          ...prev,
          [rawMessage.ack_for]: {
            phoneId: rawMessage.sender_id,
            label:   rawMessage.senderLabel || rawMessage.sender_id,
            time:    rawMessage.timestamp,
          },
        }));
        return; // don't display ACK as an alert
      }

      // ── Handle SOS messages ──────────────────────────────────────────────
      if (rawMessage?.type === 'SOS') {
        setSosEvents(prev => [{
          sender_id:  rawMessage.sender_id,
          lat:        rawMessage.lat,
          lng:        rawMessage.lng,
          timestamp:  rawMessage.timestamp,
          message_id: rawMessage.message_id,
        }, ...prev]);
        return; // don't display SOS as a regular alert
      }

      // ── Handle regular alerts ────────────────────────────────────────────
      await handleIncomingMessage(rawMessage, (message) => {
        const received = {
          ...message,
          receivedAt: Date.now(),
          // Mark which channel delivered it (push arrives via FCM, ble via this path)
          channel: 'ble',
        };
        setCurrentAlert(received);
        setAlertHistory(prev => [received, ...prev]);

        // Forward telemetry to dashboard bridge (fire-and-forget)
        _publishReceivedAlert(received).catch(() => {});
      });
    };
  }, []);

  // ─── Safety-net peer count poll ───────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setPeerCount(getPeerCount()), 2000);
    return () => clearInterval(interval);
  }, []);

  // ─── sendAlert ────────────────────────────────────────────────────────────
  /**
   * Called by SenderScreen when the user taps SEND ALERT.
   *
   * @param {string} type      'FLOOD' | 'LANDSLIDE' | 'AVALANCHE' | 'EARTHQUAKE'
   * @param {string} severity  'ONE_TIME' | 'MODERATE' | 'CRITICAL'
   */
  const sendAlert = useCallback(async (type = 'FLOOD', severity = 'ONE_TIME') => {
    const message = createMessage(type);
    // Attach severity so history items can show the repeat badge
    message.severity = severity;

    const sentAt = Date.now();
    setSentAlerts(prev => [{ ...message, sentAt }, ...prev]);

    // ── Smart routing (PUSH if online, BLE always) ─────────────────────────
    const { statusText, bleResults, isOnline, anySuccess } =
      await sendAlertAutomatic(message);

    setLastSendStatus(statusText);

    const elapsed      = Date.now() - sentAt;
    const successCount = Object.values(bleResults).filter(Boolean).length;

    // Build per-phone delivery records (authority-side only, no fake RSSI)
    const perPhone = Object.entries(bleResults).map(([phone_id, received], idx) => ({
      phone_id,
      label:             `Phone ${idx + 2}`,
      received,
      delivery_time_ms:  received ? elapsed : null,
      sent_timestamp:    sentAt,
      received_timestamp: received ? sentAt + elapsed : null,
      // RSSI intentionally omitted — not available from GATT writes
    }));

    setDeliveryStats({ count: successCount, ms: elapsed, total: peerCount, type, perPhone });

    setLastAlertRecipients(new Set(
      Object.entries(bleResults).filter(([, ok]) => ok).map(([id]) => id),
    ));

    // ── Schedule repeats for MODERATE / CRITICAL ───────────────────────────
    scheduleRepeats(
      message.message_id,
      message,
      severity,
      (repeatNum, result) => {
        // Update status text on each repeat
        setLastSendStatus(`🔄 Repeat ${repeatNum}: ${result.statusText}`);
      },
    );

    // ── Dashboard telemetry ────────────────────────────────────────────────
    _publishSendTelemetry(message, perPhone, successCount, elapsed, peerCount)
      .catch(() => {});

    return { message, bleResults, elapsed, anySuccess };
  }, [peerCount]);

  // ─── acknowledgeAlert ─────────────────────────────────────────────────────
  /**
   * Called when the receiver taps "I ACKNOWLEDGE".
   * Sends an ACK message back over BLE so the authority phone knows.
   *
   * @param {object} alert  the alert being acknowledged
   */
  const acknowledgeAlert = useCallback(async (alert) => {
    if (!alert) return;

    const ackMessage = {
      message_id: `ack-${Date.now()}`,
      type:       'ACK',
      ack_for:    alert.message_id,  // which alert this confirms
      sender_id:  'local',           // replaced by DEVICE_ID in production
      timestamp:  Date.now(),
      ttl:        1,                 // ACK only needs 1 hop back to authority
    };

    try {
      await broadcastAlert(ackMessage);
      console.log('[Context] ✓ ACK sent for', alert.message_id);
    } catch (e) {
      console.warn('[Context] ACK send failed:', e.message);
    }

    // Mark as acknowledged in local history
    setAlertHistory(prev =>
      prev.map(a =>
        a.message_id === alert.message_id ? { ...a, acknowledged: true } : a,
      ),
    );
  }, []);

  // ─── sendSOS ──────────────────────────────────────────────────────────────
  /**
   * Called when the receiver taps the SOS button.
   * Broadcasts a distress message with GPS coordinates over BLE.
   *
   * @param {object} param0  { alert, location: { lat, lng } | null }
   */
  const sendSOS = useCallback(async ({ alert, location }) => {
    const sosMessage = {
      message_id: `sos-${Date.now()}`,
      type:       'SOS',
      sender_id:  'local',
      lat:        location?.lat ?? null,
      lng:        location?.lng ?? null,
      ack_for:    alert?.message_id ?? null,
      timestamp:  Date.now(),
      ttl:        3,  // enough hops to reach authority through relay
    };

    try {
      await broadcastAlert(sosMessage);
      console.log('[Context] ✓ SOS sent', location ? `@ ${location.lat},${location.lng}` : '(no GPS)');
    } catch (e) {
      console.warn('[Context] SOS send failed:', e.message);
      throw e; // propagate so ReceiverScreen can show 'failed' state
    }
  }, []);

  // ─── dismissAlert ────────────────────────────────────────────────────────
  const dismissAlert = useCallback(() => setCurrentAlert(null), []);

  // ─── Dashboard bridge helpers (fire-and-forget) ────────────────────────
  function _publishNetworkState(count) {
    try {
      publishDashboardState({
        source: 'authority',
        updatedAt: new Date().toISOString(),
        networkStatus: {
          online: true,
          connectedDevices: count + 1,
          totalDevices:     count + 1,
          activeAlerts:     0,
          lastSync:         new Date().toISOString(),
          activeConnections: count,
          alertsRelayed:    0,
          healthStatus:     count > 0 ? 'HEALTHY' : 'CRITICAL',
        },
      });
    } catch (_) {}
  }

  async function _publishReceivedAlert(received) {
    await publishDashboardState({
      source: 'peer',
      updatedAt: new Date().toISOString(),
      latestReceivedAlert: received,
    });
  }

  async function _publishSendTelemetry(message, perPhone, successCount, elapsed, peers) {
    await publishDashboardState({
      source: 'authority',
      updatedAt: new Date().toISOString(),
      networkStatus: {
        online: true,
        connectedDevices: peers + 1,
        totalDevices:     peers + 1,
        activeAlerts:     1,
        lastSync:         new Date().toISOString(),
        activeConnections: peers,
        alertsRelayed:    0,
        healthStatus:     peers > 0 ? 'HEALTHY' : 'CRITICAL',
      },
      latestAlert: {
        id:               message.message_id,
        type:             message.type,
        severity:         'HIGH',
        area:             'OfflineMesh live network',
        timestamp:        new Date(message.timestamp).toISOString(),
        originDevice:     'gateway-local',
        devicesReached:   successCount,
        totalDevices:     peers + 1,
        status:           'ACTIVE',
        avgDeliveryMs:    elapsed,
        unreachableDevices: perPhone.filter(p => !p.received).map(p => p.phone_id),
      },
      deliveryMetrics: {
        totalReached:       successCount,
        totalDevices:       peers,
        successRate:        peers > 0 ? Math.round((successCount / peers) * 100) : 0,
        avgDeliveryMs:      elapsed,
        unreachable:        peers - successCount,
        latestAlertReached: successCount,
        latestAlertTotal:   peers,
        history: [{
          time:      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          delivered: successCount,
          failed:    peers - successCount,
        }],
      },
    });
  }

  // ─── Context value ────────────────────────────────────────────────────────
  return (
    <MessageContext.Provider value={{
      currentAlert,
      alertHistory,
      peerCount,
      isBleReady,
      bleError,
      sentAlerts,
      deliveryStats,
      connectedDevices,
      lastAlertRecipients,
      lastSendStatus,
      confirmations,
      sosEvents,
      sendAlert,
      acknowledgeAlert,
      sendSOS,
      dismissAlert,
    }}>
      {children}
    </MessageContext.Provider>
  );
}

/**
 * useMessage — the hook every screen calls to get state and actions.
 * Must be inside a <MessageProvider>.
 */
export function useMessage() {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error('useMessage must be used inside <MessageProvider>');
  return ctx;
}

/**
 * MessageContext.js
 *
 * The central nervous system of the OfflineMesh app. Every screen gets
 * its data and actions from here via the useMessage() hook.
 *
 * On startup it runs the full BLE initialisation sequence:
 *   1. Request Android permissions
 *   2. Wait for Bluetooth adapter to be on
 *   3. Start the PERIPHERAL — this phone starts advertising and opens
 *      its GATT server so other phones can discover and write to it
 *   4. Start SCANNING — discover nearby phones and connect to them
 *   5. Listen for incoming messages from both the peripheral (native events)
 *      and the central (ble-plx monitor)
 *
 * On shutdown it stops everything cleanly so the next app launch is fresh.
 *
 * FUTURE INTEGRATION:
 *   When the OfflineMesh gateway backend exists, replace the BLE calls
 *   here with WebSocket subscriptions. The state shape stays the same.
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
  stopPeripheral,
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

const MessageContext = createContext(null);

export function MessageProvider({ children }) {
  // ─── State ──────────────────────────────────────────────────────────────────

  // The alert currently being shown as a full-screen overlay (null = no overlay)
  const [currentAlert,        setCurrentAlert]        = useState(null);
  // All alerts received this session — shown in the history list
  const [alertHistory,        setAlertHistory]        = useState([]);
  // How many other OfflineMesh phones we're connected to right now
  const [peerCount,           setPeerCount]           = useState(0);
  // Becomes true once BLE is fully set up and ready to send/receive
  const [isBleReady,          setIsBleReady]          = useState(false);
  // Human-readable error if something goes wrong during setup
  const [bleError,            setBleError]            = useState(null);
  // Alerts this device has sent (shown on SenderScreen history)
  const [sentAlerts,          setSentAlerts]          = useState([]);
  // Delivery stats for the most recent send (count, ms, per-phone breakdown)
  const [deliveryStats,       setDeliveryStats]       = useState(null);
  // List of peer devices — populated as phones connect (used by NetworkViz in dashboard)
  const [connectedDevices,    setConnectedDevices]    = useState([]);
  // IDs of peers that received the last alert — used for glow effects
  const [lastAlertRecipients, setLastAlertRecipients] = useState(new Set());

  // A ref to the incoming alert handler so we can update it without
  // removing and re-adding the BLE event listener on every render
  const onNewAlertRef = useRef(null);

  // ─── BLE initialisation ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function initBle() {
      try {
        // ── Step 1: Permissions ────────────────────────────────────────────────
        // Android requires explicit permission grants before any BLE use.
        const granted = await requestAndroidPermissions();
        if (!granted) {
          setBleError('Bluetooth permissions denied. Please go to Settings → Apps → OfflineMesh → Permissions and enable Bluetooth.');
          return;
        }
        if (cancelled) return;

        // ── Step 2: Adapter ready ─────────────────────────────────────────────
        // We can't scan or advertise until the Bluetooth adapter is powered on.
        await waitForBluetooth();
        if (cancelled) return;

        // ── Step 3: Start peripheral (advertising + GATT server) ──────────────
        // This is what makes THIS phone visible to other OfflineMesh phones.
        // The native Kotlin module opens the GATT server and starts advertising.
        // The callback here is called when another phone writes a message to us.
        startPeripheral((incomingMessage) => {
          // Peripheral received a write — route it through the alert handler
          if (onNewAlertRef.current) {
            onNewAlertRef.current(incomingMessage);
          }
        });
        if (cancelled) return;

        // ── Step 4: Start scanning for other phones ────────────────────────────
        // We look for phones advertising our SERVICE_UUID and connect to them.
        // Once connected, we can write alerts to their characteristics.
        await scanForDevices((deviceId, deviceName) => {
          console.log('[Context] Peer connected:', deviceId);
          // Track connected devices for the network visualization
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

        // ── Step 5: Track peer count changes ───────────────────────────────────
        onPeerListChanged(count => {
          if (!cancelled) {
            setPeerCount(count);
            setConnectedDevices(prev =>
              prev.map((d, idx) => ({ ...d, connected: idx < count })),
            );
          }
        });

        // ── Step 6: Listen for central-side messages (ble-plx monitor) ─────────
        // This catches writes from phones using the central write path.
        // Peripheral writes (via native GATT server) are handled in step 3.
        listenForMessages((incomingMessage) => {
          if (onNewAlertRef.current) {
            onNewAlertRef.current(incomingMessage);
          }
        });

        if (!cancelled) {
          setIsBleReady(true);
          console.log('[Context] ✓ BLE ready — peripheral advertising, scanning for peers');
        }

      } catch (e) {
        console.error('[Context] BLE init failed:', e?.message);
        if (!cancelled) setBleError(e?.message || 'BLE initialisation failed');
      }
    }

    initBle();

    return () => {
      cancelled = true;
      console.log('[Context] App closing — shutting down BLE');
      stopPeripheral(); // stop advertising and close GATT server
      destroyBleManager(); // stop scan, disconnect peers, destroy manager
    };
  }, []);

  // ─── Alert handler (kept in ref so BLE listener never needs re-registering) ──
  useEffect(() => {
    onNewAlertRef.current = async (rawMessage) => {
      await handleIncomingMessage(rawMessage, (message) => {
        const received = { ...message, receivedAt: Date.now() };
        setCurrentAlert(received);
        setAlertHistory(prev => [received, ...prev]);
      });
    };
  }, []);

  // ─── Safety-net peer count poll ───────────────────────────────────────────────
  // The event callback should keep peerCount accurate, but we poll every 2s
  // as a fallback in case a connection event is missed.
  useEffect(() => {
    const interval = setInterval(() => setPeerCount(getPeerCount()), 2000);
    return () => clearInterval(interval);
  }, []);

  // ─── sendAlert ────────────────────────────────────────────────────────────────
  /**
   * Called by SenderScreen when the user taps the send button.
   * Creates the message, broadcasts it, then records delivery stats.
   *
   * @param {string} type  'FLOOD' | 'LANDSLIDE' | 'AVALANCHE' | 'EARTHQUAKE'
   */
  const sendAlert = useCallback(async (type = 'FLOOD') => {
    const message = createMessage(type);
    const sentAt  = Date.now();

    // Record in sent history immediately — don't wait for delivery confirmation
    setSentAlerts(prev => [{ ...message, sentAt }, ...prev]);

    const results = await broadcastAlert(message);
    const elapsed = Date.now() - sentAt;

    const successCount = Object.values(results).filter(Boolean).length;

    // Build per-phone records — useful for the dashboard analytics
    // Note: RSSI is NOT available from GATT writes, so we don't fake it here
    const perPhone = Object.entries(results).map(([phone_id, received], idx) => ({
      phone_id,
      label:             `Phone ${idx + 2}`,
      received,
      delivery_time_ms:  received ? elapsed : null,
      sent_timestamp:    sentAt,
      received_timestamp: received ? sentAt + elapsed : null,
      // We intentionally omit RSSI — we don't have real values here
    }));

    setDeliveryStats({
      count:    successCount,
      ms:       elapsed,
      total:    peerCount,
      type,
      perPhone,
    });

    // Record which device IDs received this alert (for network viz highlight)
    setLastAlertRecipients(new Set(
      Object.entries(results).filter(([, ok]) => ok).map(([id]) => id),
    ));

    return { message, results, elapsed };
  }, [peerCount]);

  // ─── Dismiss the full-screen alert overlay ────────────────────────────────────
  const dismissAlert = useCallback(() => setCurrentAlert(null), []);

  // ─── Provide to child components ─────────────────────────────────────────────
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
      sendAlert,
      dismissAlert,
    }}>
      {children}
    </MessageContext.Provider>
  );
}

/**
 * useMessage — the hook every screen uses to get data and actions.
 * Must be called inside a component wrapped by <MessageProvider>.
 */
export function useMessage() {
  const ctx = useContext(MessageContext);
  if (!ctx) throw new Error('useMessage must be used inside <MessageProvider>');
  return ctx;
}

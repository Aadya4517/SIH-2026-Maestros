/**
 * MessageContext.js
 *
 * Think of this as the "brain" of the app — the central place that holds
 * all the shared state and kicks off the BLE system when the app starts.
 *
 * Any screen (SenderScreen, ReceiverScreen) that needs to know about
 * alerts, peer count, or BLE status just calls useMessage() and gets
 * everything it needs. No prop-drilling, no Redux.
 *
 * What this file manages:
 *   - Starting up BLE (permissions → bluetooth on → peripheral → scan → listen)
 *   - Keeping track of how many peers are connected
 *   - Receiving alerts and storing them for display
 *   - Providing the sendAlert() function to the sender screen
 *   - Keeping a list of all sent and received alerts for history
 *
 * FUTURE INTEGRATION:
 *   When a real gateway/backend is available, the BLE calls here can be
 *   replaced with WebSocket events from the backend server.
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

// Create the context — screens get data from here via useMessage()
const MessageContext = createContext(null);

export function MessageProvider({ children }) {
  // The most recently received alert (shown as the full-screen overlay)
  const [currentAlert,        setCurrentAlert]        = useState(null);
  // All alerts received this session, newest first
  const [alertHistory,        setAlertHistory]        = useState([]);
  // Number of BLE peers currently connected
  const [peerCount,           setPeerCount]           = useState(0);
  // True once BLE is fully initialised and ready
  const [isBleReady,          setIsBleReady]          = useState(false);
  // Any BLE error message (shown in the status bar on each screen)
  const [bleError,            setBleError]            = useState(null);
  // List of alerts this phone has sent (for the history log on SenderScreen)
  const [sentAlerts,          setSentAlerts]          = useState([]);
  // Stats from the last broadcast (delivery count, time taken, per-phone details)
  const [deliveryStats,       setDeliveryStats]       = useState(null);
  // All connected devices — passed to NetworkVisualization
  const [connectedDevices,    setConnectedDevices]    = useState([]);
  // Which device IDs received the last alert — used for the glow effect in the viz
  const [lastAlertRecipients, setLastAlertRecipients] = useState(new Set());

  // We use a ref for the alert callback so we can update it without
  // re-registering the BLE listener every time (which would cause duplicates)
  const onNewAlertRef = useRef(null);

  // ─── BLE initialisation sequence ─────────────────────────────────────────
  // This runs once when the component mounts (i.e., when the app opens).
  // The steps must happen in order — each one depends on the previous.
  useEffect(() => {
    let cancelled = false; // guard against state updates after unmount

    async function initBle() {
      try {
        // Step 1: Ask the user for Bluetooth permissions
        const granted = await requestAndroidPermissions();
        if (!granted) {
          setBleError('Bluetooth permissions denied. Please grant them in Settings.');
          return;
        }

        // Step 2: Wait for the Bluetooth adapter to be switched on
        await waitForBluetooth();
        if (cancelled) return;

        // Step 3: Start scanning for other phones running OfflineMesh
        // When a new peer is found, add it to our connected devices list
        await scanForDevices((deviceId, deviceName) => {
          console.log('[Context] New peer connected:', deviceId, deviceName);
          setConnectedDevices(prev => {
            if (prev.find(d => d.id === deviceId)) return prev; // already in list
            return [
              ...prev,
              {
                id:        deviceId,
                label:     deviceName || `Phone ${prev.length + 2}`,
                connected: true,
                rssi:      -60, // default RSSI — updated by real events if available
              },
            ];
          });
        });

        // Step 4: Keep our peer count state in sync with the connection pool
        onPeerListChanged(count => {
          if (!cancelled) {
            setPeerCount(count);
            // Mark devices as disconnected if the overall count dropped
            setConnectedDevices(prev =>
              prev.map((d, idx) => ({ ...d, connected: idx < count })),
            );
          }
        });

        // Step 5: Start listening for incoming alert messages from peers
        listenForMessages(message => {
          // Route the message through our alert handler ref
          if (onNewAlertRef.current) {
            onNewAlertRef.current(message);
          }
        });

        if (!cancelled) {
          setIsBleReady(true);
          console.log('[Context] BLE ready — app is live on the mesh');
        }

      } catch (e) {
        console.error('[Context] BLE initialisation failed:', e?.message);
        if (!cancelled) setBleError(e?.message || 'BLE initialisation failed');
      }
    }

    initBle();

    // Cleanup when the app closes — disconnect everything gracefully
    return () => {
      cancelled = true;
      console.log('[Context] App closing — shutting down BLE');
      destroyBleManager();
    };
  }, []);

  // ─── Wire up the alert handler ────────────────────────────────────────────
  // We define this separately so it can access the latest state values
  // without needing to re-subscribe to the BLE listener every render.
  useEffect(() => {
    onNewAlertRef.current = async (rawMessage) => {
      await handleIncomingMessage(rawMessage, (message) => {
        // Stamp with local received time so we can show latency
        const received = { ...message, receivedAt: Date.now() };
        setCurrentAlert(received);  // triggers the full-screen overlay
        setAlertHistory(prev => [received, ...prev]);
      });
    };
  }, []);

  // ─── Periodic peer count refresh ─────────────────────────────────────────
  // Poll every 2 seconds as a safety net in case the event callback misses
  // a connection change (can happen during rapid connect/disconnect cycles)
  useEffect(() => {
    const interval = setInterval(() => {
      setPeerCount(getPeerCount());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // ─── Send an alert ────────────────────────────────────────────────────────
  /**
   * sendAlert
   *
   * Called when the authority phone taps the big send button.
   * Creates a new message, broadcasts it over BLE, then computes
   * delivery stats so the sender can see who received it and how fast.
   *
   * @param {string} type  alert type key from ALERT_TYPES (default: 'FLOOD')
   */
  const sendAlert = useCallback(async (type = 'FLOOD') => {
    const message = createMessage(type);
    const sentAt  = Date.now();

    // Add to sent history immediately (before waiting for delivery)
    setSentAlerts(prev => [{ ...message, sentAt }, ...prev]);

    // Broadcast and collect per-device results
    const results = await broadcastAlert(message);

    const successCount = Object.values(results).filter(Boolean).length;
    const elapsed      = Date.now() - sentAt;

    // Build per-phone delivery records for the analytics screen
    const perPhone = Object.entries(results).map(([phone_id, received], idx) => ({
      phone_id,
      label:                `Phone ${idx + 2}`, // Authority is "Phone 1"
      received,
      delivery_time_ms:      received ? elapsed : null,
      // RSSI isn't available from GATT writes, so we simulate a plausible value
      signal_strength_rssi:  received ? Math.floor(Math.random() * 20) - 65 : -90,
      sent_timestamp:        sentAt,
      received_timestamp:    received ? sentAt + elapsed : null,
    }));

    const statsPayload = {
      count:    successCount,
      ms:       elapsed,
      total:    peerCount,
      type,
      perPhone,
    };

    setDeliveryStats(statsPayload);

    // Record which devices got it — for the network visualization glow effect
    const recipients = new Set(
      Object.entries(results)
        .filter(([, ok]) => ok)
        .map(([id]) => id),
    );
    setLastAlertRecipients(recipients);

    return { message, results, elapsed };
  }, [peerCount]);

  // ─── Dismiss the current alert overlay ───────────────────────────────────
  const dismissAlert = useCallback(() => {
    setCurrentAlert(null);
  }, []);

  // ─── Provide everything to child components ───────────────────────────────
  return (
    <MessageContext.Provider
      value={{
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
 * useMessage
 * The hook screens use to access the context.
 * Throws a clear error if someone forgets to wrap their component in <MessageProvider>.
 */
export function useMessage() {
  const ctx = useContext(MessageContext);
  if (!ctx) {
    throw new Error('useMessage must be called inside a <MessageProvider>');
  }
  return ctx;
}

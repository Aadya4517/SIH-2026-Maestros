/**
 * BleService.js
 *
 * This is the complete BLE layer for OfflineMesh. Every phone runs this
 * exact code, which means every phone does two things simultaneously:
 *
 *   PERIPHERAL role (native Kotlin module — BlePeripheralModule.kt):
 *     → Opens a GATT server with our custom service UUID
 *     → Advertises so other phones can discover us
 *     → Receives characteristic writes from central phones
 *     → Fires a "OfflineMeshMessage" event back to JS when data arrives
 *
 *   CENTRAL role (react-native-ble-plx — this JS file):
 *     → Scans for other phones advertising our service UUID
 *     → Connects to them
 *     → Writes messages to their characteristics (this is how we send)
 *
 * Both roles run together. That dual role is what makes it a mesh —
 * every node can both receive (peripheral) and send (central).
 *
 * IMPORTANT: Do not remove the peripheral calls. Without advertising,
 * other phones can't find us. Without the GATT server, we can't receive.
 */

import { BleManager, State }          from 'react-native-ble-plx';
import { Platform, PermissionsAndroid, NativeModules, NativeEventEmitter }
                                       from 'react-native';
import { Buffer }                      from 'buffer';

// ─── UUIDs — must match BlePeripheralModule.kt exactly ────────────────────────
// Change these in both places if you ever need to update them.
export const SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
export const CHAR_UUID    = '87654321-4321-4321-4321-cba987654321';

// ─── Native peripheral module ─────────────────────────────────────────────────
// This is the Kotlin module in android/app/src/main/java/com/offlinemesh/
// It handles advertising and the GATT server — the "receive" half of the mesh.
const BlePeripheral = NativeModules.BlePeripheral;

// We use NativeEventEmitter to listen for the "OfflineMeshMessage" event that
// the Kotlin module fires whenever another phone writes to our characteristic.
const peripheralEmitter = BlePeripheral
  ? new NativeEventEmitter(BlePeripheral)
  : null;

// ─── Central-side BLE manager (react-native-ble-plx) ─────────────────────────
// One instance only — multiple BleManagers cause crashes.
const bleManager = new BleManager();

// ─── Connection pool ──────────────────────────────────────────────────────────
// Maps deviceId → connected Device object.
// When we broadcast, we write to every entry in this map.
const peerConnections = new Map();

// Guard set — prevents two concurrent connection attempts to the same device.
// Without this, rapid scan callbacks can trigger duplicate connects.
const connectingDevices = new Set();

// ─── Registered callbacks ─────────────────────────────────────────────────────
let _onMessageReceived = null; // (parsedMessage) => void
let _onPeerListChanged  = null; // (peerCount)     => void

// Subscription handle for the native peripheral event listener
let _peripheralMessageSub = null;

// ─── Android permissions ──────────────────────────────────────────────────────

/**
 * requestAndroidPermissions
 *
 * Android changed BLE permissions in API 31 (Android 12). Before that,
 * you needed location permission to scan. After that, dedicated BLE
 * permissions were added. We handle both cases so one APK works across
 * Android 8 through 14.
 */
export async function requestAndroidPermissions() {
  if (Platform.OS !== 'android') return true;

  const apiLevel = Platform.Version;

  if (apiLevel >= 31) {
    // Android 12+ — needs the new BLE-specific permissions
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return (
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]    === 'granted' &&
      results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === 'granted'
    );
  } else {
    // Android 6–11 — location permission enables BLE scanning
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === 'granted';
  }
}

// ─── Bluetooth state ──────────────────────────────────────────────────────────

/**
 * waitForBluetooth
 *
 * Resolves as soon as the Bluetooth adapter is powered on.
 * Times out after 10 seconds with a clear error message.
 */
export function waitForBluetooth() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Bluetooth did not turn on within 10 seconds. Is Bluetooth enabled?')),
      10000,
    );
    const sub = bleManager.onStateChange(state => {
      if (state === State.PoweredOn) {
        clearTimeout(timeout);
        sub.remove();
        resolve(state);
      }
    }, true); // true = emit current state immediately so we don't miss it
  });
}

// ─── Peripheral (advertising + GATT server) ───────────────────────────────────

/**
 * startPeripheral
 *
 * Calls the native Kotlin module to:
 *   1. Open a GATT server
 *   2. Add our custom service + writable characteristic
 *   3. Start BLE advertising so other phones can find us
 *
 * This is what makes this phone discoverable. Without it, other phones
 * running OfflineMesh cannot see us and cannot send us alerts.
 *
 * The Kotlin module emits "OfflineMeshMessage" events whenever a central
 * writes to our characteristic — that's how we receive messages.
 */
export function startPeripheral(onMessage) {
  if (!BlePeripheral) {
    console.warn('[BLE] BlePeripheral native module not found — peripheral mode unavailable');
    return;
  }

  // Subscribe to incoming write events from the native GATT server.
  // This fires when another phone (acting as central) writes an alert
  // to our characteristic — i.e., when someone sends us an alert.
  if (peripheralEmitter && !_peripheralMessageSub) {
    _peripheralMessageSub = peripheralEmitter.addListener(
      'OfflineMeshMessage',
      (event) => {
        // event = { deviceId: string, data: string (base64) }
        if (!event?.data) return;
        try {
          const json    = Buffer.from(event.data, 'base64').toString('utf8');
          const message = JSON.parse(json);
          console.log('[BLE Peripheral] Message received from', event.deviceId);
          if (onMessage) onMessage(message);
        } catch (e) {
          console.warn('[BLE Peripheral] Failed to parse incoming message:', e.message);
        }
      },
    );
  }

  // Tell the Kotlin module to start advertising and open the GATT server
  BlePeripheral.startAdvertising();
  console.log('[BLE] Peripheral started — advertising our service UUID');
}

/**
 * stopPeripheral
 *
 * Stops advertising and closes the GATT server.
 * Called on app close / MessageContext cleanup.
 */
export function stopPeripheral() {
  if (_peripheralMessageSub) {
    _peripheralMessageSub.remove();
    _peripheralMessageSub = null;
  }
  if (BlePeripheral) {
    BlePeripheral.stopAdvertising();
    console.log('[BLE] Peripheral stopped');
  }
}

// ─── Scanning (central role) ──────────────────────────────────────────────────

/**
 * scanForDevices
 *
 * Starts a BLE scan filtered to SERVICE_UUID so we only see other
 * OfflineMesh phones. When one is found, we connect to it automatically.
 * This is the "auto-pair" feature — no QR codes, no manual pairing.
 *
 * @param {function} onPeerConnected  optional — fired when a new peer connects
 */
export async function scanForDevices(onPeerConnected) {
  stopScan(); // clear any old scan first

  console.log('[BLE] Starting scan for peers advertising:', SERVICE_UUID);

  bleManager.startDeviceScan(
    [SERVICE_UUID],
    { allowDuplicates: false },
    (error, device) => {
      if (error) {
        console.warn('[BLE] Scan error:', error.message);
        return;
      }
      if (!device) return;

      // Skip devices we're already connected to or currently connecting to
      if (peerConnections.has(device.id) || connectingDevices.has(device.id)) return;

      console.log('[BLE] Found peer:', device.id, device.name);
      _connectToDevice(device, onPeerConnected);
    },
  );
}

/** Stop scanning — call once all expected peers are connected to save battery */
export function stopScan() {
  bleManager.stopDeviceScan();
}

// ─── Connecting to a peer ─────────────────────────────────────────────────────

/**
 * _connectToDevice
 *
 * Internal. Called by scanForDevices when a new peer is spotted.
 * "Discover services and characteristics" is the BLE handshake —
 * we learn what the peer supports before we can write to it.
 *
 * The connection is stored in peerConnections so broadcastAlert can use it.
 * Self-healing: if the connection drops, we retry after 2 seconds.
 */
async function _connectToDevice(device, onPeerConnected) {
  // Duplicate-connect guard
  if (connectingDevices.has(device.id)) return;
  connectingDevices.add(device.id);

  try {
    const connected  = await device.connect({ autoConnect: false });
    const discovered = await connected.discoverAllServicesAndCharacteristics();

    peerConnections.set(device.id, discovered);
    connectingDevices.delete(device.id);

    console.log('[BLE] ✓ Connected to peer:', device.id);
    if (_onPeerListChanged) _onPeerListChanged(peerConnections.size);
    if (onPeerConnected)    onPeerConnected(device.id, device.name ?? device.id);

    // If the connection drops, clean up and try to reconnect after a short pause
    device.onDisconnected((_, disconnectedDevice) => {
      const id = disconnectedDevice?.id ?? device.id;
      console.warn('[BLE] Peer disconnected:', id);
      peerConnections.delete(id);
      connectingDevices.delete(id);
      if (_onPeerListChanged) _onPeerListChanged(peerConnections.size);

      // Self-healing reconnect — gives the peer time to stabilise
      setTimeout(() => {
        if (!peerConnections.has(device.id)) {
          _connectToDevice(device, onPeerConnected);
        }
      }, 2000);
    });

  } catch (e) {
    console.warn('[BLE] Connection failed for', device.id, ':', e.message);
    peerConnections.delete(device.id);
    connectingDevices.delete(device.id);
  }
}

// ─── Broadcasting an alert ────────────────────────────────────────────────────

/**
 * broadcastAlert
 *
 * Sends the alert message to every connected peer by writing to their
 * GATT characteristic. We use Promise.allSettled so a failure on one
 * peer doesn't block delivery to the others.
 *
 * The message is JSON-encoded then base64-wrapped because BLE
 * characteristics transfer raw bytes, not strings.
 *
 * @param  {object} message  the full alert object from MessageService
 * @return {object}          map of { deviceId -> true/false }
 */
export async function broadcastAlert(message) {
  const json    = JSON.stringify(message);
  const base64  = Buffer.from(json, 'utf8').toString('base64');
  const results = {};
  const peers   = Array.from(peerConnections.entries());

  if (peers.length === 0) {
    console.warn('[BLE] No peers connected — alert cannot be broadcast');
    return results;
  }

  console.log('[BLE] Broadcasting to', peers.length, 'peer(s):', message.type);

  await Promise.allSettled(
    peers.map(async ([deviceId, device]) => {
      try {
        await device.writeCharacteristicWithResponseForService(
          SERVICE_UUID,
          CHAR_UUID,
          base64,
        );
        results[deviceId] = true;
        console.log('[BLE] ✓ Delivered to', deviceId);
      } catch (e) {
        console.warn('[BLE] ✗ Failed to deliver to', deviceId, ':', e.message);
        results[deviceId] = false;
        // Drop the broken connection — it will auto-reconnect
        peerConnections.delete(deviceId);
        connectingDevices.delete(deviceId);
        if (_onPeerListChanged) _onPeerListChanged(peerConnections.size);
      }
    }),
  );

  return results;
}

// ─── Listening for messages (central side) ────────────────────────────────────

/**
 * listenForMessages
 *
 * Sets up monitoring on already-connected peers via react-native-ble-plx.
 * This catches messages sent from peers who are acting as centrals and
 * writing to our characteristic via the ble-plx write method.
 *
 * NOTE: Messages sent from peers whose peripheral is the Kotlin GATT server
 * arrive via the NativeEventEmitter in startPeripheral() instead.
 * Both paths feed into the same onMessage callback.
 *
 * @param {function} onMessage  (parsedMessageObject) => void
 */
export function listenForMessages(onMessage) {
  _onMessageReceived = onMessage;

  // Monitor existing connections
  peerConnections.forEach((device, deviceId) => {
    _monitorPeer(device, deviceId, onMessage);
  });
}

function _monitorPeer(device, deviceId, onMessage) {
  device.monitorCharacteristicForService(
    SERVICE_UUID,
    CHAR_UUID,
    (error, characteristic) => {
      if (error) {
        console.warn('[BLE] Monitor error on', deviceId, ':', error.message);
        return;
      }
      if (!characteristic?.value) return;

      try {
        const json    = Buffer.from(characteristic.value, 'base64').toString('utf8');
        const message = JSON.parse(json);
        console.log('[BLE Central] Message received from', deviceId);
        if (onMessage) onMessage(message);
      } catch (e) {
        console.warn('[BLE] Could not parse message from', deviceId, ':', e.message);
      }
    },
  );
}

// ─── Peer utilities ───────────────────────────────────────────────────────────

/** Number of currently connected peers */
export function getPeerCount() {
  return peerConnections.size;
}

/** Array of all connected device IDs */
export function getPeerIds() {
  return Array.from(peerConnections.keys());
}

/** Register a callback to be notified when peer count changes */
export function onPeerListChanged(callback) {
  _onPeerListChanged = callback;
}

// ─── Shutdown ─────────────────────────────────────────────────────────────────

/**
 * destroyBleManager
 *
 * Graceful cleanup — called when the app closes or MessageContext unmounts.
 * Stops the scan, disconnects all peers, then destroys the BLE manager.
 * Does NOT call stopPeripheral — MessageContext handles that separately.
 */
export function destroyBleManager() {
  stopScan();
  peerConnections.forEach(device => {
    try { device.cancelConnection(); } catch (_) {}
  });
  peerConnections.clear();
  connectingDevices.clear();
  bleManager.destroy();
}

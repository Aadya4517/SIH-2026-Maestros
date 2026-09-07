/**
 * BleService.js
 *
 * Think of this file as the "radio operator" for each phone.
 * It handles everything related to Bluetooth Low Energy (BLE):
 *   - Advertising this phone's presence so other phones can find it
 *   - Scanning the airwaves to discover nearby phones running the same app
 *   - Connecting to those phones and keeping those connections alive
 *   - Actually sending (writing) alert messages to connected phones
 *   - Listening for incoming messages from other phones
 *
 * The key insight: every phone is BOTH a broadcaster (peripheral) AND
 * a listener (central) at the same time. That's what makes it a mesh —
 * there's no "server" phone, everyone talks to everyone.
 */

import { BleManager, State } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// ─── Shared "language" — all phones must use the same UUIDs ──────────────────
// These are like a secret channel number. Only phones tuned to this exact
// channel (SERVICE_UUID) will talk to each other. Random enough to avoid
// collisions with other BLE apps in the area.
export const SERVICE_UUID = '12345678-1234-1234-1234-123456789abc';
export const CHAR_UUID    = '87654321-4321-4321-4321-cba987654321';

// ─── The BLE manager — one instance shared across the whole app ───────────────
// Creating multiple managers causes crashes, so we keep exactly one.
const bleManager = new BleManager();

// ─── Connection pool ──────────────────────────────────────────────────────────
// We keep a map of every phone we're currently connected to.
// Key = device ID (hardware address), Value = the live connection object.
// When we want to broadcast, we loop through all entries here.
const peerConnections = new Map();

// Callbacks registered by the app layer (MessageContext) to react to events
let _onMessageReceived = null; // called when a message arrives
let _onPeerListChanged  = null; // called when a phone connects or disconnects

// ─── Android permissions ──────────────────────────────────────────────────────
/**
 * Android has different BLE permission requirements depending on the OS version.
 * Android 12+ (API 31+) added BLUETOOTH_SCAN and BLUETOOTH_CONNECT as separate
 * permissions. Older versions just need location permission (yes, really —
 * that's how Android worked for BLE scanning before Android 12).
 */
export async function requestAndroidPermissions() {
  if (Platform.OS !== 'android') return true;

  const apiLevel = Platform.Version;

  if (apiLevel >= 31) {
    // Android 12 and newer — request the new dedicated BLE permissions
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
    // Android 11 and older — location permission unlocks BLE scanning
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === 'granted';
  }
}

// ─── Wait for Bluetooth to be ready ─────────────────────────────────────────
/**
 * We can't do anything until the phone's Bluetooth adapter is turned on.
 * This function just waits patiently until that happens, then resolves.
 * If the user never turns Bluetooth on, it gives up after 10 seconds.
 */
export function waitForBluetooth() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('BLE timeout — is Bluetooth turned on?')), 10000);
    const subscription = bleManager.onStateChange(state => {
      if (state === State.PoweredOn) {
        clearTimeout(timeout);
        subscription.remove();
        resolve(state);
      }
    }, true); // true = emit current state immediately
  });
}

// ─── Scanning for other phones ────────────────────────────────────────────────
let _scanSubscription = null;

/**
 * scanForDevices
 *
 * Turns on the BLE radio and starts listening for other phones that are
 * advertising our SERVICE_UUID. When one is found, we automatically try
 * to connect to it. This is what enables the "auto-pair" behaviour —
 * no user action needed, just open the app and phones find each other.
 *
 * @param {function} onPeerConnected  optional callback fired when a new peer connects
 */
export async function scanForDevices(onPeerConnected) {
  stopScan(); // stop any previous scan first to avoid duplicates

  console.log('[BLE] Starting scan for service:', SERVICE_UUID);

  bleManager.startDeviceScan(
    [SERVICE_UUID],          // only show me phones running OfflineMesh
    { allowDuplicates: false }, // don't fire the callback twice for the same phone
    (error, device) => {
      if (error) {
        console.warn('[BLE] Scan error:', error.message);
        return;
      }
      if (!device) return;

      // Skip phones we're already connected to
      if (peerConnections.has(device.id)) return;

      console.log('[BLE] Found peer:', device.id, device.name);
      connectToDevice(device, onPeerConnected);
    },
  );
}

/** Stop scanning (saves battery once all peers are found) */
export function stopScan() {
  bleManager.stopDeviceScan();
}

// ─── Connecting to a specific phone ──────────────────────────────────────────
/**
 * connectToDevice
 *
 * Once we've spotted a peer phone via scanning, we connect to it.
 * "Discover services and characteristics" is the BLE handshake step —
 * it's like opening a folder to see what files are inside, except
 * the "files" are data channels (characteristics) we can read/write.
 */
async function connectToDevice(device, onPeerConnected) {
  try {
    const connected  = await device.connect({ autoConnect: false });
    const discovered = await connected.discoverAllServicesAndCharacteristics();

    peerConnections.set(device.id, discovered);
    console.log('[BLE] Connected to peer:', device.id);

    if (_onPeerListChanged) _onPeerListChanged(peerConnections.size);
    if (onPeerConnected)    onPeerConnected(device.id, device.name);

    // If the connection drops, remove it from our pool and try to reconnect
    // after a short delay. This makes the mesh self-healing.
    device.onDisconnected((err, disconnectedDevice) => {
      console.warn('[BLE] Peer disconnected:', disconnectedDevice?.id);
      peerConnections.delete(disconnectedDevice?.id);
      if (_onPeerListChanged) _onPeerListChanged(peerConnections.size);

      // Try to reconnect after 2 seconds
      setTimeout(() => {
        if (!peerConnections.has(device.id)) {
          connectToDevice(device, onPeerConnected);
        }
      }, 2000);
    });

  } catch (e) {
    console.warn('[BLE] Connection failed for', device.id, ':', e.message);
    peerConnections.delete(device.id);
  }
}

// ─── Broadcasting an alert to all connected phones ────────────────────────────
/**
 * broadcastAlert
 *
 * This is the core "send" operation. We take the alert message object,
 * turn it into JSON, encode it as base64 (because BLE characteristics
 * only accept bytes, not raw strings), then write it to every connected
 * phone's characteristic simultaneously.
 *
 * We use Promise.allSettled so that if writing to one phone fails,
 * we still try all the others. One failure shouldn't stop the broadcast.
 *
 * @param {object} message  the full alert object from MessageService
 * @returns {object}  map of { deviceId -> true/false } showing who got it
 */
export async function broadcastAlert(message) {
  const json   = JSON.stringify(message);
  const base64 = Buffer.from(json, 'utf8').toString('base64');
  const results = {};

  const peers = Array.from(peerConnections.entries());

  if (peers.length === 0) {
    console.warn('[BLE] No peers connected — alert not sent to anyone');
    return results;
  }

  console.log('[BLE] Broadcasting to', peers.length, 'peer(s)');

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
        // Remove broken connections from the pool — they'll reconnect automatically
        peerConnections.delete(deviceId);
        if (_onPeerListChanged) _onPeerListChanged(peerConnections.size);
      }
    }),
  );

  return results;
}

// ─── Listening for incoming messages ─────────────────────────────────────────
/**
 * listenForMessages
 *
 * Registers a callback that fires whenever another phone writes an alert
 * to our characteristic. We then decode the base64 bytes back into JSON
 * and hand it off to MessageService for deduplication and relay logic.
 *
 * @param {function} onMessage  called with the parsed message object
 */
export function listenForMessages(onMessage) {
  _onMessageReceived = onMessage;

  // Set up monitoring on every currently-connected peer
  peerConnections.forEach((device, deviceId) => {
    _monitorDevice(device, deviceId, onMessage);
  });
}

function _monitorDevice(device, deviceId, onMessage) {
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
        // Decode: base64 → utf8 string → JavaScript object
        const json    = Buffer.from(characteristic.value, 'base64').toString('utf8');
        const message = JSON.parse(json);
        console.log('[BLE] Message received from', deviceId);
        if (onMessage) onMessage(message);
      } catch (e) {
        console.warn('[BLE] Could not parse incoming message:', e.message);
      }
    },
  );
}

// ─── Utility functions ────────────────────────────────────────────────────────

/** How many other phones are we currently connected to? */
export function getPeerCount() {
  return peerConnections.size;
}

/** Get all connected device IDs */
export function getPeerIds() {
  return Array.from(peerConnections.keys());
}

/** Register a callback that fires whenever the peer count changes */
export function onPeerListChanged(callback) {
  _onPeerListChanged = callback;
}

/**
 * destroyBleManager
 * Clean shutdown — stop scanning, disconnect all peers, release the BLE manager.
 * Called when the app closes or the MessageContext unmounts.
 */
export function destroyBleManager() {
  stopScan();
  peerConnections.forEach(device => {
    try { device.cancelConnection(); } catch (_) {}
  });
  peerConnections.clear();
  bleManager.destroy();
}

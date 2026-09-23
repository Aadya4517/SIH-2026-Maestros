/**
 * BleService.js
 *
 * BLE mesh networking layer.
 *
 * Architecture:
 *  - Each phone acts as BOTH:
 *      1. BLE peripheral: advertises our custom GATT service
 *      2. BLE central: scans and connects to other phones
 *
 *  - The native BlePeripheral module handles:
 *      - GATT server
 *      - BLE advertising
 *      - Receiving characteristic writes
 *
 *  - react-native-ble-plx handles:
 *      - BLE scanning
 *      - Connecting to peers
 *      - Writing alerts to connected peers
 */

import {
  BleManager,
  State,
} from 'react-native-ble-plx';

import {
  Platform,
  PermissionsAndroid,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';

import { Buffer } from 'buffer';

// ─── Native BLE peripheral module ────────────────────────────────────────────

const { BlePeripheral } = NativeModules;

const blePeripheralEmitter = BlePeripheral
  ? new NativeEventEmitter(BlePeripheral)
  : null;

const MESSAGE_EVENT = 'OfflineMeshMessage';

// ─── Project-wide UUIDs ──────────────────────────────────────────────────────

export const SERVICE_UUID =
  '12345678-1234-1234-1234-123456789abc';

export const CHAR_UUID =
  '87654321-4321-4321-4321-cba987654321';

// ─── Singleton BLE manager ───────────────────────────────────────────────────

const bleManager = new BleManager();

// ─── Connected peers ─────────────────────────────────────────────────────────

/**
 * Map<deviceId, Device>
 *
 * These are peers that THIS phone has connected to as a BLE central.
 */
const peerConnections = new Map();
const connectingDevices = new Set();

// Application-level BLE framing.
// Header:
//   bytes 0..1 = "OM"
//   bytes 2..5 = message ID
//   byte 6     = total chunks
//   byte 7     = chunk index
const MESH_FRAME_HEADER_SIZE = 8;

let meshMessageSequence = 1;

// ─── Callbacks ────────────────────────────────────────────────────────────────

let _onMessageReceived = null;
let _onPeerListChanged = null;

// Native event subscription for incoming messages
let _messageSubscription = null;

// ─── Permission helpers ───────────────────────────────────────────────────────

/**
 * Android 12+:
 *   BLUETOOTH_SCAN
 *   BLUETOOTH_CONNECT
 *   BLUETOOTH_ADVERTISE
 *
 * Android 6-11:
 *   ACCESS_FINE_LOCATION
 */
export async function requestAndroidPermissions() {
  if (Platform.OS !== 'android') {
    return true;
  }

  const apiLevel = Platform.Version;

  if (apiLevel >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);

    const scanGranted =
      results[
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
      ] === PermissionsAndroid.RESULTS.GRANTED;

    const connectGranted =
      results[
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ] === PermissionsAndroid.RESULTS.GRANTED;

    const advertiseGranted =
      results[
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE
      ] === PermissionsAndroid.RESULTS.GRANTED;

    console.log('[BLE] Permissions:', {
      scanGranted,
      connectGranted,
      advertiseGranted,
    });

    return (
      scanGranted &&
      connectGranted &&
      advertiseGranted
    );
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// ─── BLE state watcher ───────────────────────────────────────────────────────

export function waitForBluetooth() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('BLE timeout'));
    }, 10000);

    const subscription = bleManager.onStateChange(
      state => {
        console.log('[BLE] Bluetooth state:', state);

        if (state === State.PoweredOn) {
          clearTimeout(timeout);
          subscription.remove();
          resolve(state);
        }
      },
      true,
    );
  });
}

// ─── Native peripheral / advertising ─────────────────────────────────────────

/**
 * Starts the native GATT server and BLE advertiser.
 *
 * Every phone should call this when the app starts.
 */
export async function startPeripheral() {
  if (!BlePeripheral) {
    console.warn(
      '[BLE] BlePeripheral native module is not available',
    );

    return false;
  }

  try {
    BlePeripheral.startAdvertising();

    console.log(
      '[BLE] Peripheral advertising requested',
    );

    return true;
  } catch (error) {
    console.warn(
      '[BLE] Failed to start peripheral:',
      error?.message,
    );

    return false;
  }
}

/**
 * Stops the native GATT server and advertiser.
 */
export function stopPeripheral() {
  if (!BlePeripheral) {
    return;
  }

  try {
    BlePeripheral.stopAdvertising();

    console.log(
      '[BLE] Peripheral advertising stopped',
    );
  } catch (error) {
    console.warn(
      '[BLE] Failed to stop peripheral:',
      error?.message,
    );
  }
}

// ─── Scanning ────────────────────────────────────────────────────────────────

/**
 * Starts scanning for phones advertising our SERVICE_UUID.
 *
 * When a phone is found, automatically connects to it.
 */
export async function scanForDevices(onPeerConnected) {
  stopScan();

  console.log(
    '[BLE] Starting scan for service:',
    SERVICE_UUID,
  );

  bleManager.startDeviceScan(
    [SERVICE_UUID],
    {
      allowDuplicates: false,
    },
    (error, device) => {
      if (error) {
        console.warn(
          '[BLE] Scan error:',
          error.message,
        );

        return;
      }

      if (!device) {
        return;
      }

      if (peerConnections.has(device.id)) {
        return;
      }

      if (connectingDevices.has(device.id)) {
        return;
      }

      console.log(
        '[BLE] Found peer:',
        device.id,
        device.name,
      );

      connectingDevices.add(device.id);

      connectToDevice(
        device,
        onPeerConnected,
      );
    },
  );
}

export function stopScan() {
  bleManager.stopDeviceScan();
}

// ─── Connecting ─────────────────────────────────────────────────────────────

async function connectToDevice(
  device,
  onPeerConnected,
) {
  try {
    console.log(
      '[BLE] Connecting to:',
      device.id,
    );

    const connected = await device.connect({
      autoConnect: false,
    });

    // Request a larger MTU.
    let mtuDevice = connected;

    try {
      mtuDevice = await connected.requestMTU(512);

      console.log(
        '[BLE] Negotiated MTU:',
        mtuDevice.mtu,
        'with peer:',
        device.id,
      );
    } catch (mtuError) {
      console.warn(
        '[BLE] MTU request failed for',
        device.id,
        ':',
        mtuError?.message,
      );
    }

    const discovered =
      await mtuDevice.discoverAllServicesAndCharacteristics();

    peerConnections.set(
      device.id,
      discovered,
    );

    connectingDevices.delete(device.id);

    console.log(
      '[BLE] Connected to peer:',
      device.id,
      'MTU:',
      discovered.mtu,
    );

    if (_onPeerListChanged) {
      _onPeerListChanged(
        peerConnections.size,
      );
    }

    if (onPeerConnected) {
      onPeerConnected(
        device.id,
        device.name,
      );
    }

    // Handle disconnection
    device.onDisconnected(
      (err, disconnectedDevice) => {
        const disconnectedId =
          disconnectedDevice?.id || device.id;

        console.warn(
          '[BLE] Peer disconnected:',
          disconnectedId,
        );

        peerConnections.delete(
          disconnectedId,
        );

        if (_onPeerListChanged) {
          _onPeerListChanged(
            peerConnections.size,
          );
        }

        // Attempt reconnection after 2 seconds.
        setTimeout(() => {
          if (
            !peerConnections.has(
              device.id,
            ) &&
            !connectingDevices.has(
              device.id,
            )
          ) {
            connectingDevices.add(
              device.id,
            );

            connectToDevice(
              device,
              onPeerConnected,
            );
          }
        }, 2000);
      },
    );

  } catch (error) {
    console.warn(
      '[BLE] Connection failed for',
      device.id,
      ':',
      error?.message,
    );

    peerConnections.delete(
      device.id,
    );

    connectingDevices.delete(
      device.id,
    );
  }
}

// ─── Broadcasting ────────────────────────────────────────────────────────────

/**
 * Sends the alert to every connected peer.
 *
 * Large JSON payloads are split into MTU-safe application-level frames.
 * This avoids Android prepared/reliable writes.
 */
export async function broadcastAlert(message) {
  const json = JSON.stringify(message);

  const payload = Buffer.from(
    json,
    'utf8',
  );

  const results = {};

  const peers = Array.from(
    peerConnections.entries(),
  );

  if (peers.length === 0) {
    console.warn(
      '[BLE] No peers connected — cannot broadcast',
    );

    return results;
  }

  const messageId =
    meshMessageSequence++ >>> 0;

  console.log(
    '[BLE] Broadcasting to',
    peers.length,
    'peer(s); JSON bytes:',
    payload.length,
    'messageId:',
    messageId,
  );

  await Promise.allSettled(
    peers.map(
      async ([deviceId, device]) => {
        try {
          /*
           * BLE ATT payload = MTU - 3 bytes.
           *
           * Each frame has an 8-byte application header,
           * therefore only the remaining space is used for
           * JSON payload data.
           */

          const mtu =
            Number(device?.mtu) || 23;

          const maxAttPayload =
            Math.max(
              20,
              mtu - 3,
            );

          const chunkPayloadSize =
            Math.max(
              1,
              maxAttPayload -
                MESH_FRAME_HEADER_SIZE,
            );

          const totalChunks =
            Math.ceil(
              payload.length /
                chunkPayloadSize,
            );

          if (totalChunks > 255) {
            throw new Error(
              `Alert too large: ${totalChunks} chunks`,
            );
          }

          console.log(
            '[BLE] Sending to',
            deviceId,
            'MTU:',
            mtu,
            'chunk payload:',
            chunkPayloadSize,
            'chunks:',
            totalChunks,
          );

          for (
            let index = 0;
            index < totalChunks;
            index += 1
          ) {
            const start =
              index *
              chunkPayloadSize;

            const end =
              Math.min(
                start +
                  chunkPayloadSize,
                payload.length,
              );

            const chunk =
              payload.slice(
                start,
                end,
              );

            /*
             * Frame layout:
             *
             * 0   = 0x4F ('O')
             * 1   = 0x4D ('M')
             * 2-5 = message ID
             * 6   = total chunks
             * 7   = chunk index
             * 8+  = JSON payload
             */

            const frame =
              Buffer.alloc(
                MESH_FRAME_HEADER_SIZE +
                  chunk.length,
              );

            frame[0] = 0x4f;
            frame[1] = 0x4d;

            frame.writeUInt32BE(
              messageId,
              2,
            );

            frame[6] =
              totalChunks;

            frame[7] =
              index;

            chunk.copy(
              frame,
              MESH_FRAME_HEADER_SIZE,
            );

            /*
             * Each frame is below the ATT payload limit,
             * so this is a normal GATT write.
             */
            await device.writeCharacteristicWithResponseForService(
              SERVICE_UUID,
              CHAR_UUID,
              frame.toString('base64'),
            );
          }

          results[deviceId] = true;

          console.log(
            '[BLE] Delivered to',
            deviceId,
            'in',
            totalChunks,
            'chunk(s)',
          );

        } catch (error) {

          console.warn(
            '[BLE] Failed to deliver to',
            deviceId,
            ':',
            error?.message,
          );

          results[deviceId] = false;

          peerConnections.delete(
            deviceId,
          );

          if (_onPeerListChanged) {
            _onPeerListChanged(
              peerConnections.size,
            );
          }
        }
      },
    ),
  );

  return results;
}

// ─── Receiving messages ──────────────────────────────────────────────────────

/**
 * Incoming messages are received by the native Android GATT server.
 *
 * Flow:
 *
 * Phone A
 *    |
 *    | BLE characteristic write
 *    v
 * Phone B native GATT server
 *    |
 *    | onCharacteristicWriteRequest()
 *    v
 * NativeEventEmitter
 *    |
 *    v
 * JavaScript
 *
 * Native module event:
 *
 * OfflineMeshMessage
 *
 * {
 *   deviceId: "...",
 *   data: "base64..."
 * }
 */
export function listenForMessages(onMessage) {
  _onMessageReceived =
    onMessage;

  // Remove existing listener.
  if (_messageSubscription) {
    _messageSubscription.remove();
    _messageSubscription = null;
  }

  if (!blePeripheralEmitter) {
    console.warn(
      '[BLE] Native BLE peripheral emitter unavailable',
    );

    return;
  }

  _messageSubscription =
    blePeripheralEmitter.addListener(
      MESSAGE_EVENT,
      event => {
        try {
          if (!event?.data) {
            return;
          }

          const json =
            Buffer
              .from(
                event.data,
                'base64',
              )
              .toString('utf8');

          const message =
            JSON.parse(json);

          console.log(
            '[BLE] Received message from',
            event.deviceId,
            ':',
            message,
          );

          if (_onMessageReceived) {
            _onMessageReceived(
              message,
            );
          }

        } catch (error) {

          console.warn(
            '[BLE] Failed to parse incoming message:',
            error?.message,
          );
        }
      },
    );

  console.log(
    '[BLE] Listening for native BLE messages',
  );
}

// ─── Peer information ────────────────────────────────────────────────────────

export function getPeerCount() {
  return peerConnections.size;
}

export function getPeerIds() {
  return Array.from(
    peerConnections.keys(),
  );
}

export function onPeerListChanged(
  callback,
) {
  _onPeerListChanged =
    callback;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export function destroyBleManager() {
  stopScan();

  if (_messageSubscription) {
    _messageSubscription.remove();
    _messageSubscription = null;
  }

  stopPeripheral();

  peerConnections.forEach(
    device => {
      try {
        device.cancelConnection();
      } catch (_) {}
    },
  );

  peerConnections.clear();
  connectingDevices.clear();

  _onMessageReceived = null;
  _onPeerListChanged = null;

  bleManager.destroy();
}
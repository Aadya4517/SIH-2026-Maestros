/**
 * GatewaySyncService.js
 *
 * This file is the bridge between the BLE mesh and the Emergency Command Center.
 *
 * CURRENT STATE: MVP — stores data locally on the gateway phone.
 * FUTURE STATE:  When the gateway phone has connectivity, sync to the backend.
 *
 * Data flow (full picture):
 *
 *   [Citizen phones]
 *        ↓ BLE mesh
 *   [Gateway / Authority phone]  ← this phone runs this service
 *        ↓ Wi-Fi / USB (when available)
 *   [Backend API / WebSocket]
 *        ↓
 *   [Emergency Command Center — laptop dashboard]
 *
 * For the SIH demo, the gateway phone is just another OfflineMesh device.
 * The Emergency Command Center runs on mock data. When a real backend is
 * built, replace the functions below with actual HTTP/WebSocket calls.
 *
 * Nothing in the citizen UX depends on this file — it's purely for
 * the authority monitoring layer.
 */

// ─── Local in-memory store (MVP) ──────────────────────────────────────────────
// In a real deployment these would sync to a backend database.
let _alertLog   = []; // all alerts that have passed through this device
let _peerLog    = []; // all peers ever seen
let _gatewayActive = false;

// ─── Gateway lifecycle ────────────────────────────────────────────────────────

/**
 * activateGateway
 *
 * Call this on the authority/gateway phone to start collecting mesh data
 * for the Emergency Command Center.
 *
 * FUTURE: Open a WebSocket or HTTP server here so the dashboard can pull data.
 */
export function activateGateway() {
  _gatewayActive = true;
  console.log('[GatewaySync] Gateway mode activated — logging mesh activity');
}

export function deactivateGateway() {
  _gatewayActive = false;
  console.log('[GatewaySync] Gateway mode deactivated');
}

export function isGatewayActive() {
  return _gatewayActive;
}

// ─── Data collection ──────────────────────────────────────────────────────────

/**
 * logAlert
 *
 * Called by MessageContext whenever an alert is sent or received.
 * Records it for later sync to the Emergency Command Center.
 *
 * @param {object} message     the full alert message object
 * @param {object} [delivery]  optional delivery stats (count, ms, perPhone)
 */
export function logAlert(message, delivery = null) {
  if (!_gatewayActive) return;

  const entry = {
    ...message,
    loggedAt:    Date.now(),
    deliveryStats: delivery,
  };

  // Avoid logging duplicates — same message_id from relay hops
  const alreadyLogged = _alertLog.some(a => a.message_id === message.message_id);
  if (!alreadyLogged) {
    _alertLog.unshift(entry); // newest first
    console.log('[GatewaySync] Alert logged:', message.message_id, message.type);
  }
}

/**
 * logPeer
 *
 * Called when a new peer connects to the mesh.
 *
 * @param {string} deviceId
 * @param {string} deviceName
 */
export function logPeer(deviceId, deviceName) {
  if (!_gatewayActive) return;

  const existing = _peerLog.find(p => p.id === deviceId);
  if (!existing) {
    _peerLog.push({
      id:        deviceId,
      label:     deviceName || deviceId,
      firstSeen: Date.now(),
      lastSeen:  Date.now(),
    });
  } else {
    existing.lastSeen = Date.now();
  }
}

// ─── Data retrieval ───────────────────────────────────────────────────────────
// These are the functions a future backend API integration would call.
// Currently they just return the in-memory store.

/**
 * getAlertLog
 *
 * Returns all alerts recorded on this gateway device, newest first.
 *
 * FUTURE: POST this to the backend API for the dashboard to consume.
 */
export function getAlertLog() {
  return [..._alertLog];
}

/**
 * getPeerLog
 *
 * Returns all mesh devices ever seen by this gateway.
 *
 * FUTURE: Sync to GET /api/devices on the backend.
 */
export function getPeerLog() {
  return [..._peerLog];
}

/**
 * exportSyncPayload
 *
 * Bundles everything into a single object ready to POST to a backend.
 * This is the full data contract between the gateway phone and the server.
 *
 * FUTURE INTEGRATION:
 *   const payload = exportSyncPayload();
 *   await fetch('http://command-center/api/sync', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(payload),
 *   });
 */
export function exportSyncPayload() {
  return {
    syncedAt:  new Date().toISOString(),
    alerts:    getAlertLog(),
    peers:     getPeerLog(),
    // FUTURE: add GPS coordinates, device hardware info, etc.
  };
}

/**
 * clearLog
 *
 * Resets the in-memory store. Useful after a successful sync to the backend.
 *
 * FUTURE: Call this after exportSyncPayload() confirms server receipt.
 */
export function clearLog() {
  _alertLog = [];
  _peerLog  = [];
  console.log('[GatewaySync] Local log cleared');
}

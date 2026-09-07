/**
 * dashboardService.js
 *
 * This is the "data access layer" for the Emergency Command Center.
 * Right now it returns mock/demo data so the dashboard works without any
 * real hardware. But every function here has a clear comment showing
 * exactly where a real API call should go when the backend exists.
 *
 * The idea is that when the OfflineMesh gateway phone (or backend server)
 * is ready, you replace the mock imports below with fetch() calls or
 * WebSocket listeners — and nothing else in the app needs to change.
 *
 * Future data flow:
 *   BLE Phones
 *     ↓  (BLE mesh)
 *   Gateway/Authority Phone
 *     ↓  (USB / WiFi hotspot)
 *   Backend API  (e.g. http://gateway-device:8080)
 *     ↓
 *   Replace mock imports below with real fetch() calls
 */

import {
  MOCK_NETWORK_STATUS,
  MOCK_ALERTS,
  MOCK_DEVICES,
  MOCK_EDGES,
  MOCK_DELIVERY_HISTORY,
  MOCK_COVERAGE_AREA,
} from '../data/mockData.js';

// Small fake delay to simulate a real network request
// This makes loading states work correctly during development
const SIMULATED_DELAY_MS = 120;
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// ─── Network status ───────────────────────────────────────────────────────────

/**
 * getNetworkStatus
 *
 * Returns overall mesh health: online/offline, device counts, last sync time.
 *
 * REPLACE WITH:  GET /api/network/status
 *            OR  WebSocket event: 'network:status'
 */
export async function getNetworkStatus() {
  await delay(SIMULATED_DELAY_MS);
  return {
    ...MOCK_NETWORK_STATUS,
    // Always show "just synced" in demo mode so the dashboard looks live
    lastSync: new Date().toISOString(),
  };
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

/**
 * getActiveAlerts
 *
 * Returns only alerts that are currently ACTIVE (not yet resolved).
 * Used for the summary card count and the "active" badge in the alerts panel.
 *
 * REPLACE WITH:  GET /api/alerts?status=ACTIVE
 */
export async function getActiveAlerts() {
  await delay(SIMULATED_DELAY_MS);
  return MOCK_ALERTS.filter((a) => a.status === 'ACTIVE');
}

/**
 * getAlertHistory
 *
 * Returns ALL alerts (active + resolved), sorted newest first.
 * Used for the full alerts panel list.
 *
 * REPLACE WITH:  GET /api/alerts?limit=50
 */
export async function getAlertHistory() {
  await delay(SIMULATED_DELAY_MS);
  return [...MOCK_ALERTS].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
  );
}

/**
 * getAlertById
 *
 * Returns one specific alert by ID.
 * Used when the user clicks an alert to open the detail drawer.
 *
 * REPLACE WITH:  GET /api/alerts/:id
 */
export async function getAlertById(id) {
  await delay(SIMULATED_DELAY_MS);
  return MOCK_ALERTS.find((a) => a.id === id) || null;
}

// ─── Devices ──────────────────────────────────────────────────────────────────

/**
 * getDevices
 *
 * Returns all devices known to the mesh network — both connected and offline.
 * Used by the network graph and device detail panel.
 *
 * REPLACE WITH:  GET /api/devices
 *            OR  WebSocket event: 'devices:list'
 */
export async function getDevices() {
  await delay(SIMULATED_DELAY_MS);
  return MOCK_DEVICES;
}

/**
 * getMeshEdges
 *
 * Returns the list of active BLE connections between devices.
 * These become the lines drawn between nodes in the network graph.
 *
 * REPLACE WITH:  GET /api/network/edges
 *            OR  WebSocket event: 'network:topology'
 */
export async function getMeshEdges() {
  await delay(SIMULATED_DELAY_MS);
  return MOCK_EDGES;
}

// ─── Delivery analytics ───────────────────────────────────────────────────────

/**
 * getDeliveryMetrics
 *
 * Calculates aggregate delivery stats across all recorded alerts.
 * The heavy lifting (success rate, averages) is done here so the
 * components stay simple — they just display what they receive.
 *
 * REPLACE WITH:  GET /api/analytics/delivery
 */
export async function getDeliveryMetrics() {
  await delay(SIMULATED_DELAY_MS);

  const allAlerts    = MOCK_ALERTS;
  const totalReached = allAlerts.reduce((sum, a) => sum + a.devicesReached, 0);
  const totalDevices = allAlerts.reduce((sum, a) => sum + a.totalDevices, 0);

  const successRate = totalDevices > 0
    ? Math.round((totalReached / totalDevices) * 100)
    : 0;

  // Average delivery time across all alerts that have timing data
  const allTimes    = allAlerts.filter((a) => a.avgDeliveryMs).map((a) => a.avgDeliveryMs);
  const avgDelivery = allTimes.length > 0
    ? Math.round(allTimes.reduce((sum, v) => sum + v, 0) / allTimes.length)
    : 0;

  const latestAlert = MOCK_ALERTS[0];

  return {
    totalReached,
    totalDevices,
    successRate,
    avgDeliveryMs:       avgDelivery,
    unreachable:         totalDevices - totalReached,
    latestAlertReached:  latestAlert?.devicesReached,
    latestAlertTotal:    latestAlert?.totalDevices,
    history:             MOCK_DELIVERY_HISTORY,
  };
}

// ─── Coverage area ────────────────────────────────────────────────────────────

/**
 * getCoverageArea
 *
 * Returns the approximate incident zones.
 * Note: this is always demo/approximate data — we don't use real GPS.
 *
 * REPLACE WITH:  GET /api/coverage
 */
export async function getCoverageArea() {
  await delay(SIMULATED_DELAY_MS);
  return MOCK_COVERAGE_AREA;
}

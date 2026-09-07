/**
 * mockData.js
 *
 * All the demo/fake data used by the Emergency Command Center.
 *
 * ⚠️  THIS IS DEMO DATA — it is clearly labelled and intentionally fake.
 *     It exists so the dashboard looks realistic during a hackathon demo
 *     without needing real hardware or a backend.
 *
 * When the real OfflineMesh gateway is available, this entire file gets
 * replaced by actual data coming from the API/WebSocket. The shapes of
 * the objects here define the expected data contract with the backend.
 *
 * What's in here:
 *   ALERT_TYPE_META   — display info (colour, icon) for each disaster type
 *   MOCK_DEVICES      — 10 demo phones with connection status and signal info
 *   MOCK_EDGES        — which phones are directly connected to which
 *   MOCK_ALERTS       — 4 sample alerts (2 active, 2 resolved)
 *   MOCK_DELIVERY_HISTORY — hourly delivery counts for the bar chart
 *   MOCK_NETWORK_STATUS   — overall mesh health summary
 *   MOCK_COVERAGE_AREA    — incident zone info (no real GPS used)
 */

// ─── Alert type display metadata ─────────────────────────────────────────────
// These colours and icons are used across the entire dashboard —
// alert rows, the detail drawer, the network graph glow, etc.
export const ALERT_TYPE_META = {
  FLOOD:      { color: '#ef4444', darkColor: '#7f1d1d', icon: '🌊', label: 'Flood'      },
  LANDSLIDE:  { color: '#f97316', darkColor: '#7c2d12', icon: '⛰️', label: 'Landslide'  },
  AVALANCHE:  { color: '#eab308', darkColor: '#713f12', icon: '🏔️', label: 'Avalanche'  },
  EARTHQUAKE: { color: '#a855f7', darkColor: '#4a1d96', icon: '🌍', label: 'Earthquake' },
};

// ─── Demo devices ─────────────────────────────────────────────────────────────
// 10 phones: 1 gateway + 9 peers. 8 are connected, 2 are offline.
// x, y are percentage positions in the network diagram (0–100).
export const MOCK_DEVICES = [
  {
    id: 'gateway-01',
    label: 'Gateway / Authority',
    role: 'gateway',
    connected: true,
    lastSeen: new Date(Date.now() - 5000).toISOString(),
    alertReceived: true,
    deliveryTime: 0,          // the gateway is the source, so delivery time is 0
    rssi: null,               // RSSI doesn't apply to the gateway
    messagesRelayed: 47,
    x: 50, y: 50,             // centre of the diagram
  },
  {
    id: 'dev-02',
    label: 'Device 2',
    role: 'peer',
    connected: true,
    lastSeen: new Date(Date.now() - 8000).toISOString(),
    alertReceived: true,
    deliveryTime: 820,        // received the alert in 820ms
    rssi: -52,                // strong signal
    messagesRelayed: 12,
    x: 20, y: 22,
  },
  {
    id: 'dev-03',
    label: 'Device 3',
    role: 'peer',
    connected: true,
    lastSeen: new Date(Date.now() - 12000).toISOString(),
    alertReceived: true,
    deliveryTime: 1140,
    rssi: -61,                // good signal
    messagesRelayed: 9,
    x: 78, y: 18,
  },
  {
    id: 'dev-04',
    label: 'Device 4',
    role: 'peer',
    connected: true,
    lastSeen: new Date(Date.now() - 6000).toISOString(),
    alertReceived: true,
    deliveryTime: 1530,
    rssi: -58,
    messagesRelayed: 7,
    x: 82, y: 72,
  },
  {
    id: 'dev-05',
    label: 'Device 5',
    role: 'peer',
    connected: true,
    lastSeen: new Date(Date.now() - 20000).toISOString(),
    alertReceived: true,
    deliveryTime: 2200,
    rssi: -67,
    messagesRelayed: 5,
    x: 18, y: 76,
  },
  {
    id: 'dev-06',
    label: 'Device 6',
    role: 'peer',
    connected: true,
    lastSeen: new Date(Date.now() - 3000).toISOString(),
    alertReceived: true,
    deliveryTime: 3100,
    rssi: -63,
    messagesRelayed: 3,
    x: 50, y: 14,
  },
  {
    id: 'dev-07',
    label: 'Device 7',
    role: 'peer',
    connected: false,         // this device is offline — shown dimmed in the graph
    lastSeen: new Date(Date.now() - 180000).toISOString(), // last seen 3 mins ago
    alertReceived: false,
    deliveryTime: null,
    rssi: null,
    messagesRelayed: 0,
    x: 14, y: 48,
  },
  {
    id: 'dev-08',
    label: 'Device 8',
    role: 'peer',
    connected: true,
    lastSeen: new Date(Date.now() - 9000).toISOString(),
    alertReceived: true,
    deliveryTime: 1780,
    rssi: -55,
    messagesRelayed: 8,
    x: 86, y: 44,
  },
  {
    id: 'dev-09',
    label: 'Device 9',
    role: 'peer',
    connected: true,
    lastSeen: new Date(Date.now() - 14000).toISOString(),
    alertReceived: true,
    deliveryTime: 2560,
    rssi: -70,                // borderline weak signal
    messagesRelayed: 4,
    x: 36, y: 84,
  },
  {
    id: 'dev-10',
    label: 'Device 10',
    role: 'peer',
    connected: false,         // offline
    lastSeen: new Date(Date.now() - 420000).toISOString(), // last seen 7 mins ago
    alertReceived: false,
    deliveryTime: null,
    rssi: null,
    messagesRelayed: 0,
    x: 64, y: 86,
  },
];

// ─── Mesh connections (edges) ─────────────────────────────────────────────────
// Each entry means "these two devices have a direct BLE connection".
// The network graph draws a line between them.
export const MOCK_EDGES = [
  { source: 'gateway-01', target: 'dev-02' },
  { source: 'gateway-01', target: 'dev-03' },
  { source: 'gateway-01', target: 'dev-04' },
  { source: 'gateway-01', target: 'dev-05' },
  { source: 'gateway-01', target: 'dev-06' },
  { source: 'dev-02',     target: 'dev-07' }, // dev-07 can only be reached via dev-02
  { source: 'dev-02',     target: 'dev-09' },
  { source: 'dev-03',     target: 'dev-08' },
  { source: 'dev-04',     target: 'dev-10' }, // dev-10 can only be reached via dev-04
  { source: 'dev-05',     target: 'dev-09' },
  { source: 'dev-06',     target: 'dev-03' },
  { source: 'dev-08',     target: 'dev-10' },
];

// ─── Sample alerts ────────────────────────────────────────────────────────────
// Two ACTIVE alerts (currently happening) and two RESOLVED (handled).
export const MOCK_ALERTS = [
  {
    id: 'alert-001',
    type: 'FLOOD',
    severity: 'HIGH',
    area: 'Teesta Valley, Sikkim',
    timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(), // 12 min ago
    originDevice: 'gateway-01',
    devicesReached: 8,
    totalDevices: 10,
    status: 'ACTIVE',
    avgDeliveryMs: 1740,
    unreachableDevices: ['dev-07', 'dev-10'], // the two offline phones
  },
  {
    id: 'alert-002',
    type: 'LANDSLIDE',
    severity: 'MEDIUM',
    area: 'Darjeeling Hills, WB',
    timestamp: new Date(Date.now() - 38 * 60 * 1000).toISOString(), // 38 min ago
    originDevice: 'gateway-01',
    devicesReached: 7,
    totalDevices: 10,
    status: 'ACTIVE',
    avgDeliveryMs: 2100,
    unreachableDevices: ['dev-07', 'dev-10', 'dev-09'],
  },
  {
    id: 'alert-003',
    type: 'EARTHQUAKE',
    severity: 'HIGH',
    area: 'Nepal Border Region',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hrs ago
    originDevice: 'gateway-01',
    devicesReached: 9,
    totalDevices: 10,
    status: 'RESOLVED',
    avgDeliveryMs: 1320,
    unreachableDevices: ['dev-10'],
  },
  {
    id: 'alert-004',
    type: 'AVALANCHE',
    severity: 'LOW',
    area: 'Lachen Valley, Sikkim',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hrs ago
    originDevice: 'dev-03',
    devicesReached: 6,
    totalDevices: 10,
    status: 'RESOLVED',
    avgDeliveryMs: 2800,
    unreachableDevices: ['dev-07', 'dev-10', 'dev-04', 'dev-05'],
  },
];

// ─── Hourly delivery history (for the bar chart) ──────────────────────────────
// Each entry represents one hour of the past 12 hours.
// "delivered" = number of devices that received an alert that hour
// "failed"    = number that should have received it but didn't
export const MOCK_DELIVERY_HISTORY = [
  { time: '06:00', delivered: 0, failed: 0 },
  { time: '07:00', delivered: 0, failed: 0 },
  { time: '08:00', delivered: 3, failed: 0 },
  { time: '09:00', delivered: 0, failed: 0 },
  { time: '10:00', delivered: 6, failed: 1 },
  { time: '11:00', delivered: 0, failed: 0 },
  { time: '12:00', delivered: 8, failed: 2 },
  { time: '13:00', delivered: 0, failed: 0 },
  { time: '14:00', delivered: 7, failed: 1 },
  { time: '15:00', delivered: 0, failed: 0 },
  { time: '16:00', delivered: 0, failed: 0 },
  { time: '17:00', delivered: 0, failed: 0 },
];

// ─── Overall network status ───────────────────────────────────────────────────
export const MOCK_NETWORK_STATUS = {
  online: true,
  connectedDevices: 8,
  totalDevices: 10,
  activeAlerts: 2,
  lastSync: new Date(Date.now() - 5000).toISOString(),
  activeConnections: 12,
  alertsRelayed: 47,
  healthStatus: 'HEALTHY',   // can be HEALTHY | DEGRADED | CRITICAL
};

// ─── Coverage / incident area info ───────────────────────────────────────────
// ⚠️ DEMO DATA — no real GPS coordinates. The dashboard makes this obvious.
export const MOCK_COVERAGE_AREA = {
  name: 'Teesta Basin Disaster Zone',
  description: 'Approximate incident coverage — DEMO DATA, not real GPS',
  subAreas: [
    { name: 'Teesta Valley, Sikkim',  devicesEstimate: 4, status: 'ACTIVE'  },
    { name: 'Darjeeling Hills, WB',   devicesEstimate: 3, status: 'ACTIVE'  },
    { name: 'Nepal Border Region',    devicesEstimate: 2, status: 'STANDBY' },
    { name: 'Lachen Valley, Sikkim',  devicesEstimate: 1, status: 'STANDBY' },
  ],
  isDemo: true, // used by the CoverageArea component to show the warning banner
};

# 🖥️ OfflineMesh Emergency Command Center

A laptop web dashboard for emergency authorities to monitor the OfflineMesh
disaster alert network in real-time.

**This is a separate system from the citizen mobile app.**
Ordinary citizens use the Android app. Rescue coordinators and government
operators use this dashboard on a laptop.

---

## What it shows

- Live mesh network diagram — see which phones are connected and who got each alert
- Active disaster alerts with severity, area, and delivery status
- Per-device delivery breakdown — exactly which phones received the alert and how fast
- Network health stats — connected/offline counts, relay totals, last sync time
- Delivery analytics with a bar chart of the last 12 hours
- Incident coverage area panel (clearly marked as demo data — no real GPS)

## Tech stack

| Tool       | Purpose                         |
|------------|---------------------------------|
| React 18   | UI framework                    |
| Vite       | Dev server + build tool         |
| Recharts   | Delivery analytics bar chart    |
| SVG        | Network mesh diagram (no lib)   |
| CSS vars   | Dark emergency operations theme |

## Running it

```bash
cd OfflineMesh-Dashboard
npm install
npm run dev       # opens on http://localhost:3000
```

## Project structure

```
src/
├── main.jsx                     # React entry point
├── App.jsx
├── data/
│   └── mockData.js              # ⚠️ All demo data lives here
├── services/
│   └── dashboardService.js      # ← Replace with real API calls here
├── hooks/
│   └── useDashboardData.js      # Polls the service layer every 5s
├── utils/
│   └── formatters.js            # Time, RSSI, delivery time formatters
├── styles/
│   └── globals.css              # Dark theme CSS variables
├── components/
│   ├── Header                   # Status bar at the top
│   ├── SummaryCards             # 4 KPI cards (alerts, devices, delivery %, health)
│   ├── AlertsPanel              # Full alert list with delivery bars
│   ├── AlertDetailDrawer        # Slide-in panel when you click an alert
│   ├── NetworkGraph             # SVG mesh diagram — click nodes for details
│   ├── DeviceDetailPanel        # Shows RSSI, delivery time, relay count
│   ├── DeliveryAnalytics        # Metrics + hourly bar chart
│   ├── NetworkHealth            # Connection stats
│   └── CoverageArea             # Incident zone info
└── pages/
    └── Dashboard.jsx            # Wires all the panels together
```

## Connecting to the real backend

When the OfflineMesh gateway phone and backend are ready:

1. Open `src/services/dashboardService.js`
2. Each function has a comment like `REPLACE WITH: GET /api/alerts`
3. Replace the mock data imports with real `fetch()` calls or WebSocket listeners
4. Nothing else needs to change

The data shapes in `mockData.js` define the expected API contract.

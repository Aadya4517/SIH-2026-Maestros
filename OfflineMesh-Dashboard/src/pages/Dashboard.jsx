/**
 * Dashboard.jsx
 * The single page of the Emergency Command Center.
 * Composes all panels and manages shared UI state (selected alert, selected device).
 */
import { useState } from 'react';
import { useDashboardData } from '../hooks/useDashboardData.js';

import Header             from '../components/Header.jsx';
import SummaryCards       from '../components/SummaryCards.jsx';
import AlertsPanel        from '../components/AlertsPanel.jsx';
import NetworkGraph       from '../components/NetworkGraph.jsx';
import DeviceDetailPanel  from '../components/DeviceDetailPanel.jsx';
import DeliveryAnalytics  from '../components/DeliveryAnalytics.jsx';
import NetworkHealth      from '../components/NetworkHealth.jsx';
import CoverageArea       from '../components/CoverageArea.jsx';
import AlertDetailDrawer  from '../components/AlertDetailDrawer.jsx';

import './Dashboard.css';

export default function Dashboard() {
  const {
    networkStatus,
    activeAlerts,
    alertHistory,
    devices,
    edges,
    deliveryMetrics,
    coverageArea,
    loading,
    lastRefresh,
  } = useDashboardData();

  const [selectedAlert,  setSelectedAlert]  = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <span className="loading-icon pulse">📡</span>
        <p>Connecting to OfflineMesh network…</p>
      </div>
    );
  }

  return (
    <div className="dashboard-root">
      <Header networkStatus={networkStatus} lastRefresh={lastRefresh} />

      <main className="dashboard-main">
        {/* ── Row 1: Summary cards ── */}
        <section className="dashboard-section">
          <SummaryCards
            networkStatus={networkStatus}
            activeAlerts={activeAlerts}
            deliveryMetrics={deliveryMetrics}
          />
        </section>

        {/* ── Row 2: Network graph (left, large) + Alerts panel (right) ── */}
        <section className="dashboard-row row-graph-alerts">
          <div className="col-graph">
            <NetworkGraph
              devices={devices}
              edges={edges}
              alertHistory={alertHistory}
              selectedDevice={selectedDevice}
              onSelectDevice={(d) =>
                setSelectedDevice((prev) => (prev?.id === d.id ? null : d))
              }
            />
            {selectedDevice && (
              <DeviceDetailPanel
                device={selectedDevice}
                onClose={() => setSelectedDevice(null)}
              />
            )}
          </div>

          <div className="col-alerts">
            <AlertsPanel
              alerts={activeAlerts}
              allAlerts={alertHistory}
              selectedAlert={selectedAlert}
              onSelectAlert={(a) =>
                setSelectedAlert((prev) => (prev?.id === a.id ? null : a))
              }
            />
          </div>
        </section>

        {/* ── Row 3: Delivery analytics (full width) ── */}
        <section className="dashboard-section">
          <DeliveryAnalytics metrics={deliveryMetrics} />
        </section>

        {/* ── Row 4: Network health + Coverage area ── */}
        <section className="dashboard-row row-health-coverage">
          <NetworkHealth networkStatus={networkStatus} />
          <CoverageArea  coverageArea={coverageArea}   />
        </section>
      </main>

      {/* ── Alert detail drawer ── */}
      {selectedAlert && (
        <AlertDetailDrawer
          alert={selectedAlert}
          devices={devices}
          onClose={() => setSelectedAlert(null)}
        />
      )}
    </div>
  );
}

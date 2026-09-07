import './SummaryCards.css';

function Card({ icon, label, value, sub, accent, large }) {
  return (
    <div className="summary-card" style={{ '--accent': accent }}>
      <div className="summary-card-top">
        <span className="summary-card-icon">{icon}</span>
        <span className="summary-card-label">{label}</span>
      </div>
      <div className={`summary-card-value ${large ? 'large' : ''}`}>{value}</div>
      {sub && <div className="summary-card-sub">{sub}</div>}
      <div className="summary-card-bar" />
    </div>
  );
}

export default function SummaryCards({ networkStatus, activeAlerts, deliveryMetrics }) {
  const health = networkStatus?.healthStatus ?? 'UNKNOWN';
  const healthColor =
    health === 'HEALTHY'  ? '#22c55e' :
    health === 'DEGRADED' ? '#f59e0b' : '#ef4444';

  return (
    <div className="summary-cards">
      <Card
        icon="🚨"
        label="Active Alerts"
        value={activeAlerts?.length ?? '—'}
        sub="Currently active"
        accent="#ef4444"
        large
      />
      <Card
        icon="📱"
        label="Devices in Network"
        value={`${networkStatus?.connectedDevices ?? '—'} / ${networkStatus?.totalDevices ?? '—'}`}
        sub={`${(networkStatus?.totalDevices ?? 0) - (networkStatus?.connectedDevices ?? 0)} offline`}
        accent="#3b82f6"
        large
      />
      <Card
        icon="✅"
        label="Delivery Success"
        value={deliveryMetrics ? `${deliveryMetrics.successRate}%` : '—'}
        sub={`${deliveryMetrics?.totalReached ?? '—'} / ${deliveryMetrics?.totalDevices ?? '—'} reached`}
        accent="#22c55e"
        large
      />
      <Card
        icon={health === 'HEALTHY' ? '💚' : health === 'DEGRADED' ? '⚠️' : '🔴'}
        label="Network Status"
        value={health}
        sub={`${networkStatus?.activeConnections ?? '—'} active connections`}
        accent={healthColor}
        large
      />
    </div>
  );
}

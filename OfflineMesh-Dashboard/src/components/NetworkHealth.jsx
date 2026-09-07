import { formatRelativeTime } from '../utils/formatters.js';
import './NetworkHealth.css';

function HealthRow({ label, value, valueColor }) {
  return (
    <div className="health-row">
      <span className="health-label">{label}</span>
      <span className="health-value" style={valueColor ? { color: valueColor } : {}}>
        {value ?? '—'}
      </span>
    </div>
  );
}

export default function NetworkHealth({ networkStatus }) {
  if (!networkStatus) return null;

  const { healthStatus, connectedDevices, totalDevices, activeConnections,
          lastSync, alertsRelayed } = networkStatus;

  const healthColor =
    healthStatus === 'HEALTHY'  ? '#22c55e' :
    healthStatus === 'DEGRADED' ? '#f59e0b' : '#ef4444';

  const offlineCount = totalDevices - connectedDevices;
  const healthPct    = Math.round((connectedDevices / totalDevices) * 100);

  return (
    <div className="network-health-panel">
      <div className="panel-header">
        <h2 className="panel-title">Network Health</h2>
        <span className="health-badge" style={{ color: healthColor, borderColor: `${healthColor}40`, background: `${healthColor}12` }}>
          <span className={`status-dot ${networkStatus.online ? 'online' : 'offline'}`} />
          {healthStatus}
        </span>
      </div>

      {/* Health bar */}
      <div className="health-bar-section">
        <div className="health-bar-wrap">
          <div className="health-bar-bg">
            <div
              className="health-bar-fill"
              style={{
                width: `${healthPct}%`,
                background: healthPct >= 80 ? '#22c55e' : healthPct >= 50 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
          <span className="health-bar-pct">{healthPct}%</span>
        </div>
        <span className="health-bar-label">{connectedDevices}/{totalDevices} devices online</span>
      </div>

      {/* Stats */}
      <div className="health-stats">
        <HealthRow label="Connected Devices"    value={connectedDevices} valueColor="#22c55e" />
        <HealthRow label="Offline Devices"      value={offlineCount}     valueColor={offlineCount > 0 ? '#ef4444' : '#22c55e'} />
        <HealthRow label="Active Connections"   value={activeConnections} />
        <HealthRow label="Alerts Relayed"       value={alertsRelayed} />
        <HealthRow label="Last Synchronization" value={formatRelativeTime(lastSync)} />
      </div>
    </div>
  );
}

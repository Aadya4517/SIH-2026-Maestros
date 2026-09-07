import { formatRelativeTime } from '../utils/formatters.js';
import './Header.css';

export default function Header({ networkStatus, lastRefresh }) {
  const online = networkStatus?.online ?? false;

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <span className="header-logo-icon">📡</span>
          <div>
            <h1 className="header-title">OfflineMesh</h1>
            <p className="header-subtitle">Emergency Command Center</p>
          </div>
        </div>
      </div>

      <div className="header-right">
        {/* Network status pill */}
        <div className={`header-status-pill ${online ? 'online' : 'offline'}`}>
          <span className={`status-dot ${online ? 'online' : 'offline'} pulse`} />
          {online ? 'NETWORK ONLINE' : 'NETWORK OFFLINE'}
        </div>

        {/* Quick stats */}
        <div className="header-meta">
          <span className="header-meta-item">
            <span className="header-meta-label">Devices</span>
            <span className="header-meta-value">
              {networkStatus?.connectedDevices ?? '—'}/{networkStatus?.totalDevices ?? '—'}
            </span>
          </span>
          <div className="header-divider" />
          <span className="header-meta-item">
            <span className="header-meta-label">Active Alerts</span>
            <span className="header-meta-value alert-count">
              {networkStatus?.activeAlerts ?? '—'}
            </span>
          </span>
          <div className="header-divider" />
          <span className="header-meta-item">
            <span className="header-meta-label">Last Sync</span>
            <span className="header-meta-value mono">
              {lastRefresh ? formatRelativeTime(lastRefresh.toISOString()) : '—'}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}

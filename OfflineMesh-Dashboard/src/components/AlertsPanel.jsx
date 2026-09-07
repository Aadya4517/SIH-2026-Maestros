import { ALERT_TYPE_META } from '../data/mockData.js';
import { formatRelativeTime, formatDelivery, severityColor } from '../utils/formatters.js';
import './AlertsPanel.css';

function AlertRow({ alert, selected, onClick }) {
  const meta     = ALERT_TYPE_META[alert.type] || ALERT_TYPE_META.FLOOD;
  const sevColor = severityColor(alert.severity);
  const pct      = Math.round((alert.devicesReached / alert.totalDevices) * 100);
  const isActive = alert.status === 'ACTIVE';

  return (
    <div
      className={`alert-row ${selected ? 'selected' : ''} ${isActive ? 'active' : 'resolved'}`}
      onClick={() => onClick(alert)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(alert)}
    >
      {/* Left accent bar */}
      <div className="alert-row-accent" style={{ background: meta.color }} />

      <div className="alert-row-content">
        {/* Top row */}
        <div className="alert-row-top">
          <div className="alert-row-type">
            <span className="alert-type-icon">{meta.icon}</span>
            <span className="alert-type-label" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <span className="alert-severity-badge" style={{ background: `${sevColor}20`, color: sevColor, borderColor: `${sevColor}40` }}>
              {alert.severity}
            </span>
          </div>
          <div className="alert-row-badges">
            <span className={`alert-status-pill ${isActive ? 'active' : 'resolved'}`}>
              {isActive && <span className="status-dot online pulse" />}
              {alert.status}
            </span>
            <span className="alert-time">{formatRelativeTime(alert.timestamp)}</span>
          </div>
        </div>

        {/* Middle: area */}
        <div className="alert-area">📍 {alert.area}</div>

        {/* Bottom: delivery */}
        <div className="alert-row-bottom">
          <div className="alert-delivery-bar-wrap">
            <div className="alert-delivery-bar-bg">
              <div
                className="alert-delivery-bar-fill"
                style={{ width: `${pct}%`, background: pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444' }}
              />
            </div>
            <span className="alert-delivery-text">
              {alert.devicesReached}/{alert.totalDevices} devices · {formatDelivery(alert.avgDeliveryMs)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AlertsPanel({ alerts, allAlerts, selectedAlert, onSelectAlert }) {
  const activeCount   = allAlerts.filter((a) => a.status === 'ACTIVE').length;
  const resolvedCount = allAlerts.filter((a) => a.status === 'RESOLVED').length;

  return (
    <div className="alerts-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Recent Alerts</h2>
          <p className="panel-sub">
            <span className="badge-active">{activeCount} active</span>
            <span className="badge-resolved">{resolvedCount} resolved</span>
          </p>
        </div>
      </div>

      <div className="alerts-list">
        {allAlerts.length === 0 ? (
          <div className="alerts-empty">No alerts recorded</div>
        ) : (
          allAlerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              selected={selectedAlert?.id === alert.id}
              onClick={onSelectAlert}
            />
          ))
        )}
      </div>
    </div>
  );
}

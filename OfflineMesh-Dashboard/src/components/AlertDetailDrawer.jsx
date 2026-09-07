/**
 * AlertDetailDrawer.jsx
 * Slide-in right panel shown when an alert is clicked.
 * Displays full alert info + per-device delivery breakdown.
 */
import { ALERT_TYPE_META } from '../data/mockData.js';
import { formatDateTime, formatDelivery, severityColor } from '../utils/formatters.js';
import './AlertDetailDrawer.css';

function DeviceDeliveryRow({ deviceId, devices, reached }) {
  const device = devices.find((d) => d.id === deviceId);
  const label  = device?.label || deviceId;
  return (
    <div className={`dd-row ${reached ? 'reached' : 'unreached'}`}>
      <span className="dd-icon">{reached ? '✓' : '✗'}</span>
      <span className="dd-label">{label}</span>
      {reached && device?.deliveryTime != null && (
        <span className="dd-time">{formatDelivery(device.deliveryTime)}</span>
      )}
    </div>
  );
}

export default function AlertDetailDrawer({ alert, devices, onClose }) {
  if (!alert) return null;

  const meta     = ALERT_TYPE_META[alert.type] || ALERT_TYPE_META.FLOOD;
  const sevColor = severityColor(alert.severity);
  const pct      = Math.round((alert.devicesReached / alert.totalDevices) * 100);
  const isActive = alert.status === 'ACTIVE';

  // All device IDs — mark which ones are in unreachable list
  const allDeviceIds = devices
    .filter((d) => d.role !== 'gateway')
    .map((d) => d.id);

  return (
    <div className="drawer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer fade-in">
        {/* ── Header ── */}
        <div className="drawer-header" style={{ borderBottomColor: meta.color }}>
          <div className="drawer-header-left">
            <span className="drawer-icon">{meta.icon}</span>
            <div>
              <h2 className="drawer-title" style={{ color: meta.color }}>{meta.label} Alert</h2>
              <span className="drawer-id">ID: {alert.id}</span>
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="drawer-body">
          {/* ── Status + severity ── */}
          <div className="drawer-badges">
            <span className={`status-pill ${isActive ? 'active' : 'resolved'}`}>
              {isActive && <span className="status-dot online pulse" />}
              {alert.status}
            </span>
            <span className="severity-pill" style={{ color: sevColor, borderColor: `${sevColor}40`, background: `${sevColor}12` }}>
              {alert.severity} SEVERITY
            </span>
          </div>

          {/* ── Key facts ── */}
          <div className="drawer-facts">
            <div className="fact-row">
              <span className="fact-label">📍 Location</span>
              <span className="fact-value">{alert.area}</span>
            </div>
            <div className="fact-row">
              <span className="fact-label">🕐 Time</span>
              <span className="fact-value mono">{formatDateTime(alert.timestamp)}</span>
            </div>
            <div className="fact-row">
              <span className="fact-label">📡 Origin Device</span>
              <span className="fact-value">
                {devices.find((d) => d.id === alert.originDevice)?.label || alert.originDevice}
              </span>
            </div>
            <div className="fact-row">
              <span className="fact-label">⚡ Avg Delivery</span>
              <span className="fact-value">{formatDelivery(alert.avgDeliveryMs)}</span>
            </div>
          </div>

          {/* ── Delivery summary ── */}
          <div className="drawer-section-title">Propagation Status</div>
          <div className="delivery-summary">
            <div className="delivery-big">
              <span className="delivery-num" style={{ color: pct >= 80 ? '#22c55e' : '#f59e0b' }}>
                {alert.devicesReached}
              </span>
              <span className="delivery-denom">/ {alert.totalDevices}</span>
              <span className="delivery-label">devices reached</span>
            </div>
            <div className="delivery-bar-bg">
              <div
                className="delivery-bar-fill"
                style={{
                  width: `${pct}%`,
                  background: pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <span className="delivery-pct">{pct}% success rate</span>
          </div>

          {/* ── Per-device breakdown ── */}
          <div className="drawer-section-title">Device Breakdown</div>
          <div className="device-delivery-list">
            {allDeviceIds.map((id) => (
              <DeviceDeliveryRow
                key={id}
                deviceId={id}
                devices={devices}
                reached={!alert.unreachableDevices.includes(id)}
              />
            ))}
          </div>

          {/* ── Unreachable ── */}
          {alert.unreachableDevices.length > 0 && (
            <>
              <div className="drawer-section-title">Unreachable Devices</div>
              <div className="unreachable-list">
                {alert.unreachableDevices.map((id) => {
                  const d = devices.find((dev) => dev.id === id);
                  return (
                    <span key={id} className="unreachable-badge">
                      📴 {d?.label || id}
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

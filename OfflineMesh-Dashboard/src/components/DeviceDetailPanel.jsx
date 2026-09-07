import { formatRelativeTime, formatDelivery, formatRssi } from '../utils/formatters.js';
import './DeviceDetailPanel.css';

function Row({ label, value, valueClass }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className={`detail-value ${valueClass || ''}`}>{value ?? '—'}</span>
    </div>
  );
}

export default function DeviceDetailPanel({ device, onClose }) {
  if (!device) return null;

  const rssiInfo = formatRssi(device.rssi);
  const isGateway = device.role === 'gateway';

  return (
    <div className="device-detail-panel fade-in">
      <div className="detail-header">
        <div>
          <h3 className="detail-title">
            {isGateway ? '🏛️' : device.connected ? '📱' : '📴'} {device.label}
          </h3>
          <span className={`detail-status-badge ${device.connected ? 'connected' : 'offline'}`}>
            <span className={`status-dot ${device.connected ? 'online' : 'offline'}`} />
            {device.connected ? 'Connected' : 'Offline'}
          </span>
        </div>
        <button className="detail-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="detail-body">
        <Row label="Device ID"      value={<span className="mono">{device.id}</span>} />
        <Row label="Last Seen"      value={formatRelativeTime(device.lastSeen)} />
        <Row
          label="Alert Received"
          value={device.alertReceived ? '✓ Yes' : '✗ No'}
          valueClass={device.alertReceived ? 'value-green' : 'value-red'}
        />
        {device.alertReceived && (
          <Row label="Delivery Time" value={formatDelivery(device.deliveryTime)} />
        )}
        {!isGateway && (
          <Row
            label="Signal Strength"
            value={
              device.rssi != null
                ? <span style={{ color: rssiInfo.color }}>{rssiInfo.label} ({rssiInfo.quality})</span>
                : '—'
            }
          />
        )}
        <Row label="Messages Relayed" value={device.messagesRelayed} />
        <Row label="Role"             value={isGateway ? 'Gateway / Authority' : 'Peer Device'} />
      </div>
    </div>
  );
}

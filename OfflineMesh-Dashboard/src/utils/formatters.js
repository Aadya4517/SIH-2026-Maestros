/**
 * formatters.js — shared display helpers
 */

export function formatTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '—';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatDelivery(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function formatRssi(rssi) {
  if (rssi == null) return '—';
  if (rssi > -60)  return { label: `${rssi} dBm`, quality: 'Excellent', color: '#22c55e' };
  if (rssi >= -70) return { label: `${rssi} dBm`, quality: 'Good',      color: '#f59e0b' };
  return               { label: `${rssi} dBm`, quality: 'Weak',      color: '#ef4444' };
}

export function severityColor(severity) {
  switch (severity) {
    case 'HIGH':   return '#ef4444';
    case 'MEDIUM': return '#f97316';
    case 'LOW':    return '#eab308';
    default:       return '#6b7280';
  }
}

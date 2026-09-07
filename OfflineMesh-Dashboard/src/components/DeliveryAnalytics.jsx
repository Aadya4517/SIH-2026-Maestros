import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { formatDelivery } from '../utils/formatters.js';
import './DeliveryAnalytics.css';

function MetricTile({ label, value, sub, color }) {
  return (
    <div className="metric-tile">
      <span className="metric-label">{label}</span>
      <span className="metric-value" style={color ? { color } : {}}>
        {value ?? '—'}
      </span>
      {sub && <span className="metric-sub">{sub}</span>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

export default function DeliveryAnalytics({ metrics }) {
  if (!metrics) return null;

  const successColor =
    metrics.successRate >= 90 ? '#22c55e' :
    metrics.successRate >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <div className="delivery-analytics-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Delivery Analytics</h2>
          <p className="panel-sub-text">Across all recorded alerts</p>
        </div>
      </div>

      {/* ── Metric tiles ── */}
      <div className="metrics-grid">
        <MetricTile
          label="Delivered"
          value={`${metrics.totalReached} / ${metrics.totalDevices}`}
          sub="total across all alerts"
          color="#22c55e"
        />
        <MetricTile
          label="Success Rate"
          value={`${metrics.successRate}%`}
          sub="delivered vs attempted"
          color={successColor}
        />
        <MetricTile
          label="Avg Delivery"
          value={formatDelivery(metrics.avgDeliveryMs)}
          sub="mean across alerts"
          color="#3b82f6"
        />
        <MetricTile
          label="Unreachable"
          value={metrics.unreachable}
          sub="devices not reached"
          color={metrics.unreachable > 0 ? '#ef4444' : '#22c55e'}
        />
      </div>

      {/* ── Bar chart ── */}
      <div className="chart-wrap">
        <p className="chart-title">Alert Delivery (Last 12 Hours)</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={metrics.history} barSize={14} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3048" vertical={false} />
            <XAxis dataKey="time" tick={{ fill: '#3d5a7a', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#3d5a7a', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#7da3cc', paddingTop: 8 }}
              iconType="circle" iconSize={8}
            />
            <Bar dataKey="delivered" name="Delivered" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="failed"    name="Failed"    fill="#ef4444" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

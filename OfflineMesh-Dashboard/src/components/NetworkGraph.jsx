/**
 * NetworkGraph.jsx
 * SVG-based BLE mesh network visualization.
 *
 * - Authority/Gateway node in the centre (fixed)
 * - Peer nodes placed at positions from mock data (% of container)
 * - Edges drawn between connected pairs
 * - Nodes highlighted when they received the last alert
 * - Click a node to select it and view details
 */

import { useState, useRef, useEffect } from 'react';
import './NetworkGraph.css';

// ── Helpers ────────────────────────────────────────────────────────────────────

function nodeColor(device, isRecipient) {
  if (isRecipient)           return '#f1c40f';
  if (!device.connected)     return '#ef4444';
  if (device.rssi != null && device.rssi <= -70) return '#f97316';
  return '#22c55e';
}

function edgeOpacity(src, tgt) {
  if (!src?.connected || !tgt?.connected) return 0.18;
  return 0.55;
}

// ── Animated node glow ─────────────────────────────────────────────────────────

function NodeGlow({ cx, cy, r, color, active }) {
  if (!active) return null;
  return (
    <>
      <circle cx={cx} cy={cy} r={r + 10} fill={color} opacity={0.15} className="node-glow-ring" />
      <circle cx={cx} cy={cy} r={r + 5}  fill={color} opacity={0.25} className="node-glow-ring" />
    </>
  );
}

// ── Node component ────────────────────────────────────────────────────────────

function MeshNode({ device, cx, cy, selected, isRecipient, onClick }) {
  const isGateway = device.role === 'gateway';
  const r         = isGateway ? 26 : 18;
  const color     = nodeColor(device, isRecipient);
  const dim       = !device.connected && !isGateway;

  return (
    <g
      className={`mesh-node ${selected ? 'selected' : ''}`}
      onClick={() => onClick(device)}
      style={{ cursor: 'pointer', opacity: dim ? 0.45 : 1 }}
    >
      <NodeGlow cx={cx} cy={cy} r={r} color={color} active={isRecipient || selected} />

      {/* Shadow ring */}
      <circle cx={cx} cy={cy} r={r + 3}
        fill="none" stroke={color} strokeWidth={selected ? 2.5 : 1.5}
        opacity={selected ? 0.8 : 0.3}
      />

      {/* Main circle */}
      <circle cx={cx} cy={cy} r={r}
        fill={isGateway ? '#1e3a5f' : '#111c2d'}
        stroke={color} strokeWidth={isGateway ? 2.5 : 2}
      />

      {/* Icon */}
      <text x={cx} y={cy + (isGateway ? 5 : 4)} textAnchor="middle"
        fontSize={isGateway ? 16 : 13} dominantBaseline="middle"
        style={{ userSelect: 'none', pointerEvents: 'none' }}>
        {isGateway ? '🏛️' : device.connected ? '📱' : '📴'}
      </text>

      {/* Label */}
      <text x={cx} y={cy + r + 14} textAnchor="middle"
        fontSize={10} fontWeight={isGateway ? 700 : 500}
        fill={device.connected ? '#e8f0fe' : '#3d5a7a'}
        style={{ userSelect: 'none', pointerEvents: 'none' }}>
        {isGateway ? 'GATEWAY' : device.label}
      </text>
    </g>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NetworkGraph({ devices, edges, alertHistory, selectedDevice, onSelectDevice }) {
  const containerRef  = useRef(null);
  const [size, setSize] = useState({ w: 600, h: 420 });

  // Make the SVG responsive
  useEffect(() => {
    const obs = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // IDs of devices that received the most recent alert
  const latestAlert     = alertHistory?.[0];
  const recipientSet    = new Set(
    devices.filter((d) => d.alertReceived).map((d) => d.id)
  );

  // Build device map for edge lookup
  const deviceMap = Object.fromEntries(devices.map((d) => [d.id, d]));

  // Convert % positions to px
  function toPos(device) {
    const pad = 60; // keep nodes away from edges
    return {
      x: pad + (device.x / 100) * (size.w - pad * 2),
      y: pad + (device.y / 100) * (size.h - pad * 2),
    };
  }

  return (
    <div className="network-graph-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Mesh Network</h2>
          <p className="panel-sub-text">
            {devices.filter((d) => d.connected).length} connected ·{' '}
            {devices.filter((d) => !d.connected).length} offline
          </p>
        </div>
        <div className="network-legend">
          {[
            { color: '#22c55e', label: 'Connected'    },
            { color: '#ef4444', label: 'Offline'      },
            { color: '#f1c40f', label: 'Alert received' },
          ].map(({ color, label }) => (
            <span key={label} className="legend-item">
              <span className="legend-dot" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="network-graph-container" ref={containerRef}>
        <svg width={size.w} height={size.h} className="network-svg">
          {/* ── Edges ── */}
          {edges.map((edge, i) => {
            const src = deviceMap[edge.source];
            const tgt = deviceMap[edge.target];
            if (!src || !tgt) return null;
            const sp = toPos(src);
            const tp = toPos(tgt);
            const isActive = src.connected && tgt.connected;
            return (
              <line key={i}
                x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y}
                stroke={isActive ? '#22c55e' : '#1e3048'}
                strokeWidth={isActive ? 1.5 : 1}
                strokeDasharray={isActive ? undefined : '5 4'}
                opacity={edgeOpacity(src, tgt)}
              />
            );
          })}

          {/* ── Nodes ── */}
          {devices.map((device) => {
            const pos = toPos(device);
            return (
              <MeshNode
                key={device.id}
                device={device}
                cx={pos.x} cy={pos.y}
                selected={selectedDevice?.id === device.id}
                isRecipient={recipientSet.has(device.id)}
                onClick={onSelectDevice}
              />
            );
          })}
        </svg>

        {/* Hint */}
        <p className="graph-hint">Click a node to view device details</p>
      </div>
    </div>
  );
}

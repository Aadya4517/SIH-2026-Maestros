/**
 * NetworkVisualization.js
 * Real-time SVG diagram of the BLE mesh network.
 *
 * Layout:
 *   - Authority node in the centre
 *   - Up to 4 peer nodes arranged in a circle around it
 *   - Lines (edges) between Authority and each peer
 *
 * Node colours:
 *   - Green  (#27ae60)  — connected  (RSSI > −70 dBm)
 *   - Red    (#e74c3c)  — disconnected / weak (RSSI ≤ −70 dBm)
 *   - Yellow (#f1c40f)  — just received alert (glows for 3 seconds)
 *
 * Dependencies: react-native-svg  (add to package.json before building)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  StatusBar,
  ScrollView,
  Animated,
} from 'react-native';
import Svg, {
  Circle,
  Line,
  Text as SvgText,
  Defs,
  RadialGradient,
  Stop,
  G,
} from 'react-native-svg';
import { useMessage } from '../context/MessageContext';

// ─── Layout constants ─────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SVG_SIZE   = Math.min(SCREEN_WIDTH - 40, 340);
const CENTER_X   = SVG_SIZE / 2;
const CENTER_Y   = SVG_SIZE / 2;
const ORBIT_R    = SVG_SIZE * 0.35;     // radius of the peer orbit
const NODE_R     = 28;                  // node circle radius
const AUTHORITY_R = 34;                 // authority is slightly larger

// Peer node positions — evenly spaced around a circle
function peerPosition(index, total) {
  // Start from the top (−π/2) and go clockwise
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return {
    x: CENTER_X + ORBIT_R * Math.cos(angle),
    y: CENTER_Y + ORBIT_R * Math.sin(angle),
  };
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function nodeColor(device, isRecipient) {
  if (isRecipient) return '#f1c40f';                      // yellow — just received
  if (!device.connected) return '#e74c3c';                // red — disconnected
  if (device.rssi != null && device.rssi <= -70) return '#e74c3c'; // weak signal
  return '#27ae60';                                       // green — healthy
}

function edgeColor(device, isRecipient) {
  if (isRecipient) return '#f1c40f';
  if (!device.connected) return '#3a3a5a';
  return '#27ae60';
}

// ─── Animated glow ring ───────────────────────────────────────────────────────
// Rendered as a larger, semi-transparent circle behind the node.

function GlowRing({ cx, cy, r, color, visible }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      return;
    }
    // Pulse: fade in then out slowly
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.7, duration: 300, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.7, duration: 500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.2, duration: 500, useNativeDriver: true }),
        ]),
        { iterations: 3 },
      ),
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [visible, opacity]);

  // react-native-svg doesn't support Animated directly on SVG elements,
  // so we wrap in an Animated.View and position absolutely.
  // The glow ring lives in regular RN space, overlapping the SVG.
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position:    'absolute',
        left:        cx - r - 8,
        top:         cy - r - 8,
        width:       (r + 8) * 2,
        height:      (r + 8) * 2,
        borderRadius: r + 8,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NetworkVisualization() {
  const {
    connectedDevices,
    lastAlertRecipients,
    peerCount,
    isBleReady,
    bleError,
    deliveryStats,
  } = useMessage();

  // Keep track of recipient IDs for 3 seconds after an alert
  const [activeRecipients, setActiveRecipients] = useState(new Set());
  const recipientTimer = useRef(null);

  useEffect(() => {
    if (!lastAlertRecipients || lastAlertRecipients.size === 0) return;

    setActiveRecipients(new Set(lastAlertRecipients));

    clearTimeout(recipientTimer.current);
    recipientTimer.current = setTimeout(() => {
      setActiveRecipients(new Set());
    }, 3000);

    return () => clearTimeout(recipientTimer.current);
  }, [lastAlertRecipients]);

  const statusColor = isBleReady ? '#27ae60' : bleError ? '#e74c3c' : '#f39c12';
  const statusText  = bleError
    ? `Error: ${bleError}`
    : isBleReady
    ? `● ${peerCount} peer${peerCount !== 1 ? 's' : ''} connected`
    : '○ Initialising…';

  // Build the list of displayed devices. Always show 4 slots even if empty,
  // so the layout stays stable during demo.
  const SLOT_COUNT = 4;
  const deviceSlots = Array.from({ length: SLOT_COUNT }, (_, i) => {
    return connectedDevices[i] || {
      id:        `slot-${i}`,
      label:     `Phone ${i + 2}`,
      connected: false,
      rssi:      null,
    };
  });

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#1a1a2e" barStyle="light-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>OFFLINE MESH</Text>
        <Text style={styles.headerSub}>Network View</Text>
      </View>

      {/* ── Status ── */}
      <View style={[styles.statusBar, { borderLeftColor: statusColor }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
      </View>

      {/* ── SVG diagram ── */}
      <View style={styles.svgContainer}>
        {/* Glow rings (Animated.View layer — sits behind the SVG) */}
        <View style={[StyleSheet.absoluteFill, { width: SVG_SIZE, height: SVG_SIZE }]}>
          {/* Authority glow */}
          <GlowRing
            cx={CENTER_X}
            cy={CENTER_Y}
            r={AUTHORITY_R}
            color="#3498db"
            visible={activeRecipients.size > 0}
          />
          {/* Peer glows */}
          {deviceSlots.map((device, i) => {
            const pos         = peerPosition(i, SLOT_COUNT);
            const isRecipient = activeRecipients.has(device.id);
            return (
              <GlowRing
                key={device.id}
                cx={pos.x}
                cy={pos.y}
                r={NODE_R}
                color={nodeColor(device, isRecipient)}
                visible={isRecipient}
              />
            );
          })}
        </View>

        {/* Main SVG */}
        <Svg width={SVG_SIZE} height={SVG_SIZE}>
          <Defs>
            {/* Gradient for authority node */}
            <RadialGradient id="authorityGrad" cx="50%" cy="50%" r="50%">
              <Stop offset="0%"   stopColor="#5dade2" stopOpacity="1" />
              <Stop offset="100%" stopColor="#1a5276" stopOpacity="1" />
            </RadialGradient>
          </Defs>

          {/* ── Edges ── */}
          {deviceSlots.map((device, i) => {
            const pos         = peerPosition(i, SLOT_COUNT);
            const isRecipient = activeRecipients.has(device.id);
            return (
              <Line
                key={`edge-${device.id}`}
                x1={CENTER_X} y1={CENTER_Y}
                x2={pos.x}    y2={pos.y}
                stroke={edgeColor(device, isRecipient)}
                strokeWidth={isRecipient ? 3 : 1.5}
                strokeDasharray={device.connected ? undefined : '6 4'}
                opacity={device.connected ? 1 : 0.4}
              />
            );
          })}

          {/* ── Peer nodes ── */}
          {deviceSlots.map((device, i) => {
            const pos         = peerPosition(i, SLOT_COUNT);
            const isRecipient = activeRecipients.has(device.id);
            const fill        = nodeColor(device, isRecipient);

            return (
              <G key={device.id}>
                <Circle
                  cx={pos.x} cy={pos.y}
                  r={NODE_R}
                  fill={fill}
                  opacity={device.connected ? 1 : 0.45}
                  stroke={isRecipient ? '#ffffff' : 'transparent'}
                  strokeWidth={2}
                />
                {/* Phone icon */}
                <SvgText
                  x={pos.x} y={pos.y - 4}
                  fontSize="16"
                  textAnchor="middle"
                  fill="#ffffff">
                  📱
                </SvgText>
                {/* Label below node */}
                <SvgText
                  x={pos.x}
                  y={pos.y + NODE_R + 14}
                  fontSize="11"
                  fontWeight="700"
                  textAnchor="middle"
                  fill={device.connected ? '#ecf0f1' : '#666688'}>
                  {device.label}
                </SvgText>
                {/* RSSI below label */}
                {device.rssi != null && (
                  <SvgText
                    x={pos.x}
                    y={pos.y + NODE_R + 26}
                    fontSize="9"
                    textAnchor="middle"
                    fill={fill}>
                    {device.rssi} dBm
                  </SvgText>
                )}
              </G>
            );
          })}

          {/* ── Authority node (centre) ── */}
          <Circle
            cx={CENTER_X} cy={CENTER_Y}
            r={AUTHORITY_R}
            fill="url(#authorityGrad)"
            stroke="#5dade2"
            strokeWidth={2}
          />
          <SvgText
            x={CENTER_X} y={CENTER_Y - 6}
            fontSize="18"
            textAnchor="middle"
            fill="#ffffff">
            🏛️
          </SvgText>
          <SvgText
            x={CENTER_X} y={CENTER_Y + 10}
            fontSize="10"
            fontWeight="900"
            textAnchor="middle"
            fill="#ffffff"
            letterSpacing="1">
            AUTHORITY
          </SvgText>
        </Svg>
      </View>

      {/* ── Legend ── */}
      <View style={styles.legend}>
        {[
          { color: '#27ae60', label: 'Connected (RSSI > −70 dBm)' },
          { color: '#e74c3c', label: 'Disconnected / Weak signal'  },
          { color: '#f1c40f', label: 'Alert received (3 s glow)'   },
          { color: '#5dade2', label: 'Authority phone'              },
        ].map(({ color, label }) => (
          <View key={label} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      {/* ── Last delivery summary ── */}
      {deliveryStats && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Last Alert</Text>
          <Text style={styles.summaryValue}>
            {deliveryStats.count}/{deliveryStats.total} phones · {deliveryStats.ms} ms
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 4,
  },
  headerSub: {
    fontSize: 13,
    color: '#8888aa',
    letterSpacing: 2,
    marginTop: 4,
  },
  statusBar: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  svgContainer: {
    alignItems: 'center',
    marginBottom: 20,
    // Relative positioning so the glow rings (absolute children) overlay SVG
    position: 'relative',
    width: SVG_SIZE,
    height: SVG_SIZE,
    alignSelf: 'center',
  },
  legend: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 14,
    gap: 8,
    marginBottom: 16,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 13,
    color: '#aaaacc',
  },
  summaryBox: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#0f3460',
  },
  summaryTitle: {
    fontSize: 10,
    color: '#8888aa',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ecf0f1',
  },
});

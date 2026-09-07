/**
 * AnalyticsDashboard.js
 * Delivery analytics shown after an alert is sent.
 *
 * Metrics displayed:
 *  1. Delivery success rate  — "4/5 phones (80%)"
 *  2. Average delivery time  — "Avg: 2.8 s"
 *  3. Signal strength        — colour-coded RSSI badge
 *  4. Network efficiency     — successful / total attempts
 *  5. Per-phone detail table — phone ID, delivery time, signal
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useMessage } from '../context/MessageContext';
import { ALERT_TYPES } from '../services/MessageService';

// ─── RSSI helpers ─────────────────────────────────────────────────────────────

function rssiLabel(rssi) {
  if (rssi == null) return { label: 'N/A',       color: '#666688' };
  if (rssi >  -60)  return { label: 'Excellent',  color: '#27ae60' };
  if (rssi >= -70)  return { label: 'Good',        color: '#f39c12' };
  return                   { label: 'Weak',        color: '#e74c3c' };
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ title, value, sub, valueColor }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.cardValue, valueColor && { color: valueColor }]}>
        {value}
      </Text>
      {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
    </View>
  );
}

// ─── Per-phone row ────────────────────────────────────────────────────────────

function PhoneRow({ phone, index }) {
  const rssi     = rssiLabel(phone.signal_strength_rssi);
  const received = phone.received;

  return (
    <View style={[styles.phoneRow, !received && styles.phoneRowFailed]}>
      {/* Index + status dot */}
      <View style={styles.phoneLeft}>
        <View style={[styles.statusDot, { backgroundColor: received ? '#27ae60' : '#e74c3c' }]} />
        <Text style={styles.phoneLabel}>{phone.label || `Phone ${index + 2}`}</Text>
      </View>

      {/* Delivery time */}
      <Text style={[styles.phoneTime, !received && styles.phoneTimeFailed]}>
        {received && phone.delivery_time_ms != null
          ? `${phone.delivery_time_ms} ms`
          : 'Not received'}
      </Text>

      {/* Signal */}
      <View style={[styles.signalBadge, { borderColor: rssi.color }]}>
        <Text style={[styles.signalText, { color: rssi.color }]}>
          {phone.signal_strength_rssi != null ? `${phone.signal_strength_rssi} dBm` : '—'}
        </Text>
      </View>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📊</Text>
      <Text style={styles.emptyTitle}>No data yet</Text>
      <Text style={styles.emptyText}>
        Send an alert from the Authority tab to see delivery analytics here.
      </Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const { deliveryStats, isBleReady, bleError } = useMessage();

  const statusColor = isBleReady ? '#27ae60' : bleError ? '#e74c3c' : '#f39c12';
  const statusText  = bleError
    ? `BLE Error: ${bleError}`
    : isBleReady
    ? '● BLE Ready'
    : '○ Initialising…';

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = React.useMemo(() => {
    if (!deliveryStats) return null;

    const { count, ms, total, type, perPhone = [] } = deliveryStats;

    const successRate = total > 0 ? Math.round((count / total) * 100) : 0;

    const receivedPhones = perPhone.filter(p => p.received && p.delivery_time_ms != null);
    const avgDelivery    = receivedPhones.length > 0
      ? Math.round(receivedPhones.reduce((s, p) => s + p.delivery_time_ms, 0) / receivedPhones.length)
      : ms;

    const rssiValues = perPhone
      .filter(p => p.signal_strength_rssi != null && p.received)
      .map(p => p.signal_strength_rssi);
    const avgRssi = rssiValues.length > 0
      ? Math.round(rssiValues.reduce((s, v) => s + v, 0) / rssiValues.length)
      : null;

    const efficiency = total > 0
      ? Math.round((count / (total || 1)) * 100)
      : 0;

    const alertDef = ALERT_TYPES[type] || ALERT_TYPES.FLOOD;

    return { successRate, avgDelivery, avgRssi, efficiency, perPhone, alertDef, count, total };
  }, [deliveryStats]);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#1a1a2e" barStyle="light-content" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>OFFLINE MESH</Text>
        <Text style={styles.headerSub}>Analytics Dashboard</Text>
      </View>

      {/* ── Status ── */}
      <View style={[styles.statusBar, { borderLeftColor: statusColor }]}>
        <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
      </View>

      {!stats ? (
        <EmptyState />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── Alert type banner ── */}
          <View style={[styles.alertBanner, { borderColor: stats.alertDef.color }]}>
            <Text style={styles.alertBannerIcon}>{stats.alertDef.icon}</Text>
            <Text style={[styles.alertBannerText, { color: stats.alertDef.color }]}>
              Last alert: {stats.alertDef.label}
            </Text>
          </View>

          {/* ── Summary cards ── */}
          <View style={styles.cardGrid}>
            <StatCard
              title="DELIVERY RATE"
              value={`${stats.count}/${stats.total} phones`}
              sub={`${stats.successRate}% success`}
              valueColor={stats.successRate >= 80 ? '#27ae60' : stats.successRate >= 50 ? '#f39c12' : '#e74c3c'}
            />
            <StatCard
              title="AVG DELIVERY TIME"
              value={`${(stats.avgDelivery / 1000).toFixed(1)} s`}
              sub={`${stats.avgDelivery} ms`}
              valueColor={stats.avgDelivery < 3000 ? '#27ae60' : stats.avgDelivery < 5000 ? '#f39c12' : '#e74c3c'}
            />
            <StatCard
              title="AVG SIGNAL"
              value={stats.avgRssi != null ? `${stats.avgRssi} dBm` : 'N/A'}
              sub={rssiLabel(stats.avgRssi).label}
              valueColor={rssiLabel(stats.avgRssi).color}
            />
            <StatCard
              title="NETWORK EFFICIENCY"
              value={`${stats.efficiency}%`}
              sub="successful / total"
              valueColor={stats.efficiency >= 80 ? '#27ae60' : '#f39c12'}
            />
          </View>

          {/* ── Per-phone breakdown ── */}
          {stats.perPhone.length > 0 && (
            <View style={styles.tableContainer}>
              <Text style={styles.tableTitle}>Per-Phone Delivery</Text>

              {/* Column headers */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Device</Text>
                <Text style={styles.tableHeaderCell}>Time</Text>
                <Text style={styles.tableHeaderCell}>Signal</Text>
              </View>

              {stats.perPhone.map((phone, idx) => (
                <PhoneRow key={phone.phone_id || idx} phone={phone} index={idx} />
              ))}
            </View>
          )}

          {/* ── Legend ── */}
          <View style={styles.legend}>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#27ae60' }]} />
              <Text style={styles.legendText}>Excellent: &gt; −60 dBm</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#f39c12' }]} />
              <Text style={styles.legendText}>Good: −60 to −70 dBm</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#e74c3c' }]} />
              <Text style={styles.legendText}>Weak: &lt; −70 dBm</Text>
            </View>
          </View>

        </ScrollView>
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

  // ── Empty ──
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 12,
  },
  emptyIcon: {
    fontSize: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ecf0f1',
  },
  emptyText: {
    fontSize: 14,
    color: '#8888aa',
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Alert banner ──
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#16213e',
    borderRadius: 10,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
  },
  alertBannerIcon: {
    fontSize: 22,
  },
  alertBannerText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ── Summary cards grid ──
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  card: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  cardTitle: {
    fontSize: 10,
    color: '#8888aa',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ecf0f1',
  },
  cardSub: {
    fontSize: 12,
    color: '#8888aa',
  },

  // ── Per-phone table ──
  tableContainer: {
    marginBottom: 20,
  },
  tableTitle: {
    fontSize: 11,
    color: '#8888aa',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a4a',
    marginBottom: 4,
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 10,
    color: '#666688',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  phoneRowFailed: {
    opacity: 0.55,
  },
  phoneLeft: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  phoneLabel: {
    fontSize: 14,
    color: '#ecf0f1',
    fontWeight: '600',
  },
  phoneTime: {
    flex: 1,
    fontSize: 13,
    color: '#27ae60',
    fontWeight: '700',
  },
  phoneTimeFailed: {
    color: '#e74c3c',
  },
  signalBadge: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  signalText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Legend ──
  legend: {
    backgroundColor: '#16213e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    color: '#aaaacc',
  },
});

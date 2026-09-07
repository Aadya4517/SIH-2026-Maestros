/**
 * useDashboardData.js
 * Central data hook — polls the service layer and provides state to all pages.
 *
 * FUTURE: Replace polling with WebSocket subscription.
 *   const ws = new WebSocket('ws://gateway:8080');
 *   ws.onmessage = (e) => dispatch(JSON.parse(e.data));
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getNetworkStatus,
  getActiveAlerts,
  getAlertHistory,
  getDevices,
  getMeshEdges,
  getDeliveryMetrics,
  getCoverageArea,
} from '../services/dashboardService.js';

const POLL_INTERVAL_MS = 5000; // 5 s — simulates real-time updates

export function useDashboardData() {
  const [networkStatus,   setNetworkStatus]   = useState(null);
  const [activeAlerts,    setActiveAlerts]    = useState([]);
  const [alertHistory,    setAlertHistory]    = useState([]);
  const [devices,         setDevices]         = useState([]);
  const [edges,           setEdges]           = useState([]);
  const [deliveryMetrics, setDeliveryMetrics] = useState(null);
  const [coverageArea,    setCoverageArea]    = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [lastRefresh,     setLastRefresh]     = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [ns, aa, ah, devs, eds, dm, ca] = await Promise.all([
        getNetworkStatus(),
        getActiveAlerts(),
        getAlertHistory(),
        getDevices(),
        getMeshEdges(),
        getDeliveryMetrics(),
        getCoverageArea(),
      ]);
      setNetworkStatus(ns);
      setActiveAlerts(aa);
      setAlertHistory(ah);
      setDevices(devs);
      setEdges(eds);
      setDeliveryMetrics(dm);
      setCoverageArea(ca);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[useDashboardData] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return {
    networkStatus,
    activeAlerts,
    alertHistory,
    devices,
    edges,
    deliveryMetrics,
    coverageArea,
    loading,
    lastRefresh,
    refresh: fetchAll,
  };
}

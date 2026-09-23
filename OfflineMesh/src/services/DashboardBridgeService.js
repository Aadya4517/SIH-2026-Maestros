/**
 * Optional local connection from the Authority phone to the laptop dashboard.
 * BLE alerts do not depend on this bridge.
 *
 * Set this to the laptop's IPv4 address on the same Wi-Fi/hotspot network.
 * Example: http://192.168.137.1:8787
 */
const DASHBOARD_SERVER_URL = 'http://192.168.1.4:8787';
const REQUEST_TIMEOUT_MS = 1000;

export async function publishDashboardState(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${DASHBOARD_SERVER_URL}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return true;
  } catch (error) {
    // Never let a dashboard failure block BLE alert sending.
    console.log('[DashboardBridge] unavailable:', error?.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

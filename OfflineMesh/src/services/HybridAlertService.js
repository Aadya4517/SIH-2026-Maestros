/**
 * HybridAlertService.js
 *
 * The smart routing brain of OfflineMesh.
 *
 * ONE button on the sender screen. The system figures out the best
 * path automatically — the user never has to think about it.
 *
 * Decision logic:
 *   ONLINE  → Try PUSH API first, ALSO send via BLE (redundancy)
 *   OFFLINE → BLE mesh only
 *   BOTH paths succeed → "Maximum Coverage" mode
 *
 * Why BLE even when online?
 *   PUSH API reaches distant phones instantly.
 *   BLE reaches nearby phones even when PUSH fails or is delayed.
 *   Redundancy keeps people alive.
 *
 * NOTE ON PUSH API:
 *   Firebase Cloud Messaging is the intended PUSH backend. It requires
 *   adding google-services.json and native Firebase SDK setup to the
 *   Android project. That native setup is intentionally left as a
 *   connection point here so it can be wired in without changing any
 *   other file. See sendViaPush() below for the integration point.
 *
 *   Until Firebase is configured, PUSH is gracefully skipped and the
 *   system falls back to BLE-only mode automatically.
 */

import NetInfo from '@react-native-community/netinfo';
import { broadcastAlert } from './BleService';

// ─── Internet connectivity check ─────────────────────────────────────────────

/**
 * checkInternetConnection
 *
 * Returns true if the device has a working internet connection.
 * Uses the NetInfo library — already in package.json.
 *
 * The `isInternetReachable` flag is more reliable than `isConnected`
 * because it actually tries to reach the internet, not just checks
 * if Wi-Fi or cellular is on.
 */
export async function checkInternetConnection() {
  try {
    const state = await NetInfo.fetch();
    // isInternetReachable can be null if the check hasn't completed yet
    // Fall back to isConnected in that case
    return state.isInternetReachable === true || state.isConnected === true;
  } catch (e) {
    console.warn('[Hybrid] NetInfo check failed:', e.message);
    return false;
  }
}

// ─── PUSH delivery (Firebase FCM integration point) ──────────────────────────

/**
 * sendViaPush
 *
 * Sends the alert via Firebase Cloud Messaging to all registered devices.
 *
 * INTEGRATION POINT — to wire up Firebase:
 *   1. Add google-services.json to android/app/
 *   2. Add to android/build.gradle:
 *        classpath('com.google.gms:google-services:4.4.0')
 *   3. Add to android/app/build.gradle:
 *        apply plugin: 'com.google.gms.google-services'
 *        implementation platform('com.google.firebase:firebase-bom:32.7.0')
 *        implementation 'com.google.firebase:firebase-messaging'
 *   4. npm install @react-native-firebase/app @react-native-firebase/messaging
 *   5. Replace the stub below with real FCM topic send
 *
 * @param {object} message  the full alert message object
 * @returns {boolean}       true if PUSH was delivered
 */
async function sendViaPush(message) {
  // ── STUB — replace with real Firebase call ──────────────────────────────
  // Example real implementation:
  //
  //   import messaging from '@react-native-firebase/messaging';
  //   await messaging().sendMessage({
  //     to: '/topics/offlinemesh-alerts',
  //     notification: {
  //       title: message.message,
  //       body: `${message.type} alert — take immediate action`,
  //     },
  //     data: {
  //       message_id: message.message_id,
  //       type:       message.type,
  //       timestamp:  String(message.timestamp),
  //       ttl:        String(message.ttl),
  //       sender_id:  message.sender_id,
  //     },
  //   });
  //   return true;
  // ───────────────────────────────────────────────────────────────────────

  // Until Firebase is configured, this always returns false so we
  // gracefully fall back to BLE-only mode.
  console.log('[Hybrid] PUSH stub called — Firebase not yet configured');
  return false;
}

// ─── Main routing function ────────────────────────────────────────────────────

/**
 * sendAlertAutomatic
 *
 * The single entry point called by MessageContext when an alert is sent.
 *
 * Returns a status string for display on the sender screen and a results
 * object for delivery tracking.
 *
 * @param {object}   message       the full message object from MessageService
 * @returns {object} { statusText, bleResults, pushSuccess, isOnline }
 */
export async function sendAlertAutomatic(message) {
  // ── Step 1: Check connectivity ────────────────────────────────────────────
  const isOnline = await checkInternetConnection();
  console.log('[Hybrid] Internet available:', isOnline);

  const sent = { push: false, ble: false };
  let bleResults = {};

  // ── Step 2: PUSH (only when online) ──────────────────────────────────────
  if (isOnline) {
    try {
      const pushOk = await sendViaPush(message);
      sent.push = pushOk;
      if (pushOk) {
        console.log('[Hybrid] ✓ Alert delivered via PUSH');
      }
    } catch (e) {
      // PUSH failure never blocks BLE
      console.warn('[Hybrid] PUSH failed, continuing with BLE:', e.message);
    }
  }

  // ── Step 3: BLE (always — online for redundancy, offline as primary) ──────
  try {
    bleResults = await broadcastAlert(message);
    const bleCount = Object.values(bleResults).filter(Boolean).length;
    sent.ble = bleCount > 0;
    console.log('[Hybrid] BLE delivered to', bleCount, 'peer(s)');
  } catch (e) {
    console.warn('[Hybrid] BLE broadcast failed:', e.message);
  }

  // ── Step 4: Compose status string ─────────────────────────────────────────
  let statusText;
  let statusEmoji;

  if (sent.push && sent.ble) {
    statusText  = 'Sent via PUSH + BLE (Maximum Coverage)';
    statusEmoji = '✅';
  } else if (sent.push) {
    statusText  = 'Sent via PUSH (Online)';
    statusEmoji = '🌐';
  } else if (sent.ble) {
    statusText  = isOnline
      ? 'Sent via BLE — PUSH unavailable'
      : 'Sent via BLE (Offline Mode)';
    statusEmoji = '📡';
  } else {
    statusText  = 'Alert failed — no peers connected and no internet';
    statusEmoji = '❌';
  }

  return {
    statusText:  `${statusEmoji} ${statusText}`,
    bleResults,
    pushSuccess: sent.push,
    isOnline,
    anySuccess:  sent.push || sent.ble,
  };
}

// ─── Repeated alert sender ────────────────────────────────────────────────────

/**
 * SEVERITY_CONFIG
 *
 * How many times and how often each severity level resends the alert.
 *
 *   ONE_TIME  — sent once, done
 *   MODERATE  — sent 3 times total, 2 minute gaps (6 min window)
 *   CRITICAL  — sent 5 times total, 2 minute gaps (10 min window)
 */
export const SEVERITY_CONFIG = {
  ONE_TIME: {
    key:         'ONE_TIME',
    label:       'One-time',
    description: 'Send once',
    repeatCount: 0,   // 0 extra repeats = sent once total
    intervalMs:  0,
    icon:        '1️⃣',
  },
  MODERATE: {
    key:         'MODERATE',
    label:       'Moderate',
    description: 'Repeat 3× over 6 minutes',
    repeatCount: 2,   // 2 more after the first = 3 total
    intervalMs:  2 * 60 * 1000,
    icon:        '⚠️',
  },
  CRITICAL: {
    key:         'CRITICAL',
    label:       'CRITICAL',
    description: 'Repeat 5× over 10 minutes',
    repeatCount: 4,   // 4 more after the first = 5 total
    intervalMs:  2 * 60 * 1000,
    icon:        '🔴',
  },
};

// Track active repeat intervals so they can be cancelled
const activeIntervals = new Map();

/**
 * scheduleRepeats
 *
 * After the initial send, schedules additional sends at fixed intervals
 * according to the chosen severity level.
 *
 * Uses the same message object (same message_id) intentionally — receivers
 * that already acknowledged it will deduplicate and ignore the repeats.
 * This is the correct behaviour: repeats are for phones that haven't
 * received it yet.
 *
 * @param {string}   alertId     unique key to cancel this repeat schedule
 * @param {object}   message     the original message object
 * @param {string}   severity    key from SEVERITY_CONFIG
 * @param {function} onRepeat    called on each repeat with (repeatNumber, result)
 */
export function scheduleRepeats(alertId, message, severity, onRepeat) {
  const config = SEVERITY_CONFIG[severity];
  if (!config || config.repeatCount <= 0) return;

  let count = 0;

  const intervalId = setInterval(async () => {
    count++;
    console.log(`[Hybrid] Repeat ${count}/${config.repeatCount} for alert`, alertId);

    const result = await sendAlertAutomatic(message);
    if (onRepeat) onRepeat(count, result);

    if (count >= config.repeatCount) {
      clearInterval(intervalId);
      activeIntervals.delete(alertId);
      console.log('[Hybrid] Repeat schedule complete for', alertId);
    }
  }, config.intervalMs);

  activeIntervals.set(alertId, intervalId);
}

/**
 * cancelRepeats
 *
 * Stops a repeat schedule before it finishes.
 * Call this if the user manually cancels or the app closes.
 *
 * @param {string} alertId
 */
export function cancelRepeats(alertId) {
  const id = activeIntervals.get(alertId);
  if (id) {
    clearInterval(id);
    activeIntervals.delete(alertId);
    console.log('[Hybrid] Repeat schedule cancelled for', alertId);
  }
}

/**
 * cancelAllRepeats — call on app shutdown
 */
export function cancelAllRepeats() {
  activeIntervals.forEach((id) => clearInterval(id));
  activeIntervals.clear();
}

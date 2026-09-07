/**
 * MessageService.js
 *
 * This file handles the "logic layer" of alerts — everything that happens
 * AFTER a message arrives over BLE and BEFORE it shows up on screen.
 *
 * Its three main jobs:
 *   1. CREATE messages — stamp them with a unique ID, timestamp, and TTL
 *   2. DEDUPLICATE — make sure the same alert doesn't show up twice
 *      (since it might arrive from multiple relay hops)
 *   3. RELAY — forward the message to other phones if there are still
 *      hops left (TTL > 0), so the alert spreads through the mesh
 *
 * TTL (Time-To-Live) explained:
 *   Imagine you shout a message across a crowd: you tell the first person,
 *   they tell the next, and so on. TTL = 5 means the message can travel
 *   through up to 5 "hops" before it stops propagating. This prevents
 *   the message from bouncing around the network forever.
 */

import uuid from 'react-native-uuid';
import { broadcastAlert } from './BleService';

// Each alert starts with 5 hops — enough to cross a 5-device mesh
const INITIAL_TTL = 5;

/**
 * ALERT_TYPES
 *
 * All four disaster types this app supports, along with their display info.
 * Keeping this in one place means if you need to change a colour or icon,
 * you only edit it here and every screen updates automatically.
 */
export const ALERT_TYPES = {
  FLOOD: {
    key:       'FLOOD',
    label:     'FLOOD',
    message:   'FLOOD ALERT',
    subtitle:  'EVACUATE IMMEDIATELY',
    color:     '#FF0000',
    darkColor: '#7f0000',
    icon:      '🌊',
  },
  LANDSLIDE: {
    key:       'LANDSLIDE',
    label:     'LANDSLIDE',
    message:   'LANDSLIDE ALERT',
    subtitle:  'MOVE TO HIGHER GROUND',
    color:     '#FF8C00',
    darkColor: '#7f4600',
    icon:      '⛰️',
  },
  AVALANCHE: {
    key:       'AVALANCHE',
    label:     'AVALANCHE',
    message:   'AVALANCHE ALERT',
    subtitle:  'SEEK SHELTER NOW',
    color:     '#c8a800',
    darkColor: '#6b5800',
    icon:      '🏔️',
  },
  EARTHQUAKE: {
    key:       'EARTHQUAKE',
    label:     'EARTHQUAKE',
    message:   'EARTHQUAKE ALERT',
    subtitle:  'DROP, COVER, HOLD ON',
    color:     '#8B008B',
    darkColor: '#450045',
    icon:      '🌍',
  },
};

export const DEFAULT_ALERT_TYPE = 'FLOOD';

// ─── Deduplication store ──────────────────────────────────────────────────────
// A Set gives us O(1) lookup — "have I seen this message before?" is instant.
// We store message_ids, not the full messages, to keep memory usage tiny.
const seenMessages = new Set();

// ─── This phone's identity ────────────────────────────────────────────────────
// Generate a random UUID when the app starts. This identifies which phone
// sent the original alert. In a production app you'd want to persist this
// in AsyncStorage so the ID stays the same across app restarts.
const DEVICE_ID = uuid.v4();
console.log('[MessageService] This device ID:', DEVICE_ID);

export function getDeviceId() {
  return DEVICE_ID;
}

// ─── Creating a new alert message ────────────────────────────────────────────
/**
 * createMessage
 *
 * Builds a fresh alert object ready to be sent over BLE.
 * Every field here has a purpose:
 *   - sender_id:  lets receivers know who originally triggered the alert
 *   - type:       which kind of disaster (FLOOD, LANDSLIDE, etc.)
 *   - message:    human-readable text shown on the receiver's screen
 *   - timestamp:  when the alert was first created (ms since epoch)
 *   - ttl:        how many more hops this message is allowed to travel
 *   - message_id: unique ID used to detect and ignore duplicate messages
 *
 * @param {string} type  one of the ALERT_TYPES keys, defaults to 'FLOOD'
 */
export function createMessage(type = DEFAULT_ALERT_TYPE) {
  const alertDef = ALERT_TYPES[type] || ALERT_TYPES.FLOOD;

  const message = {
    sender_id:  DEVICE_ID,
    type:       alertDef.key,
    message:    alertDef.message,
    timestamp:  Date.now(),
    ttl:        INITIAL_TTL,
    message_id: uuid.v4(),
  };

  // Pre-emptively mark this message as seen so that if another phone
  // relays it back to us, we don't display it again as a new alert.
  seenMessages.add(message.message_id);

  console.log('[MessageService] Created message:', message.message_id, 'type:', type);
  return message;
}

// ─── TTL management ───────────────────────────────────────────────────────────

/**
 * decrementTTL
 * Returns a NEW message object with ttl reduced by 1.
 * We never mutate the original — immutable updates prevent subtle bugs
 * where the same object gets modified in two places at once.
 */
export function decrementTTL(message) {
  return { ...message, ttl: message.ttl - 1 };
}

/**
 * shouldRelay
 * Simple check: if TTL is still above 0, this message can travel one more hop.
 */
export function shouldRelay(message) {
  return message.ttl > 0;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

/**
 * isDuplicate
 * Returns true if we've already processed this exact message.
 * This is what stops alerts from looping forever around the mesh.
 */
export function isDuplicate(message_id) {
  return seenMessages.has(message_id);
}

/** Mark a message ID as processed so we won't handle it again */
export function markSeen(message_id) {
  seenMessages.add(message_id);
}

// ─── Relaying a message to other phones ──────────────────────────────────────
/**
 * relayMessage
 *
 * When we receive an alert, our job is to pass it along — just like a
 * chain of people passing a note. We subtract one hop (decrementTTL)
 * to track how far the message has already travelled, then broadcast
 * it to everyone we're connected to.
 *
 * @param {object} message  the received message (will be TTL-decremented)
 */
export async function relayMessage(message) {
  const relayed = decrementTTL(message);
  console.log('[MessageService] Relaying message', relayed.message_id, '— TTL now', relayed.ttl);
  return broadcastAlert(relayed);
}

// ─── The main entry point for all received messages ──────────────────────────
/**
 * handleIncomingMessage
 *
 * This is the "traffic controller" for incoming alerts. Every message
 * that arrives over BLE passes through here. The flow is:
 *
 *   1. Validate — does it look like a real message?
 *   2. Dedup check — have we seen this message_id before? If yes, ignore.
 *   3. Mark seen — record the ID immediately, before any async work,
 *      to prevent race conditions where the same message arrives twice
 *      in quick succession.
 *   4. Notify the UI — call onNewAlert so the screen can update.
 *   5. Relay — if TTL allows, forward the message to our other peers.
 *
 * @param {object}   message    the raw parsed message from BleService
 * @param {function} onNewAlert called with the message when it's genuinely new
 */
export async function handleIncomingMessage(message, onNewAlert) {
  // Basic sanity check — malformed messages get dropped silently
  if (!message || !message.message_id) {
    console.warn('[MessageService] Dropped invalid message:', message);
    return;
  }

  // Already seen this one — could be a relay from another hop, ignore it
  if (isDuplicate(message.message_id)) {
    console.log('[MessageService] Duplicate ignored:', message.message_id);
    return;
  }

  // Mark seen RIGHT NOW before doing anything async — this is important!
  // If we waited until after the await, a second copy of the same message
  // could sneak through in the meantime.
  markSeen(message.message_id);

  // Backwards compatibility: older app versions didn't include 'type' in messages
  if (!message.type) {
    message = { ...message, type: DEFAULT_ALERT_TYPE };
  }

  // Tell the UI about this new alert
  console.log('[MessageService] ✓ New alert received:', message);
  if (onNewAlert) onNewAlert(message);

  // Pass it along to the next phones in the chain (if there are hops left)
  if (shouldRelay(message)) {
    try {
      await relayMessage(message);
    } catch (e) {
      console.warn('[MessageService] Relay failed:', e.message);
    }
  } else {
    console.log('[MessageService] TTL reached 0 — message stops here:', message.message_id);
  }
}

// ─── Debug helpers ────────────────────────────────────────────────────────────

/** How many unique messages have we seen so far this session? */
export function getSeenCount() {
  return seenMessages.size;
}

/** Reset the dedup store — useful for testing */
export function clearSeenMessages() {
  seenMessages.clear();
}

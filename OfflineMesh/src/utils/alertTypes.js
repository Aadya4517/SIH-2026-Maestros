/**
 * alertTypes.js
 *
 * Single source of truth for alert type definitions.
 *
 * Both the mobile app and (conceptually) the dashboard use the same
 * type keys. If you add a new disaster type, add it here and it
 * propagates everywhere automatically.
 *
 * This file is intentionally plain JS (no React imports) so it can be
 * imported from services, screens, and tests without any side effects.
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

/** Returns the definition for a type key, falling back to FLOOD if unknown */
export function getAlertDef(type) {
  return ALERT_TYPES[type] || ALERT_TYPES.FLOOD;
}

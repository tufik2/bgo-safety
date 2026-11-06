// Finds the property the user is standing at.
// Uses the device GPS, or a simulated position chosen in the app (POC demo aid,
// since emulators and the browser preview aren't at the sample properties).
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { Store } from './store';

export const NEARBY_RADIUS_M = 300; // "at the property" if within this distance

export function distanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10 || 10} m`;
  if (m < 100000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000).toLocaleString()} km`;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/* -> { ok: true, coords: {latitude, longitude, accuracy}, simulated: {label}|null }
      { ok: false, reason: 'denied' | 'off' | 'unavailable' }
   Asks the GPS first (High accuracy): emulators such as LDPlayer and many indoor phones have no
   network-based location, so a Balanced request alone can time out. */
export async function getPosition() {
  const sim = await Store.getSimLocation();
  if (sim) return { ok: true, coords: { latitude: sim.latitude, longitude: sim.longitude, accuracy: 10 }, simulated: sim };
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { ok: false, reason: 'denied' };
    if (Platform.OS !== 'web' && !(await Location.hasServicesEnabledAsync().catch(() => true))) return { ok: false, reason: 'off' };
    const pos = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 15000)
      .catch(() => withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 8000))
      .catch(() => Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }));
    if (!pos) return { ok: false, reason: 'unavailable' };
    return { ok: true, coords: pos.coords, simulated: null };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/* Adds .distance to each asset with coordinates; returns { list sorted by distance, nearest } */
export function rankByDistance(assets, coords) {
  const list = assets.map((a) => (a.latitude != null ? { ...a, distance: distanceM(coords, a) } : { ...a }));
  list.sort((x, y) => (x.distance ?? Infinity) - (y.distance ?? Infinity));
  const nearest = list[0] && list[0].distance != null && list[0].distance <= NEARBY_RADIUS_M ? list[0] : null;
  return { list, nearest };
}

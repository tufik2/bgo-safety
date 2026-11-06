// Reads server/data/*.json and applies assignments.json to users.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normEmail, normPhone } from '../src/util.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

// Re-import rule for a property: positions captured on site (or set earlier) are kept unless the
// address changed; a position in the file is used only when there's none yet.
export function mergeProperty(prev, next) {
  if (!prev || prev.latitude == null) return next;
  if (prev.address !== next.address || prev.city !== next.city) return next; // moved: capture again
  const keep = ['latitude', 'longitude', 'locationAccuracy', 'locationSource', 'locationSetBy', 'locationSetAt'];
  return { ...next, ...Object.fromEntries(keep.filter((k) => prev[k] !== undefined).map((k) => [k, prev[k]])) };
}

export function loadSeed({ usersFile = 'users.json', propertiesFile = 'properties.json' } = {}) {
  const users = read(usersFile).map((u) => ({
    id: u.id, firstName: (u.firstName || '').trim(), lastName: (u.lastName || '').trim(), email: normEmail(u.email), phone: normPhone(u.phone),
    role: u.role === 'Admin' ? 'Admin' : 'Property Manager', title: u.title || '', status: u.status || 'Active',
    emailNotifications: u.emailNotifications !== false, pushNotifications: u.pushNotifications !== false,
    recentProperty: u.recentProperty || '', properties: (u.properties || []).filter((p) => p !== '*'),
  }));
  return { users, properties: read(propertiesFile) };
}

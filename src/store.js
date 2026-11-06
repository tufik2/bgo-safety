// Local data store for the POC. Users and properties are seeded from the
// bundled JSON on first launch and kept on the device with AsyncStorage.
// Swap these functions for API calls when a backend is added.
import AsyncStorage from '@react-native-async-storage/async-storage';
import seedUsers from './data/seedUsers.json';
import seedAssets from './data/seedAssets.json';
import { AUTH_MODE } from './config';
import { createRemoteStore } from './remote';
import { clearToken, getToken, setToken } from './secureToken';
import { makeCode, normPhone } from './helpers';

let phoneChange = null; // on-device demo: pending mobile number change

const K = {
  incidents: 'bgo.incidents.v2',
  demoHistory: 'bgo.demoHistory.v2',
  inspections: 'bgo.inspections.v2',
  simLocation: 'bgo.simLocation.v1', users: 'bgo.users.v3', assets: 'bgo.assets.v3', session: 'bgo.session.v1' };

async function load(key, seed) {
  const raw = await AsyncStorage.getItem(key);
  if (raw) return JSON.parse(raw);
  await AsyncStorage.setItem(key, JSON.stringify(seed));
  return seed.map((x) => ({ ...x }));
}
const save = (key, v) => AsyncStorage.setItem(key, JSON.stringify(v));

const LOCATIONS = 'bgo.propertyLocations.v1';
async function readLocations() { try { return JSON.parse((await AsyncStorage.getItem(LOCATIONS)) || '{}'); } catch { return {}; } }

const LocalStore = {
  // Property location captured on site (on-device mode: stored on this phone)
  async setPropertyLocation(propertyNumber, loc, user) {
    const all = await readLocations();
    all[propertyNumber] = { latitude: loc.latitude, longitude: loc.longitude, locationAccuracy: loc.accuracy, locationSource: 'on-site',
      locationSetBy: { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') }, locationSetAt: loc.capturedAt };
    await AsyncStorage.setItem(LOCATIONS, JSON.stringify(all));
    const p = seedAssets.find((x) => x.propertyNumber === propertyNumber);
    return { ...p, ...all[propertyNumber] };
  },
  // Users saved on the device, plus any users added to the bundled list since
  // (so a new app version's users can sign in without resetting the device)
  async users() {
    const list = await load(K.users, seedUsers);
    const have = new Set(list.map((u) => u.id));
    const emails = new Set(list.map((u) => (u.email || '').toLowerCase()).filter(Boolean));
    const added = seedUsers.filter((u) => !have.has(u.id) && !emails.has((u.email || '').toLowerCase()));
    // Fill in contact details added to the bundled list later (never overwrites what's on the device)
    const seedById = new Map(seedUsers.map((u) => [u.id, u]));
    let filled = false;
    const updated = list.map((u) => {
      const sd = seedById.get(u.id);
      if (!sd) return u;
      const patch = {};
      for (const k of ['phone', 'email']) if (!u[k] && sd[k]) patch[k] = sd[k];
      if (!Object.keys(patch).length) return u;
      filled = true;
      return { ...u, ...patch };
    });
    if (!added.length && !filled) return list;
    const merged = [...updated, ...added];
    await save(K.users, merged);
    return merged;
  },
  async getUser(id) {
    const all = await this.users();
    return all.find((u) => u.id === id) || null;
  },
  async createUser(data) {
    const all = await this.users();
    const u = { id: 'u' + Date.now(), ...data };
    await save(K.users, [...all, u]);
    return u;
  },
  async updateUser(id, patch) {
    const all = await this.users();
    await save(K.users, all.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  },
  // Properties this user may see: Admins all, Property Managers their assigned ones
  async assets(user) {
    // the bundled (latest) list, plus locations saved on site on this device
    const saved = await readLocations();
    const list = seedAssets.map((p) => (saved[p.propertyNumber] ? { ...p, ...saved[p.propertyNumber] } : p));
    let mine = list;
    if (user && user.role !== 'Admin') {
      const fresh = await this.getUser(user.id);
      const allowed = new Set((fresh && fresh.properties) || []);
      mine = list.filter((p) => allowed.has(p.propertyNumber));
    }
    return [...mine].sort((a, b) => a.propertyNumber.localeCompare(b.propertyNumber));
  },
  /* ---------- property team (Admins change it) ---------- */
  async team(propertyNumber) {
    return (await this.users()).filter((u) => u.status === 'Active' && (u.properties || []).includes(propertyNumber))
      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
  },
  async allUsers() { return (await this.users()).filter((u) => u.status === 'Active'); },
  async setTeam(propertyNumber, userIds) {
    const want = new Set(userIds);
    const all = (await this.users()).map((u) => {
      if (u.role === 'Admin') return u;
      const has = (u.properties || []).includes(propertyNumber);
      if (has === want.has(u.id)) return u;
      return { ...u, properties: has ? u.properties.filter((x) => x !== propertyNumber) : [...(u.properties || []), propertyNumber].sort() };
    });
    await save(K.users, all);
    return this.team(propertyNumber);
  },
  async setRole(id, role) {
    const all = (await this.users()).map((u) => (u.id === id ? { ...u, role } : u));
    await save(K.users, all);
    return all.find((u) => u.id === id);
  },
  // The sign-in token lives in secure storage; the rest of the session (user id, profile) in app storage
  async getSession() {
    let s = null;
    try { s = JSON.parse((await AsyncStorage.getItem(K.session)) || 'null'); } catch { return null; }
    if (s && s.token) { await setToken(s.token); delete s.token; await AsyncStorage.setItem(K.session, JSON.stringify(s)); } // move older sessions
    return s ? { ...s, token: await getToken() } : null;
  },
  // Keep the signed-in user's details current without touching the token
  async updateSessionUser(user) {
    try {
      const s = JSON.parse((await AsyncStorage.getItem(K.session)) || 'null');
      if (s) await AsyncStorage.setItem(K.session, JSON.stringify({ ...s, user }));
    } catch { /* ignore */ }
  },
  // Own mobile number (on-device demo: the code is shown instead of texted)
  async requestPhoneChange(user, phone) {
    const others = (await this.users()).filter((u) => u.id !== user.id);
    if (phone === user.phone) return { ok: false, error: 'same_phone' };
    if (others.some((u) => normPhone(u.phone) === phone)) return { ok: false, error: 'phone_in_use' };
    phoneChange = { phone, code: makeCode(), attempts: 0, until: Date.now() + 5 * 60e3 };
    return { ok: true, phone, simulatedCode: phoneChange.code };
  },
  async verifyPhoneChange(user, code) {
    if (!phoneChange || Date.now() > phoneChange.until) return { ok: false, error: 'expired' };
    if (code !== phoneChange.code) {
      phoneChange.attempts += 1;
      if (phoneChange.attempts >= 3) { phoneChange = null; return { ok: false, error: 'locked' }; }
      return { ok: false, error: 'mismatch', attemptsLeft: 3 - phoneChange.attempts };
    }
    const phone = phoneChange.phone; phoneChange = null;
    await this.updateUser(user.id, { phone });
    return { ok: true, user: { ...user, phone } };
  },
  async removePhone(user) {
    await this.updateUser(user.id, { phone: '' });
    return { ok: true, user: { ...user, phone: '' } };
  },
  async setSession({ token, ...rest }) {
    await setToken(token);
    await AsyncStorage.setItem(K.session, JSON.stringify(rest));
  },
  async clearSession() {
    await clearToken();
    await AsyncStorage.removeItem(K.session);
  },
  async getSimLocation() {
    try { return JSON.parse((await AsyncStorage.getItem(K.simLocation)) || 'null'); } catch { return null; }
  },
  setSimLocation: (v) => (v ? AsyncStorage.setItem(K.simLocation, JSON.stringify(v)) : AsyncStorage.removeItem(K.simLocation)),
  /* Inspections: { id, checklistId, propertyNumber, status: 'draft'|'submitted',
     startedAt, updatedAt, submittedAt, startedBy:{id,name}, answers:{[questionId]:{answer, followUps:{}, note, photos:[]}} } */
  // propertyNumber is optional here (screens filter); the remote store needs it
  async inspections() {
    try { return JSON.parse((await AsyncStorage.getItem(K.inspections)) || '[]'); } catch { return []; }
  },
  photoUrl: async () => null,
  adopt: (ins) => ins,
  surveyPdfUrl: async () => { throw new Error('local'); },
  onPendingChange: () => () => {},
  syncNow: async () => {},
  startSync: () => {},
  async saveInspection(ins) {
    const all = await this.inspections();
    const i = all.findIndex((x) => x.id === ins.id);
    const next = { ...ins, updatedAt: new Date().toISOString() };
    if (i >= 0) all[i] = next; else all.push(next);
    await save(K.inspections, all);
    return next;
  },
  // POC: generated past-year surveys for one property, added the first time it's opened
  // (per checklist, so a checklist added later also gets its history)
  async ensureDemoHistory(propertyNumber, make) {
    const all = await this.inspections();
    const have = new Set(all.filter((x) => x.propertyNumber === propertyNumber).map((x) => `${x.checklistId}|${x.period}`));
    const add = make().filter((x) => !have.has(`${x.checklistId}|${x.period}`));
    if (add.length) await save(K.inspections, [...all, ...add]);
  },
  async deleteInspection(id) {
    const all = await this.inspections();
    await save(K.inspections, all.filter((x) => x.id !== id));
  },
  /* Incident reports: { id, form: 'accident'|'nearMiss', propertyNumber, status: 'draft'|'submitted',
     number, values:{}, createdAt, createdBy, submittedAt, submittedBy } */
  async incidents() {
    try { return JSON.parse((await AsyncStorage.getItem(K.incidents)) || '[]'); } catch { return []; }
  },
  async saveIncident(r) {
    const all = await this.incidents();
    const next = { ...r, updatedAt: new Date().toISOString() };
    const i = all.findIndex((x) => x.id === r.id);
    if (i >= 0) all[i] = next; else all.push(next);
    await save(K.incidents, all);
    return next;
  },
  async deleteIncident(id) {
    await save(K.incidents, (await this.incidents()).filter((x) => x.id !== id));
  },
  async resetDemoData() {
    // never drop changes still waiting to upload
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('bgo.') && !k.startsWith('bgo.outbox'));
    await AsyncStorage.multiRemove(keys);
    await clearToken();
  },
};

// 'aws' mode: data lives in the BGO Safety API; session, simulated location and
// other device settings stay on the device.
export const Store = AUTH_MODE === 'aws' ? { ...LocalStore, ...createRemoteStore() } : LocalStore;

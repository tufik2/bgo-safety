// Remote data store (AUTH_MODE 'aws'): the same functions the screens use, backed by the BGO Safety API.
//
// Works offline. Surveys and incident reports the user opens are cached on the device, and any change that
// can't reach the server goes into an outbox kept in device storage. The outbox is sent when the connection
// returns (checked every 30 seconds, when the app comes back to the foreground, and on every save), so a
// Property Manager can complete and even submit an inspection with no signal.
//
// Surveys are saved as a whole. If someone else saved the same survey in the meantime, the save is refused
// and returned as { conflict } so the screen can ask which version to keep.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { api, uploadPhoto } from './api';

const enc = encodeURIComponent;
const OUTBOX = 'bgo.outbox.v1';
const cacheKey = (kind, p) => `bgo.cache.${kind}.v1:${p}`;
const offline = (r) => !r || r.error === 'network' || r.status === 0 || r.status >= 500;
class Offline extends Error { constructor() { super('offline'); } }
const surveyIdFor = (p, c, per) => `${p}~${c}~${per}`; // the same id the server uses

function toInspection(s) {
  return {
    id: s.id, checklistId: s.checklistId, propertyNumber: s.propertyNumber, period: s.period, status: s.status,
    startedAt: s.startedAt, startedBy: s.startedBy, submittedAt: s.submittedAt || null, submittedBy: s.submittedBy || null,
    copiedFromId: s.copiedFromId || null, demo: !!s.demo, savedAt: s.savedAt, savedBy: s.savedBy, version: s.version,
    pdfKey: s.pdfKey || null, onServer: true, answers: s.answers || {},
  };
}

export function createRemoteStore() {
  const server = new Map(); // id -> { version, status } as last confirmed by the server
  const listeners = new Set();
  const photoUrls = new Map();
  let syncing = null, timer = null;

  /* ---------- device storage ---------- */
  const readJson = async (k, d) => { try { return JSON.parse((await AsyncStorage.getItem(k)) || 'null') ?? d; } catch { return d; } };
  const writeJson = (k, v) => AsyncStorage.setItem(k, JSON.stringify(v));
  const outbox = () => readJson(OUTBOX, {});
  async function setOutbox(box) {
    await writeJson(OUTBOX, box);
    const n = Object.keys(box).length;
    listeners.forEach((fn) => fn(n));
    if (n && !timer) timer = setInterval(() => { syncAll(); }, 30000);
    if (!n && timer) { clearInterval(timer); timer = null; }
  }
  async function cachePut(kind, item) {
    const k = cacheKey(kind, item.propertyNumber);
    const list = await readJson(k, []);
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item; else list.push(item);
    await writeJson(k, list);
  }
  async function cacheDrop(kind, p, id) {
    const k = cacheKey(kind, p);
    await writeJson(k, (await readJson(k, [])).filter((x) => x.id !== id));
  }
  async function queue(kind, item) {
    const box = await outbox();
    box[item.id] = { kind, item, at: new Date().toISOString() };
    await setOutbox(box);
    if (kind === 'survey' || kind === 'incident') await cachePut(kind === 'survey' ? 'surveys' : 'incidents', item);
  }
  async function unqueue(id) {
    const box = await outbox();
    if (box[id]) { delete box[id]; await setOutbox(box); }
  }
  // Server list plus anything still waiting in the outbox (the outbox copy is newer)
  async function withPending(kind, p, list) {
    const box = await outbox();
    const out = new Map(list.map((x) => [x.id, x]));
    for (const { kind: k, item } of Object.values(box)) if (k === kind && item.propertyNumber === p) out.set(item.id, { ...item, pendingSync: true });
    return [...out.values()];
  }

  async function uploadPhotos(propertyNumber, photos) {
    const out = [];
    for (const p of photos || []) {
      if (p.key) { out.push(p); continue; }
      try { out.push({ ...p, key: await uploadPhoto(propertyNumber, p.uri) }); } catch { throw new Offline(); }
    }
    return out;
  }
  // local answers, with the S3 keys of photos just uploaded (local files kept for display)
  function withPhotoKeys(local, sent) {
    const out = { ...local };
    for (const [qid, a] of Object.entries(sent)) if (out[qid] && a.photos) out[qid] = { ...out[qid], photos: a.photos };
    return out;
  }

  /* ---------- sending one survey / incident ---------- */
  // -> saved inspection | { conflict }; throws Offline when the server can't be reached
  async function sendSurvey(ins, force) {
    const answers = {};
    for (const [qid, a] of Object.entries(ins.answers || {})) {
      answers[qid] = a.photos && a.photos.some((p) => !p.key) ? { ...a, photos: await uploadPhotos(ins.propertyNumber, a.photos) } : a;
    }
    let srv = server.get(ins.id);
    if (!ins.onServer && !srv) {
      const r = await api('POST', `/properties/${enc(ins.propertyNumber)}/surveys`, { checklistId: ins.checklistId, period: ins.period, answers, copiedFromId: ins.copiedFromId || null });
      if (offline(r)) throw new Offline();
      if (r.error === 'exists') { // someone else started this year's survey while we were offline
        const theirs = toInspection(r.survey);
        server.set(theirs.id, { version: theirs.version, status: theirs.status });
        return { conflict: theirs };
      }
      if (!r.ok) throw new Error(r.error);
      srv = { version: r.survey.version, status: 'draft' };
      server.set(ins.id, srv);
      if (ins.status !== 'submitted') return { ...ins, ...toInspection(r.survey), answers: withPhotoKeys(ins.answers, answers) };
    }
    const base = srv ? srv.version : ins.version;
    const submitting = ins.status === 'submitted' && (!srv || srv.status === 'draft');
    const r = await api(submitting ? 'POST' : 'PUT', `/surveys/${enc(ins.id)}${submitting ? '/submit' : ''}`, { answers, baseVersion: base, force: !!force });
    if (offline(r)) throw new Offline();
    if (r.status === 409 && r.current) {
      const theirs = toInspection(r.current);
      server.set(theirs.id, { version: theirs.version, status: theirs.status });
      return { conflict: theirs };
    }
    if (!r.ok) throw new Error(r.error || 'save_failed');
    const saved = toInspection(r.survey);
    server.set(saved.id, { version: saved.version, status: saved.status });
    return { ...ins, ...saved, answers: withPhotoKeys(ins.answers, answers) };
  }

  async function sendIncident(inc) {
    const p = inc.propertyNumber;
    const values = { ...inc.values, photos: await uploadPhotos(p, inc.values.photos) };
    const send = { ...values, photos: (values.photos || []).map((x) => ({ key: x.key, at: x.at })) };
    let srv = server.get(inc.id);
    let latest = null;
    if (!inc.onServer && !srv) {
      const r = await api('POST', `/properties/${enc(p)}/incidents`, { id: inc.id, form: inc.form, values: send });
      if (offline(r)) throw new Offline();
      if (!r.ok && r.error !== 'exists') throw new Error(r.error);
      if (r.ok) latest = r.incident;
      srv = { version: r.ok ? r.incident.version : inc.version || 1, status: 'draft' };
    } else {
      srv = srv || { version: inc.version, status: inc.status === 'submitted' && inc.number ? 'submitted' : 'draft' };
      if (srv.status === 'draft') {
        const r = await api('PUT', `/incidents/${enc(p)}/${enc(inc.id)}`, { values: send, baseVersion: srv.version });
        if (offline(r)) throw new Offline();
        if (!r.ok) throw new Error(r.error);
        latest = r.incident;
        srv = { version: r.incident.version, status: 'draft' };
      }
    }
    server.set(inc.id, srv);
    if (inc.status === 'submitted' && srv.status === 'draft') {
      const r = await api('POST', `/incidents/${enc(p)}/${enc(inc.id)}/submit`);
      if (offline(r)) throw new Offline();
      if (!r.ok) throw new Error(r.error);
      latest = r.incident;
      server.set(inc.id, { version: r.incident.version, status: 'submitted' });
    }
    return { ...inc, ...(latest ? { number: latest.number, status: latest.status, submittedAt: latest.submittedAt, submittedBy: latest.submittedBy, version: latest.version } : {}), values, onServer: true };
  }

  /* ---------- background sync ---------- */
  function syncAll() {
    if (syncing) return syncing;
    syncing = (async () => {
      const box = await outbox();
      for (const [id, entry] of Object.entries(box)) {
        try {
          if (entry.kind === 'location') {
            const r = await api('PATCH', `/properties/${enc(entry.item.propertyNumber)}/location`, entry.item.loc);
            if (offline(r)) throw new Offline();
          } else if (entry.kind === 'survey') {
            const r = await sendSurvey(entry.item, false);
            if (r.conflict) { // keep it: the user chooses when they next save this survey
              const b = await outbox(); if (b[id]) { b[id].conflict = true; await setOutbox(b); }
              continue;
            }
            await cachePut('surveys', { ...r, pendingSync: false });
          } else {
            await cachePut('incidents', { ...(await sendIncident(entry.item)), pendingSync: false });
          }
          await unqueue(id);
        } catch (e) {
          if (e instanceof Offline) break; // still offline: try again later
        }
      }
    })().finally(() => { syncing = null; });
    return syncing;
  }
  AppState.addEventListener('change', (st) => { if (st === 'active') syncAll(); });

  async function findCached(kind, id) {
    for (const k of (await AsyncStorage.getAllKeys()).filter((x) => x.startsWith(`bgo.cache.${kind}.v1:`))) {
      const hit = (await readJson(k, [])).find((x) => x.id === id);
      if (hit) return hit;
    }
    return null;
  }

  return {
    /* ---------- sync status ---------- */
    onPendingChange(fn) { listeners.add(fn); outbox().then((b) => fn(Object.keys(b).length)); return () => listeners.delete(fn); },
    syncNow: () => syncAll(),
    startSync() { outbox().then(setOutbox).then(() => syncAll()); },

    /* ---------- user, properties, team ---------- */
    async getUser() {
      const r = await api('GET', '/me');
      if (offline(r)) throw new Error('network');
      return r.ok ? r.user : null;
    },
    async updateUser(_id, patch) { await api('PATCH', '/me', patch); },
    async requestPhoneChange(_user, phone) { const r = await api('POST', '/me/phone/request', { phone }); return r.ok ? r : { ok: false, error: offline(r) ? 'network' : r.error }; },
    async verifyPhoneChange(_user, code) { const r = await api('POST', '/me/phone/verify', { code }); return r.ok ? r : { ok: false, error: offline(r) ? 'network' : r.error, attemptsLeft: r.attemptsLeft }; },
    async removePhone() { const r = await api('DELETE', '/me/phone'); return r.ok ? r : { ok: false, error: offline(r) ? 'network' : r.error }; },
    async assets() {
      const r = await api('GET', '/properties');
      if (r.ok) {
        const list = r.properties.map((p) => ({ id: p.propertyNumber, ...p }));
        await writeJson('bgo.cache.properties.v1', list);
        return list;
      }
      const cached = await readJson('bgo.cache.properties.v1', null);
      if (offline(r) && cached) return cached;
      throw new Error(r.error);
    },
    async users() { return []; }, // sign-in is checked by the server in this mode
    // Property location captured on site; queued like other changes when there's no signal
    async setPropertyLocation(propertyNumber, loc, user) {
      const list = await readJson('bgo.cache.properties.v1', []);
      const prev = list.find((p) => p.propertyNumber === propertyNumber) || { propertyNumber, id: propertyNumber };
      const local = { ...prev, latitude: loc.latitude, longitude: loc.longitude, locationAccuracy: loc.accuracy, locationSource: 'on-site',
        locationSetBy: { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') }, locationSetAt: loc.capturedAt };
      await writeJson('bgo.cache.properties.v1', list.map((p) => (p.propertyNumber === propertyNumber ? local : p)));
      const r = await api('PATCH', `/properties/${enc(propertyNumber)}/location`, loc);
      if (r.ok) return { ...local, ...r.property, id: propertyNumber };
      if (!offline(r)) throw new Error(r.error);
      const box = await outbox();
      box[`loc:${propertyNumber}`] = { kind: 'location', item: { id: `loc:${propertyNumber}`, propertyNumber, loc }, at: new Date().toISOString() };
      await setOutbox(box);
      return { ...local, pendingSync: true };
    },
    async team(p) {
      const r = await api('GET', `/properties/${enc(p)}/team`);
      if (r.ok) { await writeJson(cacheKey('team', p), r.team); return r.team; }
      const cached = await readJson(cacheKey('team', p), null);
      if (offline(r) && cached) return cached;
      throw new Error(r.error);
    },
    async allUsers() { const r = await api('GET', '/users'); if (!r.ok) throw new Error(r.error); return r.users; },
    async setTeam(p, userIds) { const r = await api('PUT', `/properties/${enc(p)}/team`, { userIds }); if (!r.ok) throw new Error(r.error); return r.team; },
    async setRole(id, role) { const r = await api('PATCH', `/users/${enc(id)}/role`, { role }); if (!r.ok) throw new Error(r.error); return r.user; },

    /* ---------- surveys ---------- */
    async inspections(propertyNumber) {
      await syncAll();
      const r = await api('GET', `/properties/${enc(propertyNumber)}/surveys`);
      let list;
      if (r.ok) {
        list = r.surveys.map(toInspection);
        list.forEach((x) => server.set(x.id, { version: x.version, status: x.status }));
        await writeJson(cacheKey('surveys', propertyNumber), list);
      } else if (offline(r)) {
        list = await readJson(cacheKey('surveys', propertyNumber), null);
        if (!list) throw new Error('network');
        list.forEach((x) => { if (x.onServer && !server.has(x.id)) server.set(x.id, { version: x.version, status: x.status }); });
      } else throw new Error(r.error);
      return withPending('survey', propertyNumber, list);
    },
    // POC: add generated earlier-year surveys for this property (the server allows it in DemoMode)
    async ensureDemoHistory(propertyNumber, make) {
      const r = await api('GET', `/properties/${enc(propertyNumber)}/surveys`);
      if (!r.ok) return;
      const have = new Set(r.surveys.map((x) => `${x.checklistId}|${x.period}`));
      const surveys = make().filter((d) => !have.has(`${d.checklistId}|${d.period}`))
        .map((d) => ({ ...d, answers: Object.fromEntries(Object.entries(d.answers).map(([k, v]) => [k, { ...v, photos: [] }])) }));
      if (surveys.length) await api('POST', '/import-surveys', { surveys });
    },

    // -> saved inspection (pendingSync: true while waiting for a connection) | { conflict }. force = replace theirs.
    async saveInspection(ins, { force = false } = {}) {
      const item = { ...ins, id: ins.onServer ? ins.id : surveyIdFor(ins.propertyNumber, ins.checklistId, ins.period) };
      try {
        const r = await sendSurvey(item, force);
        if (r.conflict) return r;
        const saved = { ...r, pendingSync: false };
        await unqueue(item.id);
        await cachePut('surveys', saved);
        return saved;
      } catch (e) {
        if (!(e instanceof Offline)) throw e;
        const pending = { ...item, pendingSync: true };
        await queue('survey', pending);
        return pending;
      }
    },
    adopt(ins) { server.set(ins.id, { version: ins.version, status: ins.status }); unqueue(ins.id); cachePut('surveys', ins); return ins; },

    async deleteInspection(id) {
      const box = await outbox();
      if (!(box[id] && !box[id].item.onServer)) {
        const r = await api('DELETE', `/surveys/${enc(id)}`);
        if (offline(r)) throw new Error('network');
        if (!r.ok) throw new Error(r.error);
      }
      await unqueue(id); await cacheDrop('surveys', id.split('~')[0], id); server.delete(id);
    },

    async surveyPdfUrl(id) {
      const r = await api('GET', `/surveys/${enc(id)}/pdf`);
      if (offline(r)) throw new Error('network');
      if (!r.ok) throw new Error(r.error);
      return r.url;
    },

    /* ---------- incidents ---------- */
    async incidents(propertyNumber) {
      await syncAll();
      const r = await api('GET', `/properties/${enc(propertyNumber)}/incidents`);
      let list;
      if (r.ok) {
        list = r.incidents.map((i) => ({ ...i, onServer: true }));
        list.forEach((i) => server.set(i.id, { version: i.version, status: i.status }));
        await writeJson(cacheKey('incidents', propertyNumber), list);
      } else if (offline(r)) {
        list = await readJson(cacheKey('incidents', propertyNumber), null);
        if (!list) throw new Error('network');
      } else throw new Error(r.error);
      return withPending('incident', propertyNumber, list);
    },
    async saveIncident(inc) {
      try {
        const saved = { ...(await sendIncident(inc)), pendingSync: false };
        await unqueue(inc.id);
        await cachePut('incidents', saved);
        return saved;
      } catch (e) {
        if (!(e instanceof Offline)) throw e;
        const pending = { ...inc, pendingSync: true };
        await queue('incident', pending);
        return pending;
      }
    },
    async deleteIncident(id) {
      const box = await outbox();
      const item = (box[id] && box[id].item) || (await findCached('incidents', id));
      if (!item) return;
      if (item.onServer) {
        const r = await api('DELETE', `/incidents/${enc(item.propertyNumber)}/${enc(id)}`);
        if (offline(r)) throw new Error('network');
        if (!r.ok) throw new Error(r.error);
      }
      await unqueue(id); await cacheDrop('incidents', item.propertyNumber, id); server.delete(id);
    },

    /* ---------- photos ---------- */
    async photoUrl(key) {
      const hit = photoUrls.get(key);
      if (hit && hit.until > Date.now()) return hit.url;
      const r = await api('GET', `/uploads/url?key=${enc(key)}`);
      if (!r.ok) return null;
      photoUrls.set(key, { url: r.url, until: Date.now() + 50 * 60e3 });
      return r.url;
    },
  };
}

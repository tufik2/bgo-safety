// In-memory storage with the same interface as repo-dynamo.mjs — for the local dev server and tests.
import { epoch } from './util.mjs';

export function createMemoryRepo() {
  const users = new Map(), logins = new Map(), props = new Map(), codes = new Map(), rates = new Map();
  const surveys = new Map(), incidents = new Map(), counters = new Map(), temps = new Map(), meta = new Map();
  const clone = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));
  const sKey = (p, c, per) => `${p}|${c}|${per}`;

  return {
    async listUsers() { return [...users.values()].map(clone); },
    async getUser(id) { return clone(users.get(id)); },
    async getUserByLogin(type, value) { const id = logins.get(`${type}#${value}`); return id ? clone(users.get(id)) : null; },
    async countUsers() { return users.size; },
    async putUser(u) {
      const prev = users.get(u.id);
      if (prev) { if (prev.email) logins.delete(`email#${prev.email}`); if (prev.phone) logins.delete(`phone#${prev.phone}`); }
      users.set(u.id, clone(u));
      if (u.email) logins.set(`email#${u.email}`, u.id);
      if (u.phone) logins.set(`phone#${u.phone}`, u.id);
      return u;
    },
    async putUsers(list) { for (const u of list) await this.putUser(u); },

    async listProperties() { return [...props.values()].map(clone); },
    async getProperty(p) { return clone(props.get(p)); },
    async putProperties(list) { for (const p of list) props.set(p.propertyNumber, clone(p)); },

    async getCode(i) { const c = codes.get(i); return c && c.ttl > epoch() ? clone(c) : null; },
    async putCode(i, rec, ttl) { codes.set(i, { ...clone(rec), ttl: epoch() + ttl + 60 }); },
    async deleteCode(i) { codes.delete(i); },
    async bumpAttempts(i) { const c = codes.get(i); c.attempts = (c.attempts || 0) + 1; return c.attempts; },
    async hit(i, win) { const k = `${i}#${Math.floor(epoch() / win)}`; rates.set(k, (rates.get(k) || 0) + 1); return rates.get(k); },

    async listSurveys(p) { return [...surveys.values()].filter((s) => s.propertyNumber === p).map(clone); },
    async getSurvey(p, c, per) { return clone(surveys.get(sKey(p, c, per))); },
    async createSurvey(s) { const k = sKey(s.propertyNumber, s.checklistId, s.period); if (surveys.has(k)) return false; surveys.set(k, clone(s)); return true; },
    async updateSurvey(s, v) { const k = sKey(s.propertyNumber, s.checklistId, s.period); const cur = surveys.get(k); if (!cur || cur.version !== v) return false; surveys.set(k, clone(s)); return true; },
    async deleteSurvey(s) { surveys.delete(sKey(s.propertyNumber, s.checklistId, s.period)); },
    async getMeta(n) { return clone(meta.get(n)); },
    async claimMeta(n, rec) { if (meta.has(n)) return false; meta.set(n, clone(rec)); return true; },
    async putMeta(n, rec) { meta.set(n, clone(rec)); },
    async putTemp(kind, id, rec, ttl) { temps.set(`${kind}#${id}`, { ...clone(rec), ttl: epoch() + ttl }); },
    async takeTemp(kind, id) { const k = `${kind}#${id}`; const r = temps.get(k); temps.delete(k); return r && r.ttl > epoch() ? r : null; },

    async listIncidents(p) { return [...incidents.values()].filter((i) => i.propertyNumber === p).map(clone); },
    async getIncident(p, id) { const i = incidents.get(id); return i && i.propertyNumber === p ? clone(i) : null; },
    async putIncident(inc, v) {
      const cur = incidents.get(inc.id);
      if (v ? !cur || cur.version !== v : !!cur) return false;
      incidents.set(inc.id, clone(inc)); return true;
    },
    async deleteIncident(p, id) { incidents.delete(id); },
    async nextNumber(p, pre, y) { const k = `${p}#${pre}#${y}`; counters.set(k, (counters.get(k) || 0) + 1); return counters.get(k); },
  };
}

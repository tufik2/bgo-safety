// Shared helpers: HTTP responses, identifiers, crypto.
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, error, extra = {}) { super(error); this.status = status; this.error = error; this.extra = extra; }
}
export const ok = (body, status = 200) => ({ status, body: { ok: true, ...body } });
export const fail = (status, error, extra = {}) => { throw new HttpError(status, error, extra); };

export const env = (k, d = '') => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
export const nowIso = () => new Date().toISOString();
export const epoch = () => Math.floor(Date.now() / 1000);

export function parseIdentifier(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (t.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t) ? { type: 'email', value: t.toLowerCase() } : null;
  if (/[a-z]/i.test(t)) return null;
  let d = t.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) return null;
  return { type: 'phone', value: `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` };
}
export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const normPhone = (p) => { const r = parseIdentifier(p); return r && r.type === 'phone' ? r.value : ''; };
export const e164 = (phone) => '+1' + phone.replace(/\D/g, '');

export const randomCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
export const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest('hex');
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
export const newId = (prefix = '') => prefix + crypto.randomUUID();

const b64url = (buf) => Buffer.from(buf).toString('base64url');
export function signJwt(payload, key) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', key).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export function verifyJwt(token, key) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const sig = crypto.createHmac('sha256', key).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (!safeEqual(sig, parts[2])) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (p.exp && p.exp < epoch()) return null;
    return p;
  } catch { return null; }
}

// Public view of a user (what the app may see)
export const publicUser = (u) => u && ({
  id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role,
  title: u.title || '', status: u.status, recentProperty: u.recentProperty || '',
  emailNotifications: u.emailNotifications !== false, pushNotifications: u.pushNotifications !== false,
});

// Property numbers and ids that go into keys/paths
export const safeSegment = (s, what) => {
  if (!/^[A-Za-z0-9._~-]{1,80}$/.test(String(s || ''))) fail(400, 'invalid_' + what);
  return String(s);
};

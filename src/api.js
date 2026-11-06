// HTTP client for the BGO Safety API (AUTH_MODE 'aws').
import { API_BASE_URL } from './config';
import { getToken } from './secureToken';

let onAuthLost = null;
export const setAuthLostHandler = (fn) => { onAuthLost = fn; };

const token = () => getToken();

// -> parsed JSON body (always has ok), plus `status`. Network failure -> { ok:false, error:'network' }.
export async function api(method, path, body, { auth = true } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (auth) { const t = await token(); if (t) headers.authorization = `Bearer ${t}`; }
  let res;
  try {
    res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return { ok: false, error: 'network', status: 0 };
  }
  let data = {};
  try { data = await res.json(); } catch { data = { ok: res.ok }; }
  if (res.status === 401 && auth && onAuthLost) onAuthLost();
  return { ...data, ok: !!data.ok && res.ok, status: res.status };
}

// Uploads a local photo (file:// or blob/data URI) through a short-lived link from the API.
export async function uploadPhoto(propertyNumber, uri) {
  const type = /\.png($|\?)/i.test(uri) ? 'image/png' : 'image/jpeg';
  const r = await api('POST', '/uploads', { propertyNumber, contentType: type });
  if (!r.ok) throw new Error(r.error || 'upload_link');
  const blob = await (await fetch(uri)).blob();
  const put = await fetch(r.uploadUrl, { method: 'PUT', headers: { 'content-type': type }, body: blob });
  if (!put.ok) throw new Error('upload_failed');
  return r.key;
}

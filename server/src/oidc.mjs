// Single sign-on through the API (OAuth 2.0 authorization code flow, confidential client).
// Works with Okta and Microsoft Entra ID. The client secret / private certificate stay in
// Secrets Manager; the app only ever receives a one-time ticket.
//
//   app ──► GET  /auth/sso/start?redirect=bgosafety://auth ──► 302 to Okta / Microsoft
//   IdP ──► GET  /auth/sso/callback?code&state  (API swaps the code using the secret)
//   API ──► 302  bgosafety://auth?ticket=…     (or ?error=…)
//   app ──► POST /auth/sso/redeem {ticket}  ──► session token
import crypto from 'node:crypto';
import { env, epoch, normEmail } from './util.mjs';
import { getSecrets } from './secrets.mjs';

export function ssoSettings() {
  const method = env('SSO_METHOD').toLowerCase(); // 'okta' | 'entra' | ''
  const clientId = env('SSO_CLIENT_ID');
  let issuer = env('SSO_ISSUER');
  if (!issuer && method === 'okta' && env('SSO_DOMAIN')) issuer = env('SSO_DOMAIN').replace(/\/+$/, ''); // Okta org authorization server
  if (!issuer && method === 'entra' && env('SSO_TENANT_ID')) issuer = `https://login.microsoftonline.com/${env('SSO_TENANT_ID')}/v2.0`;
  const label = env('SSO_BUTTON_LABEL') || (method === 'entra' ? 'Sign in with Microsoft' : method === 'okta' ? 'Sign in with Okta' : 'Single sign-on');
  return { enabled: !!(method && clientId && issuer), method, clientId, issuer, label };
}

const cache = new Map(); // issuer -> { doc, jwks, at }
async function discovery(issuer) {
  const hit = cache.get(issuer);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit;
  const doc = await (await fetch(`${issuer}/.well-known/openid-configuration`)).json();
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) throw new Error('Bad OpenID configuration');
  const jwks = (await (await fetch(doc.jwks_uri)).json()).keys || [];
  const entry = { doc, jwks, at: Date.now() };
  cache.set(issuer, entry);
  return entry;
}

// Where the app may ask to be sent back to after sign-in
export function redirectAllowed(uri) {
  const extra = env('SSO_EXTRA_REDIRECTS').split(',').map((s) => s.trim()).filter(Boolean);
  return /^bgosafety:\/\/auth$/.test(uri)
    || /^exp:\/\/[A-Za-z0-9.\-:]+\/--\/auth$/.test(uri)            // Expo Go during development
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(uri)  // browser preview on this PC
    || extra.includes(uri);
}

const b64url = (b) => Buffer.from(b).toString('base64url');

export async function authorizeUrl({ callbackUrl, state, nonce, verifier }) {
  const s = ssoSettings();
  const { doc } = await discovery(s.issuer);
  const q = new URLSearchParams({
    client_id: s.clientId, response_type: 'code', scope: 'openid email profile', redirect_uri: callbackUrl,
    state, nonce, code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
  });
  if (s.method === 'entra') q.set('prompt', 'select_account');
  return `${doc.authorization_endpoint}?${q}`;
}

// Client authentication: client secret, or a JWT signed with the private certificate (private_key_jwt)
async function clientAuth(tokenEndpoint) {
  const s = ssoSettings();
  const sec = await getSecrets();
  if ((sec.ssoConfigType || 'clientSecret') === 'certificate') {
    const key = crypto.createPrivateKey(sec.ssoPrivateCertificate);
    const header = { alg: 'RS256', typ: 'JWT' };
    if (sec.ssoPublicCertificate) {
      const der = new crypto.X509Certificate(sec.ssoPublicCertificate).raw;
      header.x5t = b64url(crypto.createHash('sha1').update(der).digest()); // Microsoft identifies the certificate this way
    }
    if (sec.ssoKeyId) header.kid = sec.ssoKeyId;                           // Okta: the key's id
    const now = epoch();
    const body = { iss: s.clientId, sub: s.clientId, aud: tokenEndpoint, jti: crypto.randomUUID(), iat: now, nbf: now, exp: now + 300 };
    const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
    const sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url');
    return { client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: `${unsigned}.${sig}` };
  }
  if (!sec.ssoClientSecret) throw new Error('SSO client secret is not set in Secrets Manager');
  return { client_secret: sec.ssoClientSecret };
}

// Swaps the code for tokens and verifies the ID token. -> { email, claims } or throws
export async function exchangeCode({ code, callbackUrl, verifier, nonce }) {
  const s = ssoSettings();
  const { doc, jwks } = await discovery(s.issuer);
  const form = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: callbackUrl, client_id: s.clientId, code_verifier: verifier,
    ...(await clientAuth(doc.token_endpoint)),
  });
  const res = await fetch(doc.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: form });
  const tok = await res.json();
  if (!res.ok || !tok.id_token) throw new Error(`Token exchange failed: ${tok.error || res.status}`);
  const claims = await verifyIdToken(tok.id_token, { issuer: doc.issuer, jwks });
  if (!claims || claims.nonce !== nonce) throw new Error('ID token failed verification');
  return { email: normEmail(claims.email || claims.preferred_username || claims.upn), claims };
}

async function verifyIdToken(idToken, { issuer, jwks }) {
  const s = ssoSettings();
  const [h, p, sig] = String(idToken).split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  if (header.alg !== 'RS256') return null;
  let jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) { cache.delete(s.issuer); jwk = (await discovery(s.issuer)).jwks.find((k) => k.kid === header.kid); } // key rotation
  if (!jwk) return null;
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(sig, 'base64url'));
  const now = epoch(), skew = 300;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ok || claims.iss !== issuer || !aud.includes(s.clientId) || !claims.exp || claims.exp + skew < now) return null;
  return claims;
}

export function domainAllowed(email) {
  const list = env('ALLOWED_EMAIL_DOMAINS').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  return !list.length || list.includes(email.split('@')[1]);
}

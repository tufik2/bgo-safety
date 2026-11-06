// ============================================================================
// Sign-in (access code) service.
//
// The login screen only talks to this file, through four functions:
//   requestCode(identifier)        -> send a 6-digit code by SMS or email
//   verifyCode(to, code)           -> check it (60 s expiry, 3 attempts)
//   completeSetup(to, profile, setupToken) -> first-user setup (creates the Admin)
//   cancel()                       -> user abandoned the attempt
//   ssoRedeem(ticket)              -> finish single sign-on (ticket from the API's SSO redirect)
//
// AUTH_MODE 'local'  : POC. Everything happens on the device; the code is
//                      shown as a device notification / in-app banner.
// AUTH_MODE 'aws'    : Production. Calls the API described in
//                      docs/AUTH_API.md (Lambda + SES email + SNS text).
//                      The code never reaches the app.
// ============================================================================
import { AUTH_MODE } from './config';
import { api } from './api';
import { makeCode, normEmail, normPhone, parseIdentifier } from './helpers';
import { dismissCodeNotification, sendCodeNotification } from './notify';
import { Store } from './store';

export const CODE_TTL_MS = 60000;
export const MAX_ATTEMPTS = 3;

/* Result shapes (identical for both modes)

   requestCode ->
     { ok: true, channel: 'phone'|'email', to, expiresAt, maxAttempts,
       simulated?: { code, viaDevice } }          // local mode only
     { ok: false, error: 'invalid'|'network' }

   Security: requestCode answers the same way whether or not the address
   belongs to an active user, so the app never reveals who is registered.
   Unknown or inactive identifiers get no code; any code entered for them
   is treated as a mismatch until the attempts run out.

   verifyCode ->
     { ok: true, user, token, needsSetup, setupToken } // needsSetup: first user
     { ok: false, error: 'mismatch', attemptsLeft }
     { ok: false, error: 'expired'|'locked'|'network' }

   completeSetup ->
     { ok: true, user, token } | { ok: false, error: 'network' }
*/

/* ----------------------------- Local (POC) ------------------------------ */
let pending = null; // { to, channel, code, expiresAt, attempts, user, setup, notifId }

const local = {
  async requestCode(identifier) {
    const id = parseIdentifier(identifier);
    if (!id) return { ok: false, error: 'invalid' };
    const users = await Store.users();
    const setup = users.length === 0; // first person becomes Admin
    const found = setup ? null
      : users.find((u) => (id.type === 'phone' ? normPhone(u.phone) === id.value : normEmail(u.email) === id.value));
    const user = found && (!found.status || found.status === 'Active') ? found : null;
    const eligible = setup || !!user;

    if (pending) dismissCodeNotification(pending.notifId);
    const expiresAt = Date.now() + CODE_TTL_MS;
    let code = null;
    let notifId = null;
    if (eligible) {
      code = makeCode();
      notifId = await sendCodeNotification({ code, channel: id.type, to: id.value });
    }
    pending = { to: id.value, channel: id.type, code, expiresAt, attempts: 0, user, setup, notifId };
    // Same response either way; only the simulated delivery differs (nothing is "sent" to a stranger)
    return {
      ok: true, channel: id.type, to: id.value, expiresAt, maxAttempts: MAX_ATTEMPTS,
      simulated: code ? { code, viaDevice: !!notifId } : null,
    };
  },

  async verifyCode(to, code) {
    if (!pending || pending.to !== to) return { ok: false, error: 'expired' };
    if (Date.now() > pending.expiresAt) { this.cancel(); return { ok: false, error: 'expired' }; }
    if (!pending.code || code !== pending.code) {
      pending.attempts += 1;
      const attemptsLeft = MAX_ATTEMPTS - pending.attempts;
      if (attemptsLeft <= 0) { this.cancel(); return { ok: false, error: 'locked' }; }
      return { ok: false, error: 'mismatch', attemptsLeft };
    }
    const { user, setup } = pending;
    dismissCodeNotification(pending.notifId);
    if (setup) return { ok: true, needsSetup: true, user: null, token: null, setupToken: null }; // keep pending for setup
    pending = null;
    return { ok: true, needsSetup: false, user, token: null };
  },

  async completeSetup(to, profile /* , setupToken */) {
    if (!pending || pending.to !== to || !pending.setup) return { ok: false, error: 'expired' };
    const user = await Store.createUser({
      ...profile, role: 'Admin', title: '', status: 'Active', recentProperty: '', createdAt: new Date().toISOString(),
    });
    pending = null;
    return { ok: true, user, token: null };
  },

  cancel() {
    if (pending) dismissCodeNotification(pending.notifId);
    pending = null;
  },

  ssoRedeem: async () => ({ ok: false, error: 'expired' }), // SSO needs the API
};

/* --------------------------- AWS (production) --------------------------- */
// Calls the BGO Safety API (server/). The code is created, sent (SES / SNS) and
// checked on the server; the app never sees it.
const post = (path, body) => api('POST', path, body, { auth: false });

const aws = {
  async requestCode(identifier) {
    const id = parseIdentifier(identifier);
    if (!id) return { ok: false, error: 'invalid' };
    const r = await post('/auth/request-code', { identifier: id.value });
    if (!r.ok) return { ok: false, error: r.error === 'rate_limited' ? 'rate_limited' : r.error === 'invalid' ? 'invalid' : 'network' };
    // Use the device clock for the countdown (avoids clock-skew surprises)
    return { ok: true, channel: id.type, to: id.value, expiresAt: Date.now() + (r.ttlSeconds || 60) * 1000, maxAttempts: r.maxAttempts || MAX_ATTEMPTS };
  },
  async verifyCode(to, code) {
    const r = await post('/auth/verify-code', { identifier: to, code });
    if (r.ok) return r;
    return ['mismatch', 'locked', 'expired'].includes(r.error) ? r : { ok: false, error: 'network' };
  },
  async completeSetup(to, profile, setupToken) {
    const r = await post('/auth/complete-setup', { identifier: to, setupToken, ...profile });
    return r.ok ? r : { ok: false, error: r.error === 'expired' ? 'expired' : 'network' };
  },
  cancel() {},
  async ssoRedeem(ticket) {
    const r = await post('/auth/sso/redeem', { ticket });
    return r.ok ? r : { ok: false, error: r.error === 'expired' ? 'expired' : 'network' };
  },
};

export const Auth = AUTH_MODE === 'aws' ? aws : local;

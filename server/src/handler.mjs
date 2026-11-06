// BGO Safety API — one Lambda behind API Gateway (HTTP API), all routes.
// See docs/AWS_SETUP (Claude Doc) and docs/AUTH_API.md for the contract.
import {
  HttpError, env, epoch, fail, hmac, newId, normEmail, normPhone, nowIso, ok, parseIdentifier, publicUser, randomCode,
  safeEqual, safeSegment, signJwt, verifyJwt,
} from './util.mjs';
import { getSecrets } from './secrets.mjs';
import { sendCode } from './notify.mjs';
import { authorizeUrl, domainAllowed, exchangeCode, redirectAllowed, ssoSettings } from './oidc.mjs';
import { presignGet, presignPut } from './uploads.mjs';
import { findChecklist, storeSurveyPdf } from './pdf.mjs';
import { ensureListsLoaded } from './seed.mjs';

const CODE_TTL = Number(env('CODE_TTL_SECONDS', '60'));
const MAX_ATTEMPTS = Number(env('CODE_MAX_ATTEMPTS', '3'));
const REQUESTS_PER_15 = Number(env('CODE_REQUESTS_PER_15MIN', '5'));
const SESSION_DAYS = Number(env('SESSION_DAYS', '30'));

let repoPromise = null;
export function setRepo(repo) { repoPromise = Promise.resolve(repo); } // dev server / tests
async function repo() {
  if (!repoPromise) repoPromise = import('./repo-dynamo.mjs').then((m) => m.createDynamoRepo(env('TABLE_NAME')));
  return repoPromise;
}

/* ============================== Sessions ============================== */
async function issueSession(user) {
  const { jwtSecret } = await getSecrets();
  return signJwt({ sub: user.id, typ: 'session', iat: epoch(), exp: epoch() + SESSION_DAYS * 86400 }, jwtSecret);
}

async function authenticate(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const { jwtSecret } = await getSecrets();
  const claims = verifyJwt(token, jwtSecret);
  if (!claims || claims.typ !== 'session') fail(401, 'unauthorized');
  const db = await repo();
  const user = await db.getUser(claims.sub);
  if (!user || user.status !== 'Active') fail(401, 'unauthorized'); // deactivation takes effect immediately
  const all = user.role === 'Admin';
  return { user, db, req, canAccess: (p) => all || (user.properties || []).includes(p) };
}
const requireProperty = (ctx, p) => { safeSegment(p, 'property'); if (!ctx.canAccess(p)) fail(403, 'forbidden'); return p; };
const requireAdmin = (ctx) => { if (ctx.user.role !== 'Admin') fail(403, 'forbidden'); };
const by = (u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' ') });

/* ============================== Sign-in ============================== */
async function requestCode(body) {
  const id = parseIdentifier(body.identifier);
  if (!id) return { status: 400, body: { ok: false, error: 'invalid' } };
  const db = await repo();
  if ((await db.hit(`${id.type}#${id.value}`, 900)) > REQUESTS_PER_15) return { status: 429, body: { ok: false, error: 'rate_limited' } };

  const recent = await db.getCode(`${id.type}#${id.value}`);
  if (recent && recent.issuedAt && Date.now() - Date.parse(recent.issuedAt) < 10000) { // double tap / repeated request
    return ok({ ttlSeconds: Math.max(1, recent.expiresAt - epoch()), expiresAt: recent.expiresAt * 1000, maxAttempts: MAX_ATTEMPTS });
  }
  const setup = (await db.countUsers()) === 0;
  const user = setup ? null : await db.getUserByLogin(id.type, id.value);
  const eligible = setup || (user && user.status === 'Active');
  const { jwtSecret } = await getSecrets();
  // Same work and same answer whether or not the identifier is registered (no account enumeration)
  const code = randomCode();
  await db.putCode(`${id.type}#${id.value}`, {
    codeHash: eligible ? hmac(jwtSecret, `${id.value}:${code}`) : null, attempts: 0, expiresAt: epoch() + CODE_TTL,
    userId: user ? user.id : null, setup, issuedAt: nowIso(),
  }, CODE_TTL);
  if (eligible) {
    try { await sendCode({ channel: id.type, to: id.value, code, ttlSeconds: CODE_TTL }); }
    catch (e) {
      console.error(JSON.stringify({ event: 'code_send_failed', channel: id.type, error: e.name, message: e.message }));
      throw e;
    }
  }
  else console.log(JSON.stringify({ event: 'code_request_unknown_identifier', channel: id.type }));
  return ok({ ttlSeconds: CODE_TTL, expiresAt: (epoch() + CODE_TTL) * 1000, maxAttempts: MAX_ATTEMPTS });
}

async function verifyCode(body) {
  const id = parseIdentifier(body.identifier);
  if (!id) return { status: 400, body: { ok: false, error: 'invalid' } };
  const key = `${id.type}#${id.value}`;
  const db = await repo();
  const rec = await db.getCode(key);
  if (!rec || rec.expiresAt < epoch()) return { status: 400, body: { ok: false, error: 'expired' } };
  const { jwtSecret } = await getSecrets();
  const good = rec.codeHash && safeEqual(rec.codeHash, hmac(jwtSecret, `${id.value}:${String(body.code || '')}`));
  if (!good) {
    const n = await db.bumpAttempts(key);
    if (n >= MAX_ATTEMPTS) { await db.deleteCode(key); return { status: 400, body: { ok: false, error: 'locked' } }; }
    return { status: 400, body: { ok: false, error: 'mismatch', attemptsLeft: MAX_ATTEMPTS - n } };
  }
  await db.deleteCode(key);
  if (rec.setup) {
    const setupToken = signJwt({ sub: `${id.type}#${id.value}`, typ: 'setup', exp: epoch() + 900 }, jwtSecret);
    return ok({ needsSetup: true, setupToken });
  }
  const user = await db.getUser(rec.userId);
  if (!user || user.status !== 'Active') return { status: 400, body: { ok: false, error: 'expired' } };
  return ok({ needsSetup: false, user: publicUser(user), token: await issueSession(user) });
}

async function completeSetup(body) {
  const { jwtSecret } = await getSecrets();
  const claims = verifyJwt(body.setupToken, jwtSecret);
  if (!claims || claims.typ !== 'setup') return { status: 400, body: { ok: false, error: 'expired' } };
  const db = await repo();
  if ((await db.countUsers()) > 0) return { status: 400, body: { ok: false, error: 'expired' } };
  const [type, value] = claims.sub.split('#');
  const user = {
    id: newId('u-'), firstName: String(body.firstName || '').trim(), lastName: String(body.lastName || '').trim(),
    email: type === 'email' ? value : normEmail(body.email), phone: type === 'phone' ? value : normPhone(body.phone),
    role: 'Admin', title: '', status: 'Active', properties: ['*'], recentProperty: '', createdAt: nowIso(),
  };
  if (!user.firstName || !user.lastName) return { status: 400, body: { ok: false, error: 'invalid' } };
  await db.putUser(user);
  return ok({ user: publicUser(user), token: await issueSession(user) });
}

/* ---------- SSO (Okta / Microsoft) — see oidc.mjs ---------- */
// Back to the app. Android's in-app browser often refuses a server redirect straight into an app, so this
// is a small page that opens the app by script, with a button as the fallback (a tap always works).
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function appRedirect(to, params) {
  const url = `${to}?${new URLSearchParams(params)}`;
  const ok = !!params.ticket;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BGO Safety</title><style>body{font:17px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#EDF0F2;color:#1C2630}
main{max-width:420px;padding:28px;text-align:center}a{display:inline-block;margin-top:18px;padding:14px 22px;border-radius:10px;background:#065CFE;color:#fff;font-weight:700;text-decoration:none}
@media (prefers-color-scheme:dark){body{background:#11171C;color:#E7ECEF}}</style></head><body><main>
<h1 style="font-size:22px;margin:0 0 6px">${ok ? 'Signed in' : 'Sign-in didn’t finish'}</h1>
<p style="margin:0;opacity:.8">${ok ? 'Returning you to BGO Safety… If nothing happens, switch back to the app: it finishes signing you in by itself.' : 'Switch back to BGO Safety to see why.'}</p>
<a id="go" href="${esc(url)}">Return to BGO Safety</a></main>
<script>setTimeout(function(){location.href=${JSON.stringify(url)};},150);</script></body></html>`;
  return { status: 200, html, appUrl: url };
}

// App-driven start: the API creates the sign-in and a private "poll id"; the app opens the returned URL
// and asks /auth/sso/poll every few seconds, so sign-in completes even if the browser can't hand control
// back to the app (common in emulators and some in-app browsers).
async function ssoBegin(req) {
  const s = ssoSettings();
  const to = String(req.body.redirect || '');
  if (!redirectAllowed(to)) return { status: 400, body: { ok: false, error: 'invalid_redirect' } };
  if (!s.enabled) return { status: 400, body: { ok: false, error: 'sso_not_configured' } };
  const state = newId(), nonce = newId(), verifier = newId() + newId(), poll = newId() + newId();
  await (await repo()).putTemp('state', state, { to, nonce, verifier, poll }, 600);
  return ok({ url: await authorizeUrl({ callbackUrl: `${req.baseUrl}/auth/sso/callback`, state, nonce, verifier }), pollId: poll });
}

async function ssoPoll(req) {
  const id = String(req.query.id || '');
  if (!/^[A-Za-z0-9-]{40,100}$/.test(id)) return { status: 400, body: { ok: false, error: 'invalid' } };
  const r = await (await repo()).takeTemp('poll', id);
  if (!r) return ok({ pending: true });
  return ok({ pending: false, ticket: r.ticket || null, error: r.error || null, email: r.email || null });
}

async function ssoStart(req) {
  const s = ssoSettings();
  const to = String(req.query.redirect || '');
  if (!redirectAllowed(to)) return { status: 400, body: { ok: false, error: 'invalid_redirect' } };
  if (!s.enabled) return appRedirect(to, { error: 'sso_not_configured' });
  const state = newId(), nonce = newId(), verifier = newId() + newId();
  await (await repo()).putTemp('state', state, { to, nonce, verifier }, 600);
  return { status: 302, headers: { location: await authorizeUrl({ callbackUrl: `${req.baseUrl}/auth/sso/callback`, state, nonce, verifier }) }, body: null };
}

async function ssoCallback(req) {
  const db = await repo();
  const st = await db.takeTemp('state', String(req.query.state || ''));
  if (!st) return { status: 400, body: { ok: false, error: 'expired' } };
  const finish = async (params) => { if (st.poll) await db.putTemp('poll', st.poll, params, 300); return appRedirect(st.to, params); };
  if (req.query.error || !req.query.code) return finish({ error: 'cancelled' });
  let email;
  try {
    ({ email } = await exchangeCode({ code: String(req.query.code), callbackUrl: `${req.baseUrl}/auth/sso/callback`, verifier: st.verifier, nonce: st.nonce }));
  } catch (e) {
    console.error(JSON.stringify({ event: 'sso_failed', message: e.message }));
    return finish({ error: 'sso_failed' });
  }
  const user = email && domainAllowed(email) ? await db.getUserByLogin('email', email) : null;
  if (!user || user.status !== 'Active') return finish({ error: 'not_registered', email: email || '' });
  const ticket = newId() + newId();
  await db.putTemp('ticket', ticket, { userId: user.id }, 120);
  return finish({ ticket });
}

async function ssoRedeem(body) {
  const db = await repo();
  const t = await db.takeTemp('ticket', String(body.ticket || ''));
  const user = t && await db.getUser(t.userId);
  if (!user || user.status !== 'Active') return { status: 400, body: { ok: false, error: 'expired' } };
  return ok({ user: publicUser(user), token: await issueSession(user) });
}

/* ============================== Surveys ============================== */
// A survey is saved as a whole (answers included). Simultaneous editing is rare, so instead of
// merging, a save based on an older version is refused and the app asks the user what to do.
const surveyId = (p, c, per) => `${p}~${c}~${per}`;
function parseSurveyId(sid) {
  const [p, c, per] = String(sid).split('~');
  return { p: safeSegment(p, 'survey'), c: safeSegment(c, 'survey'), per: safeSegment(per, 'survey') };
}
const cleanAnswers = (answers) => Object.fromEntries(Object.entries(answers || {}).map(([qid, a]) => [safeSegment(qid, 'question'), {
  answer: a.answer ?? null, followUps: a.followUps || {}, note: a.note || '', copiedFrom: a.copiedFrom || null,
  copiedUnreviewed: !!a.copiedUnreviewed, photos: (a.photos || []).map((x) => ({ key: x.key, at: x.at })).filter((x) => x.key),
}]));

async function loadSurvey(ctx, sid) {
  const { p, c, per } = parseSurveyId(sid);
  requireProperty(ctx, p);
  const s = await ctx.db.getSurvey(p, c, per);
  if (!s) fail(404, 'not_found');
  return s;
}

async function listSurveys(ctx, p) {
  requireProperty(ctx, p);
  return ok({ surveys: await ctx.db.listSurveys(p) });
}

async function createSurvey(ctx, p, body) {
  requireProperty(ctx, p);
  const checklistId = safeSegment(body.checklistId, 'checklist');
  const period = safeSegment(body.period, 'period');
  const now = nowIso();
  const s = {
    id: surveyId(p, checklistId, period), checklistId, propertyNumber: p, period, status: 'draft',
    startedAt: now, startedBy: by(ctx.user), copiedFromId: body.copiedFromId || null,
    answers: cleanAnswers(body.answers), savedAt: now, savedBy: by(ctx.user), version: 1,
  };
  if (!(await ctx.db.createSurvey(s))) return { status: 409, body: { ok: false, error: 'exists', survey: await ctx.db.getSurvey(p, checklistId, period) } };
  return ok({ survey: s }, 201);
}

// body: { answers, baseVersion, force? }; submit also marks it submitted
async function saveSurvey(ctx, sid, body, submit) {
  const s = await loadSurvey(ctx, sid);
  if (s.status !== 'draft') fail(409, 'not_draft');
  if (!body.force && Number(body.baseVersion) !== s.version) {
    return { status: 409, body: { ok: false, error: 'conflict', current: s } };
  }
  const now = nowIso();
  const next = { ...s, answers: cleanAnswers(body.answers), savedAt: now, savedBy: by(ctx.user), version: s.version + 1 };
  if (submit) Object.assign(next, { status: 'submitted', submittedAt: now, submittedBy: by(ctx.user) });
  if (!(await ctx.db.updateSurvey(next, s.version))) return { status: 409, body: { ok: false, error: 'conflict', current: await loadSurvey(ctx, sid) } };
  if (submit) await makePdf(ctx, next); // a failure here doesn't undo the submission; the PDF can be rebuilt on request
  return ok({ survey: next });
}

// Builds the PDF report and records where it is. -> survey (with pdfKey when it worked)
async function makePdf(ctx, s) {
  try {
    const key = await storeSurveyPdf(s, await ctx.db.getProperty(s.propertyNumber));
    const withPdf = { ...s, pdfKey: key, pdfAt: nowIso() };
    await ctx.db.updateSurvey(withPdf, s.version);
    return withPdf;
  } catch (e) {
    console.error(JSON.stringify({ event: 'pdf_failed', survey: s.id, message: e.message }));
    return s;
  }
}

// GET /surveys/{id}/pdf -> short-lived link to the report (built now if missing or ?rebuild=1)
async function surveyPdf(ctx, sid, query) {
  let s = await loadSurvey(ctx, sid);
  if (s.status === 'draft') fail(409, 'not_submitted');
  if (!findChecklist(s.checklistId)) fail(404, 'unknown_checklist');
  if (!s.pdfKey || query.rebuild) s = await makePdf(ctx, s);
  if (!s.pdfKey) fail(500, 'pdf_failed');
  const name = `${s.propertyNumber}-${s.period}-${(findChecklist(s.checklistId).title || 'survey').replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
  return ok({ url: await presignGet(s.pdfKey, ctx.req, name), key: s.pdfKey });
}

async function deleteSurvey(ctx, sid) {
  const s = await loadSurvey(ctx, sid);
  if (s.status !== 'draft') fail(409, 'not_draft');
  await ctx.db.deleteSurvey(s);
  return ok({});
}

// Past surveys from elsewhere: Admins for any property; anyone for their own properties when DEMO_MODE is on
async function importSurveys(ctx, body) {
  let n = 0;
  for (const it of body.surveys || []) {
    const p = safeSegment(it.propertyNumber, 'property');
    if (ctx.user.role !== 'Admin' && !(env('DEMO_MODE') === 'true' && ctx.canAccess(p))) fail(403, 'forbidden');
    const s = {
      id: surveyId(p, safeSegment(it.checklistId, 'checklist'), safeSegment(it.period, 'period')), checklistId: it.checklistId,
      propertyNumber: p, period: it.period, status: ['submitted', 'approved'].includes(it.status) ? it.status : 'approved',
      startedAt: it.startedAt, startedBy: it.startedBy, submittedAt: it.submittedAt || null, submittedBy: it.submittedBy || null,
      approvedAt: it.approvedAt || null, approvedBy: it.approvedBy || null, demo: !!it.demo,
      answers: cleanAnswers(it.answers), savedAt: nowIso(), savedBy: it.submittedBy || by(ctx.user), version: 1,
    };
    if (await ctx.db.createSurvey(s)) n += 1;
  }
  return ok({ imported: n });
}

/* ============================== Own mobile number ============================== */
// A signed-in user changes their mobile number: a code goes to the NEW number and must be entered
// to save it, so nobody can attach a number they don't have. Removing the number needs no code.
async function requestPhoneChange(ctx, body) {
  const id = parseIdentifier(body.phone);
  if (!id || id.type !== 'phone') fail(400, 'invalid_phone');
  if (id.value === ctx.user.phone) fail(400, 'same_phone');
  const other = await ctx.db.getUserByLogin('phone', id.value);
  if (other && other.id !== ctx.user.id) fail(409, 'phone_in_use');
  if ((await ctx.db.hit(`phonechange#${ctx.user.id}`, 900)) > REQUESTS_PER_15) return { status: 429, body: { ok: false, error: 'rate_limited' } };
  const { jwtSecret } = await getSecrets();
  const code = randomCode();
  await ctx.db.putCode(`phonechange#${ctx.user.id}`, { codeHash: hmac(jwtSecret, `${id.value}:${code}`), phone: id.value, attempts: 0, expiresAt: epoch() + CODE_TTL * 5, issuedAt: nowIso() }, CODE_TTL * 5);
  await sendCode({ channel: 'phone', to: id.value, code, ttlSeconds: CODE_TTL * 5 });
  return ok({ phone: id.value, ttlSeconds: CODE_TTL * 5, maxAttempts: MAX_ATTEMPTS });
}

async function verifyPhoneChange(ctx, body) {
  const key = `phonechange#${ctx.user.id}`;
  const rec = await ctx.db.getCode(key);
  if (!rec || rec.expiresAt < epoch()) return { status: 400, body: { ok: false, error: 'expired' } };
  const { jwtSecret } = await getSecrets();
  if (!safeEqual(rec.codeHash, hmac(jwtSecret, `${rec.phone}:${String(body.code || '')}`))) {
    const n = await ctx.db.bumpAttempts(key);
    if (n >= MAX_ATTEMPTS) { await ctx.db.deleteCode(key); return { status: 400, body: { ok: false, error: 'locked' } }; }
    return { status: 400, body: { ok: false, error: 'mismatch', attemptsLeft: MAX_ATTEMPTS - n } };
  }
  await ctx.db.deleteCode(key);
  const other = await ctx.db.getUserByLogin('phone', rec.phone);
  if (other && other.id !== ctx.user.id) fail(409, 'phone_in_use');
  const next = { ...ctx.user, phone: rec.phone };
  await ctx.db.putUser(next);
  return ok({ user: publicUser(next) });
}

/* ============================== Property location (captured on site) ============================== */
// A Property Manager (or Admin) standing at the property saves the phone's GPS position as its location.
async function setLocation(ctx, p, body) {
  requireProperty(ctx, p);
  const lat = Number(body.latitude), lng = Number(body.longitude), acc = Number(body.accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) fail(400, 'invalid_location');
  if (!Number.isFinite(acc) || acc > 150) fail(400, 'low_accuracy');
  const prop = await ctx.db.getProperty(p);
  if (!prop) fail(404, 'not_found');
  const next = {
    ...prop, latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6, locationAccuracy: Math.round(acc),
    locationSource: 'on-site', locationSetBy: by(ctx.user), locationSetAt: body.capturedAt || nowIso(),
  };
  await ctx.db.putProperties([next]);
  return ok({ property: next });
}

/* ============================== People ============================== */
const teamView = (u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role, title: u.title || '', email: u.email, phone: u.phone || '' });

async function getTeam(ctx, p) {
  requireProperty(ctx, p);
  const team = (await ctx.db.listUsers()).filter((u) => u.status === 'Active' && (u.properties || []).includes(p));
  return ok({ team: team.map(teamView).sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`)) });
}

// Admin: set exactly who is on a property's team (a later spreadsheet re-import replaces this)
async function setTeam(ctx, p, body) {
  requireAdmin(ctx); requireProperty(ctx, p);
  const want = new Set((body.userIds || []).map(String));
  for (const u of await ctx.db.listUsers()) {
    if (u.role === 'Admin') continue; // Admins already see every property
    const has = (u.properties || []).includes(p);
    if (has === want.has(u.id)) continue;
    const props = has ? u.properties.filter((x) => x !== p) : [...(u.properties || []), p].sort();
    await ctx.db.putUser({ ...u, properties: props });
  }
  return getTeam(ctx, p);
}

async function listUsers(ctx) {
  requireAdmin(ctx);
  return ok({ users: (await ctx.db.listUsers()).filter((u) => u.status === 'Active').map(teamView) });
}

// Admin: make someone an Admin (sees all properties) or a Property Manager again
async function setRole(ctx, id, body) {
  requireAdmin(ctx);
  const role = body.role === 'Admin' ? 'Admin' : 'Property Manager';
  if (id === ctx.user.id && role !== 'Admin') fail(400, 'cannot_demote_self');
  const u = await ctx.db.getUser(safeSegment(id, 'id'));
  if (!u) fail(404, 'not_found');
  await ctx.db.putUser({ ...u, role });
  return ok({ user: teamView({ ...u, role }) });
}

/* ============================== Incidents ============================== */
const PREFIX = { accident: 'ACC', nearMiss: 'NM' };
// Accident records hold health information: drafts are private to their author,
// submitted ones visible to the author and Admins. Near misses: everyone on the property.
const canSeeIncident = (ctx, i) => i.createdBy.id === ctx.user.id
  || (i.status !== 'draft' && (i.form !== 'accident' || ctx.user.role === 'Admin'));

async function listIncidents(ctx, p) {
  requireProperty(ctx, p);
  return ok({ incidents: (await ctx.db.listIncidents(p)).filter((i) => canSeeIncident(ctx, i)) });
}

async function createIncident(ctx, p, body) {
  requireProperty(ctx, p);
  if (!PREFIX[body.form]) fail(400, 'invalid_form');
  const now = nowIso();
  const inc = {
    id: safeSegment(body.id || newId('inc-'), 'id'), form: body.form, propertyNumber: p, status: 'draft', number: null,
    values: cleanValues(body.values), createdAt: now, createdBy: by(ctx.user), updatedAt: now, version: 1,
  };
  if (!(await ctx.db.putIncident(inc, null))) fail(409, 'exists');
  return ok({ incident: inc }, 201);
}

function cleanValues(v) {
  const out = { ...(v || {}) };
  if (Array.isArray(out.photos)) out.photos = out.photos.map((x) => ({ key: x.key, at: x.at })).filter((x) => x.key);
  return out;
}

async function loadIncident(ctx, p, id) {
  requireProperty(ctx, p);
  const inc = await ctx.db.getIncident(p, safeSegment(id, 'id'));
  if (!inc || !canSeeIncident(ctx, inc)) fail(404, 'not_found');
  return inc;
}

async function updateIncident(ctx, p, id, body) {
  const inc = await loadIncident(ctx, p, id);
  if (inc.status !== 'draft' || inc.createdBy.id !== ctx.user.id) fail(409, 'not_draft');
  const next = { ...inc, values: cleanValues(body.values), updatedAt: nowIso(), version: inc.version + 1 };
  if (!(await ctx.db.putIncident(next, Number(body.baseVersion || inc.version)))) {
    return { status: 409, body: { ok: false, error: 'conflict', current: await ctx.db.getIncident(p, id) } };
  }
  return ok({ incident: next });
}

async function submitIncident(ctx, p, id) {
  const inc = await loadIncident(ctx, p, id);
  if (inc.status !== 'draft' || inc.createdBy.id !== ctx.user.id) fail(409, 'not_draft');
  if (!String((inc.values || {}).title || '').trim()) fail(400, 'missing_title');
  const year = new Date().getFullYear();
  const n = await ctx.db.nextNumber(p, PREFIX[inc.form], year);
  const number = `${PREFIX[inc.form]}-${p}-${year}-${String(n).padStart(3, '0')}`;
  const next = { ...inc, status: 'submitted', number, submittedAt: nowIso(), submittedBy: by(ctx.user), updatedAt: nowIso(), version: inc.version + 1 };
  if (!(await ctx.db.putIncident(next, inc.version))) fail(409, 'conflict');
  return ok({ incident: next });
}

async function deleteIncident(ctx, p, id) {
  const inc = await loadIncident(ctx, p, id);
  if (inc.status !== 'draft' || inc.createdBy.id !== ctx.user.id) fail(409, 'not_draft');
  await ctx.db.deleteIncident(p, inc.id);
  return ok({});
}

/* ============================== Router ============================== */
async function route(req) {
  const { method, path, body, query } = req;
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const is = (m, n) => method === m && seg.length === n;
  if (env('AUTO_LOAD_LISTS') !== 'false') await ensureListsLoaded(await repo()); // first run after a deploy

  // Public
  if (seg[0] === 'auth' && method === 'POST') {
    if (seg[1] === 'request-code') return requestCode(body);
    if (seg[1] === 'verify-code') return verifyCode(body);
    if (seg[1] === 'complete-setup') return completeSetup(body);
    if (seg[1] === 'sso' && seg[2] === 'redeem') return ssoRedeem(body);
    if (seg[1] === 'sso' && seg[2] === 'begin') return ssoBegin(req);
  }
  if (seg[0] === 'auth' && seg[1] === 'sso' && method === 'GET') {
    if (seg[2] === 'status') { const s = ssoSettings(); return ok({ enabled: s.enabled, method: s.method, label: s.label }); }
    if (seg[2] === 'start') return ssoStart(req);
    if (seg[2] === 'callback') return ssoCallback(req);
    if (seg[2] === 'poll') return ssoPoll(req);
  }
  if (is('GET', 1) && seg[0] === 'health') return ok({ stage: env('STAGE', 'dev'), time: nowIso() });

  // Signed in
  const ctx = await authenticate(req);
  if (seg[0] === 'me' && is('GET', 1)) return ok({ user: publicUser(ctx.user), properties: ctx.user.properties || [] });
  if (seg[0] === 'me' && seg[1] === 'phone' && is('POST', 3) && seg[2] === 'request') return requestPhoneChange(ctx, body);
  if (seg[0] === 'me' && seg[1] === 'phone' && is('POST', 3) && seg[2] === 'verify') return verifyPhoneChange(ctx, body);
  if (seg[0] === 'me' && seg[1] === 'phone' && is('DELETE', 2)) {
    const next = { ...ctx.user, phone: '' };
    await ctx.db.putUser(next);
    return ok({ user: publicUser(next) });
  }
  if (seg[0] === 'me' && is('PATCH', 1)) {
    const next = { ...ctx.user };
    if (body.recentProperty !== undefined) { next.recentProperty = body.recentProperty ? requireProperty(ctx, body.recentProperty) : ''; }
    for (const k of ['emailNotifications', 'pushNotifications']) if (typeof body[k] === 'boolean') next[k] = body[k];
    await ctx.db.putUser(next);
    return ok({ user: publicUser(next) });
  }
  if (seg[0] === 'properties' && is('GET', 1)) {
    return ok({ properties: (await ctx.db.listProperties()).filter((p) => p.status !== 'Inactive' && ctx.canAccess(p.propertyNumber)).sort((a, b) => a.propertyNumber.localeCompare(b.propertyNumber)) });
  }
  if (seg[0] === 'properties' && seg.length === 3) {
    const p = seg[1];
    if (seg[2] === 'location' && method === 'PATCH') return setLocation(ctx, p, body);
    if (seg[2] === 'team' && method === 'GET') return getTeam(ctx, p);
    if (seg[2] === 'team' && method === 'PUT') return setTeam(ctx, p, body);
    if (seg[2] === 'surveys' && method === 'GET') return listSurveys(ctx, p);
    if (seg[2] === 'surveys' && method === 'POST') return createSurvey(ctx, p, body);
    if (seg[2] === 'incidents' && method === 'GET') return listIncidents(ctx, p);
    if (seg[2] === 'incidents' && method === 'POST') return createIncident(ctx, p, body);
  }
  if (seg[0] === 'surveys') {
    if (is('GET', 2)) return ok({ survey: await loadSurvey(ctx, seg[1]) });
    if (is('PUT', 2)) return saveSurvey(ctx, seg[1], body, false);
    if (is('DELETE', 2)) return deleteSurvey(ctx, seg[1]);
    if (is('POST', 3) && seg[2] === 'submit') return saveSurvey(ctx, seg[1], body, true);
    if (is('GET', 3) && seg[2] === 'pdf') return surveyPdf(ctx, seg[1], query);
  }
  if (seg[0] === 'incidents' && seg.length >= 3) {
    if (is('PUT', 3)) return updateIncident(ctx, seg[1], seg[2], body);
    if (is('DELETE', 3)) return deleteIncident(ctx, seg[1], seg[2]);
    if (is('POST', 4) && seg[3] === 'submit') return submitIncident(ctx, seg[1], seg[2]);
  }
  if (seg[0] === 'uploads' && is('POST', 1)) {
    const p = requireProperty(ctx, body.propertyNumber);
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp' })[body.contentType];
    if (!ext) fail(400, 'invalid_content_type');
    const key = `properties/${p}/photos/${newId()}.${ext}`;
    return ok({ key, uploadUrl: await presignPut(key, body.contentType, req) });
  }
  if (seg[0] === 'uploads' && seg[1] === 'url' && is('GET', 2)) {
    const m = /^properties\/([A-Za-z0-9._~-]+)\/photos\/[A-Za-z0-9-]+\.(jpg|png|heic|webp)$/.exec(query.key || '');
    if (!m) fail(400, 'invalid_key');
    requireProperty(ctx, m[1]);
    return ok({ url: await presignGet(query.key, req) });
  }
  if (seg[0] === 'import-surveys' && is('POST', 1)) return importSurveys(ctx, body);
  if (seg[0] === 'users' && is('GET', 1)) return listUsers(ctx);
  if (seg[0] === 'users' && is('PATCH', 3) && seg[2] === 'role') return setRole(ctx, seg[1], body);
  fail(404, 'not_found');
}

/* ============================== Lambda entry ============================== */
export async function handler(event) {
  const req = {
    method: (event.requestContext && event.requestContext.http && event.requestContext.http.method) || event.httpMethod || 'GET',
    // HTTP API puts the stage in rawPath; strip it so routes are stage-agnostic
    path: (event.rawPath || event.path || '/').replace(new RegExp(`^/${env('STAGE', '___')}(?=/)`), ''),
    headers: Object.fromEntries(Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])),
    query: event.queryStringParameters || {},
    body: {},
    // Public base URL of this API (used for the SSO callback and dev upload links)
    // (a custom domain has no /<stage> in its paths; the AWS address does)
    baseUrl: event.__baseUrl || env('API_PUBLIC_URL') || publicBase((event.headers || {}).host),
  };
  try {
    const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
    req.body = raw ? JSON.parse(raw) : {};
  } catch {
    return respond(400, { ok: false, error: 'invalid_json' });
  }
  try {
    const r = await route(req);
    if (r.status === 302) return { statusCode: 302, headers: { location: r.headers.location, 'cache-control': 'no-store' }, body: '' };
    if (r.html) return { statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-app-url': r.appUrl }, body: r.html };
    return respond(r.status || 200, r.body);
  } catch (e) {
    if (e instanceof HttpError) return respond(e.status, { ok: false, error: e.error, ...e.extra });
    console.error(JSON.stringify({ event: 'unhandled_error', path: req.path, method: req.method, message: e.message, stack: e.stack }));
    return respond(500, { ok: false, error: 'server_error' });
  }
}

function publicBase(host) {
  const awsHost = /\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/.test(String(host || ''));
  return `https://${host}${awsHost && env('STAGE') ? `/${env('STAGE')}` : ''}`;
}

const respond = (statusCode, body) => ({
  statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body),
});

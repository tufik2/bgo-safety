// End-to-end checks of the API logic against the in-memory store (no AWS needed).
//   npm test
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.STORE = 'memory'; process.env.DELIVERY = 'console'; process.env.STAGE = 'test'; process.env.DEMO_MODE = 'true';
const { handler, setRepo } = await import('../src/handler.mjs');
const { createMemoryRepo } = await import('../src/repo-memory.mjs');
const { loadSeed } = await import('./seed-lib.mjs');

const repo = createMemoryRepo();
const seed = loadSeed();
await repo.putUsers(seed.users); await repo.putProperties(seed.properties);
setRepo(repo);

let lastCode = null;
const log = console.log;
console.log = (...a) => { const m = /access code for .*: (\d{6})/.exec(a.join(' ')); if (m) lastCode = m[1]; else if (process.env.VERBOSE) log(...a); };
console.error = (...a) => { if (process.env.VERBOSE) log(...a); };

async function call(method, path, body, token) {
  const r = await handler({ rawPath: `/test${path.split('?')[0]}`, requestContext: { http: { method } }, headers: token ? { authorization: `Bearer ${token}` } : {},
    queryStringParameters: Object.fromEntries(new URL('http://x' + path).searchParams), body: body ? JSON.stringify(body) : '', __baseUrl: 'https://api.test/test' });
  const isHtml = (r.headers['content-type'] || '').startsWith('text/html');
  return { status: r.statusCode, location: r.headers.location || r.headers['x-app-url'], html: isHtml ? r.body : null, ...(r.body && !isHtml ? JSON.parse(r.body) : {}) };
}
async function signIn(identifier) {
  lastCode = null;
  { const { parseIdentifier } = await import('../src/util.mjs'); const id = parseIdentifier(identifier); await repo.deleteCode(`${id.type}#${id.value}`); } // skip the 10-second repeat guard
  assert.equal((await call('POST', '/auth/request-code', { identifier })).ok, true);
  const v = await call('POST', '/auth/verify-code', { identifier, code: lastCode });
  assert.equal(v.ok, true, JSON.stringify(v));
  return v;
}
let n = 0; const t = async (name, fn) => { await fn(); n += 1; log('  ✓', name); };

log('BGO Safety API smoke test');
await t('data: 611 Canadian properties, 72 users, roles Admin / Property Manager', async () => {
  assert.equal(seed.properties.length, 611); assert.equal(seed.users.length, 72);
  assert.deepEqual([...new Set(seed.users.map((u) => u.role))].sort(), ['Admin', 'Property Manager']);
});
await t('unknown and known identifiers get the same answer', async () => {
  const a = await call('POST', '/auth/request-code', { identifier: 'nobody@bgo.com' });
  const b = await call('POST', '/auth/request-code', { identifier: 'william.ren@refineddata.com' });
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
});
await t('a repeated request within 10 seconds sends no second code', async () => {
  lastCode = null; await call('POST', '/auth/request-code', { identifier: 'hugh@refineddata.com' }); const first = lastCode;
  lastCode = null; const again = await call('POST', '/auth/request-code', { identifier: 'hugh@refineddata.com' });
  assert.ok(first); assert.equal(lastCode, null); assert.equal(again.ok, true);
  await repo.deleteCode('email#hugh@refineddata.com');
});
await t('fresh stack: lists load automatically on first use; an early first-user account is merged', async () => {
  const { ensureListsLoaded, __resetSeedForTests } = await import('../src/seed.mjs');
  const fresh = createMemoryRepo();
  await fresh.putUser({ id: 'u-setup', firstName: 'William', lastName: 'Ren', email: 'william.ren@refineddata.com', role: 'Admin', status: 'Active', properties: ['*'] });
  __resetSeedForTests(); await ensureListsLoaded(fresh);
  assert.equal((await fresh.listProperties()).length, 611);
  const users = await fresh.listUsers();
  assert.equal(users.length, 72);
  assert.equal(users.filter((u) => u.email === 'william.ren@refineddata.com').length, 1);
  assert.equal((await fresh.getUserByLogin('email', 'william.ren@refineddata.com')).id, 'u-setup');
  __resetSeedForTests(); await fresh.putProperties([{ propertyNumber: 'x', name: 'later' }]);
  await ensureListsLoaded(fresh); assert.equal((await fresh.listProperties()).length, 612); // runs once only
  __resetSeedForTests();
});
await t('"none" clears the forced sending number', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/notify.mjs', import.meta.url), 'utf8');
  assert.match(src, /none\|-/);
  process.env.SNS_ORIGINATION_NUMBER = 'none';
  const { env: raw } = await import('../src/util.mjs');
  assert.equal(raw('SNS_ORIGINATION_NUMBER'), 'none'); // raw value; notify.mjs treats it as unset
  delete process.env.SNS_ORIGINATION_NUMBER;
});
await t('text message wording, with the right expiry', async () => {
  const { smsText } = await import('../src/notify.mjs');
  assert.equal(smsText('482913', 60), 'Your BGO Safety verification code is 482913. It expires in 60 seconds.');
  assert.equal(smsText('482913', 300), 'Your BGO Safety verification code is 482913. It expires in 5 minutes.');
  process.env.SMS_WORDING = 'registered-sample';
  assert.equal(smsText('482913', 60), 'RefinedRisk - Verification code is 482913');
  delete process.env.SMS_WORDING;
});
await t('three wrong codes lock the attempt', async () => {
  await call('POST', '/auth/request-code', { identifier: 'carl.paulse@refineddata.com' });
  assert.equal((await call('POST', '/auth/verify-code', { identifier: 'carl.paulse@refineddata.com', code: '000000' })).attemptsLeft, 2);
  await call('POST', '/auth/verify-code', { identifier: 'carl.paulse@refineddata.com', code: '000000' });
  assert.equal((await call('POST', '/auth/verify-code', { identifier: 'carl.paulse@refineddata.com', code: '000000' })).error, 'locked');
});
const admin = await signIn('william.ren@refineddata.com');
await t('phone sign-in works with any formatting', async () => assert.equal((await signIn('(905) 975 1247')).user.firstName, 'Carl'));
await t('Admin sees all properties', async () => assert.equal((await call('GET', '/properties', null, admin.token)).properties.length, 611));

const pm = await signIn('lilia.brieva@bgo.com');
const pm2 = await signIn('sophie.meunier@bgo.com');
await t('Property Manager sees only assigned properties', async () => {
  assert.deepEqual((await call('GET', '/properties', null, pm.token)).properties.map((p) => p.propertyNumber), ['c30016']);
  assert.equal((await call('GET', '/properties/000000/surveys', null, pm.token)).status, 403);
});
await t('property team: listed for members; only Admins change it', async () => {
  const team = (await call('GET', '/properties/c30016/team', null, pm.token)).team.map((u) => u.email);
  assert.ok(team.includes('lilia.brieva@bgo.com') && team.includes('sophie.meunier@bgo.com'));
  assert.equal((await call('PUT', '/properties/c30016/team', { userIds: [] }, pm.token)).status, 403);
  const ids = (await call('GET', '/properties/c30016/team', null, admin.token)).team.map((u) => u.id).filter((id) => id !== pm2.user.id);
  const r = await call('PUT', '/properties/c30016/team', { userIds: ids }, admin.token);
  assert.ok(!r.team.some((u) => u.email === 'sophie.meunier@bgo.com'));
  assert.equal((await call('GET', '/properties/c30016/surveys', null, pm2.token)).status, 403); // removed -> no access
  await call('PUT', '/properties/c30016/team', { userIds: [...ids, pm2.user.id] }, admin.token);
});
await t('Admin can promote a user; nobody can demote themselves', async () => {
  assert.equal((await call('PATCH', `/users/${pm2.user.id}/role`, { role: 'Admin' }, pm.token)).status, 403);
  assert.equal((await call('PATCH', `/users/${pm2.user.id}/role`, { role: 'Admin' }, admin.token)).user.role, 'Admin');
  assert.equal((await call('GET', '/properties', null, pm2.token)).properties.length, 611);
  assert.equal((await call('PATCH', `/users/${admin.user.id}/role`, { role: 'Property Manager' }, admin.token)).error, 'cannot_demote_self');
  await call('PATCH', `/users/${pm2.user.id}/role`, { role: 'Property Manager' }, admin.token);
});

let sid;
await t('surveys save as a whole; a save from an older version is refused, force overrides', async () => {
  const r = await call('POST', '/properties/c30016/surveys', { checklistId: 'chk1', period: '2026', answers: { q1: { answer: 'yes', copiedFrom: '2025' } } }, pm.token);
  assert.equal(r.status, 201); sid = encodeURIComponent(r.survey.id);
  const a = await call('PUT', `/surveys/${sid}`, { answers: { q1: { answer: 'no' } }, baseVersion: 1 }, pm.token);
  assert.equal(a.survey.version, 2);
  const b = await call('PUT', `/surveys/${sid}`, { answers: { q1: { answer: 'na' } }, baseVersion: 1 }, pm2.token);
  assert.equal(b.status, 409); assert.equal(b.current.savedBy.name, 'Lilia Brieva'); assert.equal(b.current.answers.q1.answer, 'no');
  const c = await call('PUT', `/surveys/${sid}`, { answers: { q1: { answer: 'na' } }, baseVersion: 1, force: true }, pm2.token);
  assert.equal(c.survey.version, 3);
});
await t('submit locks the survey', async () => {
  assert.equal((await call('POST', `/surveys/${sid}/submit`, { answers: { q1: { answer: 'na' } }, baseVersion: 3 }, pm.token)).survey.status, 'submitted');
  assert.equal((await call('PUT', `/surveys/${sid}`, { answers: {}, baseVersion: 4 }, pm.token)).status, 409);
});
await t('demo history: own properties only', async () => {
  const s = { propertyNumber: 'c30016', checklistId: 'chk1', period: '2025', status: 'approved', answers: { q1: { answer: 'no' } } };
  assert.equal((await call('POST', '/import-surveys', { surveys: [s] }, pm.token)).imported, 1);
  assert.equal((await call('POST', '/import-surveys', { surveys: [{ ...s, propertyNumber: '000000' }] }, pm.token)).status, 403);
});
await t('incidents: private drafts, numbering, accident visibility', async () => {
  assert.equal((await call('POST', '/properties/c30016/incidents', { id: 'inc-1', form: 'accident', values: { title: 'Slip' } }, pm.token)).status, 201);
  assert.equal((await call('GET', '/properties/c30016/incidents', null, admin.token)).incidents.length, 0);
  const s = await call('POST', '/incidents/c30016/inc-1/submit', null, pm.token);
  assert.match(s.incident.number, /^ACC-c30016-\d{4}-001$/);
  assert.equal((await call('GET', '/properties/c30016/incidents', null, admin.token)).incidents.length, 1);
  assert.equal((await call('GET', '/properties/c30016/incidents', null, pm2.token)).incidents.length, 0);
});
await t('own mobile number: verified by a code to the new number; unique; can be removed', async () => {
  lastCode = null;
  const r = await call('POST', '/me/phone/request', { phone: '(647) 555 0199' }, pm.token);
  assert.equal(r.phone, '647-555-0199'); assert.ok(lastCode);
  assert.equal((await call('POST', '/me/phone/verify', { code: '000000' }, pm.token)).attemptsLeft, 2);
  const v = await call('POST', '/me/phone/verify', { code: lastCode }, pm.token);
  assert.equal(v.user.phone, '647-555-0199');
  assert.equal((await repo.getUserByLogin('phone', '647-555-0199')).id, pm.user.id); // can now sign in by text
  assert.equal((await call('POST', '/me/phone/request', { phone: '905-975-1247' }, pm.token)).error, 'phone_in_use'); // Carl's
  assert.equal((await call('DELETE', '/me/phone', null, pm.token)).user.phone, '');
  assert.equal(await repo.getUserByLogin('phone', '647-555-0199'), null);
});
await t('property location saved on site: access, accuracy check, kept on re-import', async () => {
  assert.equal((await call('PATCH', '/properties/c30016/location', { latitude: 45.5, longitude: -73.57, accuracy: 400 }, pm.token)).error, 'low_accuracy');
  assert.equal((await call('PATCH', '/properties/000000/location', { latitude: 45.5, longitude: -73.57, accuracy: 10 }, pm.token)).status, 403);
  const r = await call('PATCH', '/properties/c30016/location', { latitude: 45.50085, longitude: -73.57148, accuracy: 12 }, pm.token);
  assert.equal(r.property.locationSource, 'on-site'); assert.equal(r.property.locationSetBy.name, 'Lilia Brieva');
  const { mergeProperty } = await import('./seed-lib.mjs');
  const fileCopy = { ...r.property, latitude: null, longitude: null, locationSource: undefined };
  assert.equal(mergeProperty(r.property, fileCopy).latitude, 45.50085); // re-import keeps it
  assert.equal(mergeProperty(r.property, { ...fileCopy, address: 'Somewhere else' }).latitude, null); // moved: cleared
});
await t('photo links are scoped to the property', async () => {
  assert.match((await call('POST', '/uploads', { propertyNumber: 'c30016', contentType: 'image/jpeg' }, pm.token)).key, /^properties\/c30016\/photos\//);
  assert.equal((await call('POST', '/uploads', { propertyNumber: '000000', contentType: 'image/jpeg' }, pm.token)).status, 403);
});

await t('submitting builds a PDF report in S3 (answers, actions, signature, photo)', async () => {
  const fs = await import('node:fs');
  const cl = JSON.parse(fs.readFileSync(new URL('../checklists/fire-life-safety.json', import.meta.url)));
  const { devFiles } = await import('../src/uploads.mjs');
  const { PDFDocument } = await import('pdf-lib');
  // a tiny real JPEG for the photo
  const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  devFiles.set('properties/c30016/photos/p1.jpg', { type: 'image/jpeg', buf: jpg });
  const answers = {};
  cl.categories.forEach((c) => c.questions.forEach((q, i) => { if (q.answers.length) answers[q.id] = { answer: i === 0 ? 'no' : 'yes', followUps: {} }; }));
  const q0 = cl.categories[0].questions[0];
  answers[q0.id] = { answer: 'no', followUps: { [q0.followUps.find((f) => f.requiredWhen === 'no').id]: 'Plan is from 2023 – update booked' }, note: 'Asked the fire department', photos: [{ key: 'properties/c30016/photos/p1.jpg' }] };
  const sign = cl.categories.at(-1).questions[0];
  answers[sign.id] = { followUps: { [sign.followUps[0].id]: 'Lilia Brieva', [sign.followUps[1].id]: { paths: ['M10 80 L60 40 L110 90 L160 30'], width: 300, height: 140 } } };
  const r = await call('POST', '/properties/c30016/surveys', { checklistId: cl.id, period: '2026', answers }, pm.token);
  const sid2 = encodeURIComponent(r.survey.id);
  await call('POST', `/surveys/${sid2}/submit`, { answers, baseVersion: 1 }, pm.token);
  const pdf = await call('GET', `/surveys/${sid2}/pdf`, null, pm.token);
  assert.match(pdf.key, /^properties\/c30016\/reports\/.+-2026\.pdf$/);
  const bytes = devFiles.get(pdf.key).buf;
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getPageCount() >= 3, 'pages: ' + doc.getPageCount());
  fs.writeFileSync('/tmp/sample-report.pdf', bytes);
  assert.equal((await call('GET', `/surveys/${sid2}/pdf`, null, pm2.token)).status, 200); // team member can open it
  assert.equal((await call('GET', `/surveys/${encodeURIComponent('000000~x~2026')}/pdf`, null, pm.token)).status, 403);
});

/* ---------- SSO with a fake Okta (fetch is stubbed) ---------- */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const ISS = 'https://bgo.okta.test';
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
let lastTokenRequest = null, idTokenEmail = 'lilia.brieva@bgo.com', idTokenNonce = null;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o });
  if (u === `${ISS}/.well-known/openid-configuration`) return json({ issuer: ISS, authorization_endpoint: `${ISS}/oauth2/v1/authorize`, token_endpoint: `${ISS}/oauth2/v1/token`, jwks_uri: `${ISS}/oauth2/v1/keys` });
  if (u === `${ISS}/oauth2/v1/keys`) return json({ keys: [jwk] });
  if (u === `${ISS}/oauth2/v1/token`) {
    lastTokenRequest = new URLSearchParams(opts.body);
    const now = Math.floor(Date.now() / 1000);
    const h = b64({ alg: 'RS256', kid: 'k1' }), p = b64({ iss: ISS, aud: 'client-123', exp: now + 300, iat: now, email: idTokenEmail, nonce: idTokenNonce });
    return json({ id_token: `${h}.${p}.${crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}` });
  }
  throw new Error('unexpected fetch ' + u);
};
await t('SSO off: start sends the app back with sso_not_configured', async () => {
  const r = await call('GET', '/auth/sso/start?redirect=bgosafety://auth');
  assert.equal(r.status, 200); assert.match(r.location, /^bgosafety:\/\/auth\?error=sso_not_configured$/);
  assert.match(r.html, /Return to BGO Safety/); assert.ok(r.html.includes('href="bgosafety://auth?error=sso_not_configured"'));
  assert.equal((await call('GET', '/auth/sso/start?redirect=https://evil.example/x')).status, 400);
});
process.env.SSO_METHOD = 'okta'; process.env.SSO_DOMAIN = ISS; process.env.SSO_CLIENT_ID = 'client-123';
process.env.DEV_SECRET = JSON.stringify({ ssoConfigType: 'clientSecret', ssoClientSecret: 'shh' });
(await import('../src/secrets.mjs')).__resetForTests();
async function ssoRound(email) {
  idTokenEmail = email;
  const start = await call('GET', '/auth/sso/start?redirect=bgosafety://auth');
  const auth = new URL(start.location);
  assert.equal(auth.origin + auth.pathname, `${ISS}/oauth2/v1/authorize`);
  assert.equal(auth.searchParams.get('redirect_uri'), 'https://api.test/test/auth/sso/callback');
  idTokenNonce = auth.searchParams.get('nonce');
  const cb = await call('GET', `/auth/sso/callback?code=abc&state=${auth.searchParams.get('state')}`);
  return new URL(cb.location.replace('bgosafety://auth', 'https://app.local/'));
}
await t('Okta sign-in with client secret: code swapped on the server, app gets a one-time ticket', async () => {
  const back = await ssoRound('Lilia.Brieva@bgo.com');
  assert.equal(lastTokenRequest.get('client_secret'), 'shh');
  const ticket = back.searchParams.get('ticket');
  const r = await call('POST', '/auth/sso/redeem', { ticket });
  assert.equal(r.user.email, 'lilia.brieva@bgo.com'); assert.ok(r.token);
  assert.equal((await call('POST', '/auth/sso/redeem', { ticket })).error, 'expired'); // one use only
});
await t('app-driven sign-in: the app gets its pass by polling, without the browser handing back', async () => {
  idTokenEmail = 'lilia.brieva@bgo.com';
  const b = await call('POST', '/auth/sso/begin', { redirect: 'exp://192.168.1.20:8081/--/auth' });
  assert.ok(b.pollId); const auth = new URL(b.url);
  assert.equal((await call('GET', `/auth/sso/poll?id=${b.pollId}`)).pending, true);
  idTokenNonce = auth.searchParams.get('nonce');
  await call('GET', `/auth/sso/callback?code=abc&state=${auth.searchParams.get('state')}`);
  const p = await call('GET', `/auth/sso/poll?id=${b.pollId}`);
  assert.equal(p.pending, false); assert.ok(p.ticket);
  assert.equal((await call('POST', '/auth/sso/redeem', { ticket: p.ticket })).user.email, 'lilia.brieva@bgo.com');
  assert.equal((await call('GET', `/auth/sso/poll?id=${b.pollId}`)).pending, true); // one use
});
await t('Okta sign-in for someone not in the user list is refused', async () => {
  assert.equal((await ssoRound('stranger@bgo.com')).searchParams.get('error'), 'not_registered');
});
await t('Microsoft-style certificate authentication signs a client assertion', async () => {
  // reuse the fake issuer; switch the credential to a private key
  process.env.DEV_SECRET = JSON.stringify({ ssoConfigType: 'certificate', ssoPrivateCertificate: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const mod = await import('../src/secrets.mjs'); mod.__resetForTests && mod.__resetForTests();
  await ssoRound('lilia.brieva@bgo.com');
  const a = lastTokenRequest.get('client_assertion');
  assert.ok(a && lastTokenRequest.get('client_secret') === null);
  const [h, p, s] = a.split('.');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url')));
});
log(`\n${n} checks passed`);

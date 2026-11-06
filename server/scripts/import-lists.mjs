// Turns the client's spreadsheets into the files the loader uploads:
//   node scripts/import-lists.mjs --properties property-list.xlsx --users BGO_Users.xlsx [--country Canada]
// Writes server/data/properties.json and users.json (and the app's on-device copies), then you run
//   node scripts/load-data.mjs --table bgo-safety-prod
//
// Rules (agreed for the POC):
// - Properties: only the given country (default Canada); entries without a street address and city are skipped.
// - A user is assigned to every property listing their email under "Property Manager Email".
//   Emails there that aren't in the user list are ignored.
// - Users with no assigned property are left out, except Admins (server/data/admins.json) and our own
//   team accounts (server/data/extra-users.json).
// - Roles: Admin if listed in admins.json, otherwise Property Manager. The job title comes from "Role".
// - Passwords or other sign-in columns in the user list are never read.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const appData = path.join(root, '..', 'src', 'data');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const propFile = arg('--properties'), userFile = arg('--users'), country = arg('--country', 'Canada');
if (!propFile || !userFile) { console.error('Usage: node scripts/import-lists.mjs --properties <file.xlsx> --users <file.xlsx> [--country Canada]'); process.exit(1); }

async function rows(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const head = ws.getRow(1).values.slice(1).map((h) => String(h || '').trim().toLowerCase());
  const out = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const v = row.values.slice(1);
    const o = {};
    head.forEach((h, i) => { let x = v[i]; if (x && typeof x === 'object') x = x.text ?? x.result ?? (x.richText ? x.richText.map((t) => t.text).join('') : ''); o[h] = x == null ? '' : String(x).trim(); });
    out.push(o);
  });
  return out;
}
const col = (o, ...names) => { for (const n of names) if (o[n] !== undefined && o[n] !== '') return o[n]; return ''; };
const na = (v) => ['', 'NA', 'N/A'].includes(String(v || '').trim().toUpperCase());
const email = (e) => String(e || '').trim().toLowerCase();
const PROV = { ON: 'Ontario', AB: 'Alberta', BC: 'British Columbia', QC: 'Québec', MB: 'Manitoba', SK: 'Saskatchewan', NS: 'Nova Scotia', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', PE: 'Prince Edward Island', YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut' };
const CODE = Object.fromEntries(Object.entries(PROV).map(([k, v]) => [v.toLowerCase(), k]));
Object.assign(CODE, { quebec: 'QC', pq: 'QC' });
const provCode = (p) => { const t = String(p || '').trim(); return PROV[t.toUpperCase()] ? t.toUpperCase() : CODE[t.toLowerCase()] || t; };
const read = (f, d) => (fs.existsSync(path.join(dataDir, f)) ? JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')) : d);

const oldProps = new Map(read('properties.json', []).map((p) => [p.propertyNumber, p]));
const oldUsers = new Map(read('users.json', []).map((u) => [email(u.email), u]));
const admins = new Set(read('admins.json', []).map(email));
const extra = read('extra-users.json', []);

// ---- properties
const props = [], pmByProp = new Map();
let skippedCountry = 0, skippedAddress = 0;
for (const r of await rows(propFile)) {
  if (col(r, 'country').toLowerCase() !== country.toLowerCase()) { skippedCountry += 1; continue; }
  const address = col(r, 'address'), city = col(r, 'city');
  if (na(address) || na(city) || /,\s*NA\b/.test(address)) { skippedAddress += 1; continue; }
  const num = col(r, 'property number');
  const code = provCode(col(r, 'province'));
  const p = {
    propertyNumber: num, name: col(r, 'property name'), address, city, province: code, stateProvince: PROV[code] || code,
    postalCode: col(r, 'postal code'), country, region: col(r, 'region'), type: col(r, 'type'), latitude: null, longitude: null,
  };
  const old = oldProps.get(num); // keep the map position if the address didn't change
  if (old && old.address === p.address && old.city === p.city && old.latitude != null) {
    for (const k of ['latitude', 'longitude', 'locationAccuracy', 'locationSource', 'locationSetBy', 'locationSetAt']) if (old[k] !== undefined) p[k] = old[k];
  }
  props.push(p);
  pmByProp.set(num, col(r, 'property manager email').split(/[;,]/).map(email).filter(Boolean));
}
props.sort((a, b) => a.propertyNumber.localeCompare(b.propertyNumber));

// ---- users
const listed = await rows(userFile);
const assigned = new Map();
const known = new Set(listed.map((u) => email(col(u, 'email'))).concat(extra.map((u) => email(u.email))));
for (const [num, list] of pmByProp) for (const e of list) if (known.has(e)) assigned.set(e, [...(assigned.get(e) || []), num]);
const idFor = (e) => (oldUsers.get(e) && oldUsers.get(e).id) || `u-${crypto.createHash('sha1').update(e).digest('hex').slice(0, 12)}`;
const yes = (v) => !/^(no|false|0)$/i.test(String(v || 'yes'));
const users = [];
let leftOut = 0;
for (const r of listed) {
  const e = email(col(r, 'email'));
  if (!e) continue;
  const isAdmin = admins.has(e);
  const mine = (assigned.get(e) || []).sort();
  if (!isAdmin && !mine.length) { leftOut += 1; continue; }
  users.push({
    id: idFor(e), firstName: col(r, 'first name'), lastName: col(r, 'last name'), email: e, phone: col(r, 'mobile', 'phone'),
    role: isAdmin ? 'Admin' : 'Property Manager', title: col(r, 'role', 'title'), status: col(r, 'status') || 'Active',
    emailNotifications: yes(col(r, 'email notification')), pushNotifications: yes(col(r, 'push notification')), recentProperty: '', properties: mine,
  });
}
for (const x of extra) {
  const e = email(x.email);
  if (users.some((u) => u.email === e)) continue;
  users.push({ ...x, email: e, role: admins.has(e) ? 'Admin' : (x.role || 'Property Manager'), properties: (assigned.get(e) || []).sort(), recentProperty: '', emailNotifications: true, pushNotifications: true });
}

fs.writeFileSync(path.join(dataDir, 'properties.json'), JSON.stringify(props, null, 1));
fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify(users, null, 1));
fs.writeFileSync(path.join(appData, 'seedAssets.json'), JSON.stringify(props.map((p) => ({ ...p, id: p.propertyNumber }))));
fs.writeFileSync(path.join(appData, 'seedUsers.json'), JSON.stringify(users, null, 1));
const withPm = new Set(users.flatMap((u) => u.properties));
console.log(`Properties: ${props.length} kept (${skippedCountry} outside ${country}, ${skippedAddress} without a street address); ${withPm.size} have a Property Manager; ${props.filter((p) => p.latitude == null).length} without a location yet (saved on site in the app).`);
console.log(`Users: ${users.length} kept (${users.filter((u) => u.role === 'Admin').length} Admins); ${leftOut} left out with no property in ${country}.`);

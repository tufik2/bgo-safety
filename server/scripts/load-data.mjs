// Loads users (with their property assignments) and properties from server/data/*.json into DynamoDB.
//   AWS_REGION=ca-central-1 node scripts/load-data.mjs --table bgo-safety-prod [--dry-run]
// Uses your AWS CLI credentials. Safe to re-run. The files win for property teams (assignments);
// the app wins for roles (someone an Admin promoted stays Admin) and each user's last visited property.
// Users missing from the file are deactivated and properties missing from it are hidden.
// Property locations saved on site in the app are kept (unless the property's address changed).
// To produce the files from the client's spreadsheets: node scripts/import-lists.mjs (see that file).
import { loadSeed, mergeProperty } from './seed-lib.mjs';
import { createDynamoRepo } from '../src/repo-dynamo.mjs';

const args = process.argv.slice(2);
const table = args[args.indexOf('--table') + 1];
const dry = args.includes('--dry-run');
if (!table || args.indexOf('--table') < 0) { console.error('Usage: node scripts/load-data.mjs --table <TableName> [--dry-run]'); process.exit(1); }

const { users, properties } = loadSeed();
const problems = [];
const seen = new Map();
for (const u of users) {
  if (!u.email && !u.phone) problems.push(`${u.firstName} ${u.lastName}: no email or mobile`);
  for (const k of [u.email && `email ${u.email}`, u.phone && `phone ${u.phone}`].filter(Boolean)) {
    if (seen.has(k)) problems.push(`${k} used by both ${seen.get(k)} and ${u.id}`); else seen.set(k, u.id);
  }
}
const known = new Set(properties.map((p) => p.propertyNumber));
for (const u of users) for (const p of u.properties) if (!known.has(p)) problems.push(`${u.email}: unknown property ${p}`);
const noPos = properties.filter((p) => p.latitude == null).length;
if (noPos) console.log(`Note: ${noPos} properties have no location yet; Property Managers save it on site in the app.`);
console.log(`${users.length} users, ${properties.length} properties`);
if (problems.length) { console.log('Problems:\n  ' + problems.join('\n  ')); process.exit(1); }
if (dry) { console.log('Dry run: nothing written.'); process.exit(0); }

const repo = createDynamoRepo(table);
// Properties: the file's list is current; ones no longer in it are hidden (kept for their history)
const inFile = new Set(properties.map((p) => p.propertyNumber));
const existing = new Map((await repo.listProperties()).map((p) => [p.propertyNumber, p]));
const gone = [...existing.values()].filter((p) => !inFile.has(p.propertyNumber) && p.status !== 'Inactive');
await repo.putProperties([
  ...properties.map((p) => ({ ...mergeProperty(existing.get(p.propertyNumber), p), status: 'Active' })), // keeps on-site locations
  ...gone.map((p) => ({ ...p, status: 'Inactive' })),
]);
// Users: matched by email; people no longer in the file are deactivated (they can't sign in, their work stays)
const byEmail = new Map((await repo.listUsers()).map((u) => [u.email, u]));
for (const u of users) {
  const prev = byEmail.get(u.email);
  await repo.putUser({ ...u, id: prev ? prev.id : u.id, role: prev ? prev.role : u.role, recentProperty: prev ? prev.recentProperty || '' : u.recentProperty });
}
const fileEmails = new Set(users.map((u) => u.email));
const fileIds = new Set(users.map((u) => u.id));
let deactivated = 0;
for (const u of byEmail.values()) {
  if (fileEmails.has(u.email) || fileIds.has(u.id) || u.status !== 'Active') continue; // same person, new email: already updated above
  await repo.putUser({ ...u, status: 'Inactive' }); deactivated += 1;
}
console.log(`Done: ${properties.length} properties (${gone.length} hidden), ${users.length} users (${deactivated} deactivated).`);

// Loads the property and user lists bundled with the API (server/data/*.json) the first time the
// API runs after a deploy, so a fresh stack is ready to use without running load-data.mjs.
// Runs once per stack (a marker record in the table makes sure only one container does it).
// Later list updates: edit server/data and run scripts/load-data.mjs (or redeploy after deleting the
// META/lists-loaded record).
import { loadSeed, mergeProperty } from '../scripts/seed-lib.mjs';
import { nowIso } from './util.mjs';

const MARK = 'lists-loaded';
let done = false;

export async function ensureListsLoaded(db) {
  if (done) return;
  const mark = await db.getMeta(MARK);
  if (mark && mark.status === 'done') { done = true; return; }
  if (mark && mark.status === 'loading' && Date.parse(mark.at) > Date.now() - 2 * 60e3) return; // another container is on it
  if (!mark && !(await db.claimMeta(MARK, { status: 'loading', at: nowIso() }))) return;
  if (mark) await db.putMeta(MARK, { status: 'loading', at: nowIso() }); // retry after a stalled attempt

  const { users, properties } = loadSeed();
  const existingProps = new Map((await db.listProperties()).map((p) => [p.propertyNumber, p]));
  await db.putProperties(properties.map((p) => ({ ...mergeProperty(existingProps.get(p.propertyNumber), p), status: 'Active' })));
  const byEmail = new Map((await db.listUsers()).map((u) => [u.email, u]));
  for (const u of users) {
    const prev = byEmail.get(u.email); // e.g. someone who already signed in through first-user setup
    await db.putUser({ ...u, id: prev ? prev.id : u.id, role: prev && prev.role === 'Admin' ? 'Admin' : u.role, recentProperty: prev ? prev.recentProperty || '' : '' });
  }
  await db.putMeta(MARK, { status: 'done', at: nowIso(), users: users.length, properties: properties.length });
  console.log(JSON.stringify({ event: 'lists_loaded', users: users.length, properties: properties.length }));
  done = true;
}
export const __resetSeedForTests = () => { done = false; };

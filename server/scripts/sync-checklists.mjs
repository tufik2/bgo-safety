// Copies the app's checklist definitions into server/checklists/ so the API can print them in PDF reports.
// Run after changing any checklist (npm run sync-checklists), then sam build && sam deploy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(root, '..', 'src', 'data', 'checklists');
const to = path.join(root, 'checklists');
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(from).filter((f) => f.endsWith('.json'))) {
  fs.copyFileSync(path.join(from, f), path.join(to, f));
  console.log('copied', f);
}

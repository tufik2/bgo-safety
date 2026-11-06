// POC only: creates plausible past-year inspections for every property so the
// "review previous years / copy answers" workflow can be demonstrated.
import { activeFollowUps, isVisible } from './logic';

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const PEOPLE = [{ id: 'u48', name: 'Jessa Molyneux' }, { id: 'u14', name: 'Caroline PM' }, { id: 'u134', name: 'William Ren' }];
const NOTES = ['Reviewed with building operator; control in place.', 'Signage posted and area checked.', 'Contractor scheduled; temporary control in place.', 'Monitoring monthly.'];
const sig = (r) => {
  let d = `M${20 + r() * 20} ${70 + r() * 20}`;
  for (let i = 1; i < 9; i++) d += ` L${30 + i * 22} ${50 + r() * 50}`;
  return { paths: [d], width: 300, height: 140 };
};

function pickAnswer(q, r) {
  const bad = new Set((q.correctiveActions || []).filter((a) => a.nonCompliant).map((a) => a.answer));
  const risky = new Set((q.weights || []).filter((w) => w.weight > 0).map((w) => w.answer));
  const x = r();
  if (bad.size) {
    const good = q.answers.filter((a) => a !== 'na' && !bad.has(a));
    if (x < 0.1 && bad.size) return [...bad][0];
    if (x < 0.15 && q.answers.includes('na')) return 'na';
    return good[0] || q.answers[0];
  }
  if (risky.size) {
    const safe = q.answers.filter((a) => a !== 'na' && !risky.has(a));
    return x < 0.2 ? [...risky][0] : safe[0] || q.answers[0];
  }
  return q.answers[Math.floor(x * Math.min(2, q.answers.length))];
}

export function demoInspection(checklist, propertyNumber, year) {
  const r = rng(`${checklist.id}|${propertyNumber}|${year}`);
  const answers = {};
  for (const c of checklist.categories) {
    for (const q of c.questions) {
      if (!isVisible(checklist, q, answers)) continue;
      const answer = q.answers.length ? pickAnswer(q, r) : null;
      const followUps = {};
      const person = PEOPLE[Math.floor(r() * PEOPLE.length)];
      for (const f of activeFollowUps(q, answer)) {
        if (f.type === 'heading') { if (f.required) followUps[f.id] = true; continue; }
        if (f.type === 'signature') followUps[f.id] = sig(r);
        else if (f.type === 'numeric') followUps[f.id] = /year/i.test(f.title) ? String(1975 + Math.floor(r() * 40)) : String(20000 + Math.floor(r() * 180) * 1000);
        else if (f.type === 'text') followUps[f.id] = /date/i.test(f.title) ? `${year}-${String(2 + Math.floor(r() * 9)).padStart(2, '0')}-${String(1 + Math.floor(r() * 27)).padStart(2, '0')}`
          : /name/i.test(f.title) ? person.name : /type/i.test(f.title) ? 'Office' : 'See notes';
        else followUps[f.id] = NOTES[Math.floor(r() * NOTES.length)];
      }
      answers[q.id] = { answer, followUps, note: '', photos: [] };
    }
  }
  const by = PEOPLE[Math.floor(r() * PEOPLE.length)];
  const month = 3 + Math.floor(r() * 7), day = 2 + Math.floor(r() * 25);
  const at = new Date(Date.UTC(Number(year), month, day, 15)).toISOString();
  return {
    id: `demo-${checklist.id.slice(0, 8)}-${propertyNumber}-${year}`, demo: true,
    checklistId: checklist.id, propertyNumber, period: String(year),
    status: 'approved', startedAt: at, startedBy: by, submittedAt: at, submittedBy: by,
    approvedAt: at, approvedBy: { id: 'u134', name: 'William Ren' }, answers,
  };
}

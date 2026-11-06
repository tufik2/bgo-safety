// Rules for answering a checklist, derived from the imported questionnaire.

export const ANSWER_LABEL = { yes: 'Yes', no: 'No', na: 'N/A' };

// Display name for follow-up fields ("Hazards Controls" -> "Hazard control")
export function followUpLabel(f) {
  if (/^hazards?\s+controls?$/i.test(f.title || '')) return 'Hazard control';
  return f.title || 'Details';
}

// ---- Dependencies: a question shows only when every question it depends on
// is itself visible and has the required answer.
const indexCache = new WeakMap();
function questionIndex(checklist) {
  let m = indexCache.get(checklist);
  if (!m) {
    m = new Map();
    for (const c of checklist.categories) for (const q of c.questions) m.set(q.id, q);
    indexCache.set(checklist, m);
  }
  return m;
}
export function isVisible(checklist, q, answers, depth = 0) {
  if (!q.showWhen || !q.showWhen.length) return true;
  if (depth > 20) return false;
  const idx = questionIndex(checklist);
  return q.showWhen.every((d) => {
    const parent = idx.get(d.questionId);
    const a = answers[d.questionId];
    return parent && a && a.answer === d.answer && isVisible(checklist, parent, answers, depth + 1);
  });
}
export const visibleQuestions = (checklist, cat, answers) => cat.questions.filter((q) => isVisible(checklist, q, answers));

// Follow-up fields that apply for the current answer
export function activeFollowUps(q, answer) {
  return (q.followUps || []).filter((f) => f.requiredWhen === 'always' || (answer && f.requiredWhen === answer));
}

// Corrective action configured for this answer (non-compliant answers only)
export function correctiveFor(q, answer) {
  if (!answer) return null;
  return (q.correctiveActions || []).find((a) => a.answer === answer && a.nonCompliant) || null;
}

// 'compliant' | 'noncompliant' | 'na' | 'answered' | null
// 'answered' = the source questionnaire defines no non-compliant answer for this question,
// so the app can't say whether the answer is good or bad.
export function verdict(q, answer) {
  if (!answer) return null;
  if (answer === 'na') return 'na';
  if (!(q.correctiveActions || []).some((a) => a.nonCompliant)) return 'answered';
  return correctiveFor(q, answer) ? 'noncompliant' : 'compliant';
}

const filled = (v) => {
  if (v === true) return true; // confirmed heading
  if (v && typeof v === 'object') return (v.paths || []).length > 0; // signature
  return !!String(v == null ? '' : v).trim();
};

// What's still missing for one question
export function questionIssues(q, a) {
  const issues = [];
  const answer = a && a.answer;
  if (q.answers.length && q.required && !answer) issues.push('answer');
  for (const f of activeFollowUps(q, answer)) {
    if (f.required && !filled(a && a.followUps && a.followUps[f.id])) issues.push(f.id);
  }
  return issues;
}

export function sectionStats(checklist, cat, answers) {
  let answered = 0, answerable = 0, issues = 0, noncompliant = 0;
  for (const q of visibleQuestions(checklist, cat, answers)) {
    const a = answers[q.id];
    if (q.answers.length) { answerable += 1; if (a && a.answer) answered += 1; }
    issues += questionIssues(q, a).length ? 1 : 0;
    if (verdict(q, a && a.answer) === 'noncompliant') noncompliant += 1;
  }
  return { answered, answerable, issues, noncompliant, complete: issues === 0 };
}

export function inspectionStats(checklist, answers) {
  const t = { answered: 0, answerable: 0, issues: 0, noncompliant: 0 };
  for (const c of checklist.categories) {
    const s = sectionStats(checklist, c, answers);
    t.answered += s.answered; t.answerable += s.answerable; t.issues += s.issues; t.noncompliant += s.noncompliant;
  }
  return { ...t, complete: t.issues === 0 };
}

export function dueDate(fromIso, due) {
  if (!due) return null;
  const d = new Date(fromIso);
  const n = due.amount;
  if (due.unit.startsWith('day')) d.setDate(d.getDate() + n);
  else if (due.unit.startsWith('week')) d.setDate(d.getDate() + 7 * n);
  else if (due.unit.startsWith('month')) d.setMonth(d.getMonth() + n);
  return d;
}

export const dueText = (due) => (due ? `${due.amount} ${due.amount === 1 ? due.unit.replace(/s$/, '') : due.unit}` : null);

export function correctiveList(checklist, answers, fromIso) {
  const out = [];
  for (const c of checklist.categories) {
    for (const q of visibleQuestions(checklist, c, answers)) {
      const a = answers[q.id];
      const ca = correctiveFor(q, a && a.answer);
      if (ca) out.push({ category: c, question: q, action: ca, due: dueDate(fromIso, ca.due), answer: a });
    }
  }
  return out;
}

export const fmtDate = (d) => new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });

// Weighted score (e.g. "Risk Score") from the answers given; null if the checklist has no weights
export function weightedScore(checklist, answers) {
  let title = null, score = 0;
  for (const c of checklist.categories) {
    for (const q of visibleQuestions(checklist, c, answers)) {
      for (const w of q.weights || []) {
        title = title || w.title;
        const a = answers[q.id];
        if (a && a.answer === w.answer) score += w.weight;
      }
    }
  }
  return title ? { title, score } : null;
}

// Keep only answers to questions that are showing (drops answers hidden by later changes)
export function visibleAnswers(checklist, answers) {
  const out = {};
  for (const c of checklist.categories) for (const q of visibleQuestions(checklist, c, answers)) if (answers[q.id]) out[q.id] = answers[q.id];
  return out;
}

/* ---------------- Periods (annual surveys) ---------------- */
export const currentPeriod = () => String(new Date().getFullYear());
export const periodOf = (ins) => String(ins.period || new Date(ins.startedAt).getFullYear());

export const STATUS_LABEL = { draft: 'In progress', submitted: 'Submitted', approved: 'Submitted' };
export const statusLabel = (ins) => (ins.pendingSync && ins.status !== 'draft' ? 'Submitted, waiting to upload' : STATUS_LABEL[ins.status] || ins.status);

/* ---------------- Copying answers from a previous period ---------------- */
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Map previous questions onto current ones: same id, else same label + title
// (so a new year's version of the questionnaire still matches).
function matchQuestions(checklist, prevChecklist) {
  const prevById = new Map(), prevByText = new Map();
  for (const c of prevChecklist.categories) for (const q of c.questions) {
    prevById.set(q.id, q);
    prevByText.set(norm(q.label) + '|' + norm(q.title), q);
  }
  const m = new Map();
  for (const c of checklist.categories) for (const q of c.questions) {
    const p = prevById.get(q.id) || prevByText.get(norm(q.label) + '|' + norm(q.title));
    if (p) m.set(q.id, p);
  }
  return m;
}

// Copies answers, text follow-ups and notes (not signatures or photos — those
// must be redone each year). Copied answers are flagged for review.
export function copyAnswers({ checklist, prevChecklist, prev, into, onlyUnanswered }) {
  const map = matchQuestions(checklist, prevChecklist || checklist);
  const out = { ...into };
  let count = 0;
  for (const [qid, pq] of map) {
    const src = prev.answers[pq.id];
    if (!src) continue;
    if (onlyUnanswered && out[qid] && out[qid].answer) continue;
    const q = questionIndexPublic(checklist).get(qid);
    if (q.answers.length && (!src.answer || !q.answers.includes(src.answer))) continue;
    const followUps = {};
    for (const f of q.followUps) {
      const pf = pq.followUps.find((x) => x.id === f.id) || pq.followUps.find((x) => norm(x.title) === norm(f.title) && x.type === f.type);
      const v = pf && src.followUps && src.followUps[pf.id];
      if (v != null && f.type !== 'signature') followUps[f.id] = v;
    }
    if (!q.answers.length && !Object.keys(followUps).length) continue;
    out[qid] = { answer: src.answer || null, followUps, note: src.note || '', photos: [], copiedFrom: periodOf(prev) };
    count += 1;
  }
  return { answers: out, count };
}
export const questionIndexPublic = (checklist) => questionIndex(checklist);

export function copiedCount(checklist, answers) {
  let n = 0;
  for (const c of checklist.categories) for (const q of visibleQuestions(checklist, c, answers)) if (answers[q.id] && answers[q.id].copiedFrom) n += 1;
  return n;
}

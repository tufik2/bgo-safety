// Builds the PDF report of a submitted survey / inspection / checklist and stores it in S3:
//   properties/<property>/reports/<checklist id>-<year>.pdf
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { getObject, putObject } from './uploads.mjs';

/* ---------- checklist definitions (copied from the app: npm run sync-checklists) ---------- */
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'checklists');
let checklists = null;
export function findChecklist(id) {
  if (!checklists) {
    checklists = new Map();
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')) : []) {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      checklists.set(c.id, c);
    }
  }
  return checklists.get(id) || null;
}

/* ---------- the same rules the app uses ---------- */
function index(cl) { const m = new Map(); for (const c of cl.categories) for (const q of c.questions) m.set(q.id, q); return m; }
function visible(cl, idx, q, answers, depth = 0) {
  if (!q.showWhen || !q.showWhen.length) return true;
  if (depth > 20) return false;
  return q.showWhen.every((d) => { const p = idx.get(d.questionId); const a = answers[d.questionId]; return p && a && a.answer === d.answer && visible(cl, idx, p, answers, depth + 1); });
}
const activeFollowUps = (q, ans) => (q.followUps || []).filter((f) => f.requiredWhen === 'always' || (ans && f.requiredWhen === ans));
const corrective = (q, ans) => ans && (q.correctiveActions || []).find((a) => a.answer === ans && a.nonCompliant);
function verdict(q, ans) {
  if (!ans) return null;
  if (ans === 'na') return 'na';
  if (!(q.correctiveActions || []).some((a) => a.nonCompliant)) return 'answered';
  return corrective(q, ans) ? 'noncompliant' : 'compliant';
}
function dueDate(fromIso, due) {
  if (!due) return null;
  const d = new Date(fromIso);
  if (due.unit.startsWith('day')) d.setDate(d.getDate() + due.amount);
  else if (due.unit.startsWith('week')) d.setDate(d.getDate() + 7 * due.amount);
  else if (due.unit.startsWith('month')) d.setMonth(d.getMonth() + due.amount);
  return d;
}
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Toronto' }) : '');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Toronto' }) : '');
const LABEL = { yes: 'Yes', no: 'No', na: 'N/A' };

/* ---------- drawing helpers ---------- */
const INK = rgb(0.11, 0.15, 0.19), MUTED = rgb(0.36, 0.41, 0.45), LINE = rgb(0.83, 0.86, 0.88);
const GOOD = rgb(0, 0.5, 0.29), BAD = rgb(0.78, 0.06, 0.18), NA = rgb(0.29, 0.35, 0.4), BLUE = rgb(0.02, 0.36, 1);
const PAGE = { w: 612, h: 792, m: 48 }; // US Letter, 0.67 in margins

// Standard PDF fonts only cover Western European characters; replace anything else.
const clean = (s) => String(s == null ? '' : s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-')
  .replace(/\u2026/g, '...').replace(/\u00a0/g, ' ').replace(/[^\x0A\x20-\x7E\u00A1-\u00FF]/g, '?');

function wrap(text, font, size, width) {
  const out = [];
  for (const para of clean(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
      if (line) out.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > width) { // very long word
        let i = line.length; while (i > 1 && font.widthOfTextAtSize(line.slice(0, i), size) > width) i -= 1;
        out.push(line.slice(0, i)); line = line.slice(i);
      }
    }
    out.push(line);
  }
  return out;
}

class Writer {
  constructor(doc, fonts, footer) { this.doc = doc; this.f = fonts; this.footer = footer; this.newPage(); }
  newPage() { this.page = this.doc.addPage([PAGE.w, PAGE.h]); this.y = PAGE.h - PAGE.m; }
  ensure(h) { if (this.y - h < PAGE.m + 20) this.newPage(); }
  text(t, { size = 10, bold = false, color = INK, x = PAGE.m, width = PAGE.w - 2 * PAGE.m, gap = 3 } = {}) {
    const font = bold ? this.f.bold : this.f.reg;
    for (const line of wrap(t, font, size, width)) {
      this.ensure(size + gap);
      this.page.drawText(line, { x, y: this.y - size, size, font, color });
      this.y -= size + gap;
    }
  }
  space(h) { this.y -= h; }
  rule() { this.ensure(8); this.page.drawLine({ start: { x: PAGE.m, y: this.y }, end: { x: PAGE.w - PAGE.m, y: this.y }, thickness: 0.6, color: LINE }); this.y -= 8; }
}

/* ---------- report ---------- */
export async function buildSurveyPdf({ survey, property }) {
  const cl = findChecklist(survey.checklistId);
  if (!cl) throw new Error(`Unknown checklist ${survey.checklistId} (run npm run sync-checklists)`);
  const answers = survey.answers || {};
  const idx = index(cl);
  const doc = await PDFDocument.create();
  doc.setTitle(`${cl.title} - ${survey.propertyNumber} - ${survey.period}`);
  doc.setAuthor('BGO Safety');
  const fonts = { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(doc, fonts);

  // Header
  w.text('BGO Safety', { size: 10, bold: true, color: BLUE });
  w.text(cl.title, { size: 20, bold: true, gap: 6 });
  w.text(`${survey.propertyNumber}${property && property.name ? ` - ${property.name}` : ''}`, { size: 12, bold: true });
  if (property) w.text([property.address, property.city, property.province].filter(Boolean).join(', '), { size: 10, color: MUTED });
  w.space(6);
  w.text(`${survey.period} survey  |  Submitted ${fmtDateTime(survey.submittedAt)} by ${survey.submittedBy ? survey.submittedBy.name : ''}`, { size: 10 });
  w.text(`Started ${fmtDateTime(survey.startedAt)} by ${survey.startedBy ? survey.startedBy.name : ''}`, { size: 9, color: MUTED });
  w.space(4); w.rule();

  // Summary
  const counts = { compliant: 0, noncompliant: 0, na: 0, answered: 0 };
  const actions = [];
  let score = null;
  for (const c of cl.categories) for (const q of c.questions) {
    if (!visible(cl, idx, q, answers)) continue;
    const a = answers[q.id]; const ans = a && a.answer;
    const v = verdict(q, ans); if (v) counts[v] += 1;
    const ca = corrective(q, ans); if (ca) actions.push({ c, q, ca, due: dueDate(survey.submittedAt, ca.due) });
    for (const wt of q.weights || []) { score = score || { title: wt.title, value: 0 }; if (ans === wt.answer) score.value += wt.weight; }
  }
  const parts = [];
  if (cl.categories.some((c) => c.questions.some((q) => (q.correctiveActions || []).some((x) => x.nonCompliant)))) parts.push(`Compliant: ${counts.compliant}`, `Non-compliant: ${counts.noncompliant}`);
  if (counts.answered) parts.push(`Answered: ${counts.answered}`);
  parts.push(`N/A: ${counts.na}`);
  if (score) parts.push(`${score.title}: ${score.value}`);
  w.text('Summary', { size: 13, bold: true, gap: 5 });
  w.text(parts.join('    '), { size: 11 });
  w.space(6);

  if (actions.length) {
    w.text(`Corrective actions (${actions.length})`, { size: 13, bold: true, gap: 5 });
    for (const { c, q, ca, due } of actions) {
      w.ensure(40);
      w.text(`- ${ca.taskTitle || 'Follow up on this item'}${due ? `  (due ${fmtDate(due)})` : ''}`, { size: 10, bold: true, color: BAD });
      w.text(`${c.title}: ${q.title}`, { size: 9, color: MUTED, x: PAGE.m + 10, width: PAGE.w - 2 * PAGE.m - 10 });
      w.space(2);
    }
    w.space(4);
  }
  w.rule();

  // Answers by section
  let n = 0;
  for (const c of cl.categories) {
    const qs = c.questions.filter((q) => visible(cl, idx, q, answers));
    if (!qs.length) continue;
    w.ensure(60);
    w.space(4);
    w.text(c.title, { size: 14, bold: true, gap: 6 });
    let i = 0;
    for (const q of qs) {
      i += 1; n += 1;
      const a = answers[q.id] || {};
      const ans = a.answer;
      w.ensure(36);
      if (q.label) w.text(q.label, { size: 8, color: MUTED, gap: 2 });
      if (q.answers && q.answers.length) {
        const v = verdict(q, ans);
        const color = v === 'compliant' ? GOOD : v === 'noncompliant' ? BAD : v === 'na' ? NA : INK;
        w.text(`${q.label ? '' : `${i}. `}${q.title}`, { size: 10, bold: true, width: PAGE.w - 2 * PAGE.m - 70 });
        // answer at the right of the question's last line
        w.page.drawText(ans ? LABEL[ans] : 'Not answered', { x: PAGE.w - PAGE.m - 60, y: w.y + 3, size: 10, font: fonts.bold, color: ans ? color : MUTED });
      } else {
        w.text(q.title, { size: 11, bold: true });
      }
      for (const f of activeFollowUps(q, ans)) {
        const val = a.followUps && a.followUps[f.id];
        if (f.type === 'heading') { if (f.required) w.text(`${val === true ? '[x] Confirmed' : '[ ] Not confirmed'}: ${f.title}`, { size: 9, color: MUTED, x: PAGE.m + 10, width: PAGE.w - 2 * PAGE.m - 10 }); continue; }
        if (f.type === 'signature') {
          w.text(f.title, { size: 9, color: MUTED, x: PAGE.m + 10 });
          if (val && val.paths && val.paths.length) {
            const scale = Math.min(1, 240 / (val.width || 300)), h = (val.height || 140) * scale;
            w.ensure(h + 6);
            for (const p of val.paths) w.page.drawSvgPath(p, { x: PAGE.m + 10, y: w.y, scale, borderColor: INK, borderWidth: 1.6 / scale });
            w.page.drawLine({ start: { x: PAGE.m + 10, y: w.y - h }, end: { x: PAGE.m + 250, y: w.y - h }, thickness: 0.5, color: LINE });
            w.y -= h + 6;
          } else w.text('Not signed', { size: 10, x: PAGE.m + 10 });
          continue;
        }
        if (val != null && String(val).trim()) w.text(`${f.title}: ${val}`, { size: 9.5, x: PAGE.m + 10, width: PAGE.w - 2 * PAGE.m - 10 });
      }
      if (a.note) w.text(`Note: ${a.note}`, { size: 9.5, x: PAGE.m + 10, width: PAGE.w - 2 * PAGE.m - 10 });
      if (a.copiedUnreviewed) w.text(`Copied from ${a.copiedFrom || 'an earlier year'} and not reviewed before submitting`, { size: 8.5, color: MUTED, x: PAGE.m + 10 });
      const photos = (a.photos || []).filter((p) => p.key && /\.(jpe?g|png)$/i.test(p.key)).slice(0, 3);
      if (photos.length) {
        const imgs = [];
        for (const p of photos) {
          const buf = await getObject(p.key).catch(() => null);
          if (!buf) continue;
          try { imgs.push(/\.png$/i.test(p.key) ? await doc.embedPng(buf) : await doc.embedJpg(buf)); } catch { /* skip unreadable image */ }
        }
        if (imgs.length) {
          const box = 150;
          w.ensure(box + 8);
          imgs.forEach((img, k) => {
            const s = Math.min(box / img.width, box / img.height);
            w.page.drawImage(img, { x: PAGE.m + 10 + k * (box + 10), y: w.y - img.height * s, width: img.width * s, height: img.height * s });
          });
          w.y -= box + 8;
        }
      }
      w.space(5);
    }
  }

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((p, k) => {
    p.drawText(clean(`${cl.title} - ${survey.propertyNumber} - ${survey.period}`), { x: PAGE.m, y: 24, size: 8, font: fonts.reg, color: MUTED });
    p.drawText(`Page ${k + 1} of ${pages.length}`, { x: PAGE.w - PAGE.m - 60, y: 24, size: 8, font: fonts.reg, color: MUTED });
  });
  return doc.save();
}

export const reportKey = (s) => `properties/${s.propertyNumber}/reports/${s.checklistId}-${s.period}.pdf`;

// Builds and stores the report. -> key
export async function storeSurveyPdf(survey, property) {
  const bytes = await buildSurveyPdf({ survey, property });
  const key = reportKey(survey);
  await putObject(key, bytes, 'application/pdf');
  return key;
}

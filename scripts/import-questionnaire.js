#!/usr/bin/env node
// Converts a Refined Risk questionnaire XML export into the JSON the app uses.
//
//   node scripts/import-questionnaire.js <export.xml> <output.json> [--module fire]
//
// Mapping
//   Questionnaire            -> checklist {id, title, group, module, approvalRequired, show*Icon}
//   questionnaire_category   -> categories[] {id, sequence, title, location}
//   category_question        -> questions[] {id, sequence, title, instructions, required,
//                                answers: ['yes','no','na'] | [] (answer not required)}
//   question_option          -> followUps[] {id, type: comments|text|numeric|signature|heading, title,
//                                requiredWhen: 'yes'|'no'|'na'|'always', required, link?}
//                                (heading = instruction text; link = BORiS menu it points to)
//   dependsOn                -> showWhen[] {questionId, answer}  (all must match)
//   questionWeightings       -> weights[] {answer, weight, title}  (e.g. Risk Score)
//   FRENCH titles            -> titleFr / labelFr / instructionsFr where provided
//   questionnaireCorrectiveAction -> correctiveActions[] {answer, nonCompliant, taskTitle,
//                                due: {amount, unit}, createTask, assignedTo[], taskTypes[]}
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

const [, , input, output, ...rest] = process.argv;
if (!input || !output) {
  console.error('Usage: node scripts/import-questionnaire.js <export.xml> <output.json> [--module fire]');
  process.exit(1);
}
const moduleKey = rest.includes('--module') ? rest[rest.indexOf('--module') + 1] : 'fire';

const ARRAYS = new Set(['questionnaire_category', 'category_question', 'question_option', 'questionTitle',
  'categoryTitle', 'questionOptionTitle', 'questionnaireCorrectiveAction', 'questionnaireTitle', 'dependency',
  'question_weighting', 'option_weighting']);
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, isArray: (n) => ARRAYS.has(n) });
const q = parser.parse(fs.readFileSync(input, 'utf8')).Questionnaire;

const nul = (v) => (v === undefined || v === null || v === '' || v === 'null' ? null : String(v).trim());
const bool = (v) => nul(v) === 'true';
const english = (list) => (list || []).find((t) => t.language === 'ENGLISH') || (list || [])[0] || {};
const french = (list) => (list || []).find((t) => t.language === 'FRENCH') || {};
const link = (v) => {
  try { const m = JSON.parse(nul(v) || 'null'); return m && m.label ? { label: m.label, parent: m.parentMenu || null, path: m.menuLocation || null } : null; } catch { return null; }
};
const json = (v) => { try { return JSON.parse(nul(v) || '[]'); } catch { return []; } };
const answerKey = (v) => ({ true: 'yes', false: 'no', na: 'na', anr: 'always' }[nul(v)] || null);
// Strip simple HTML from instructions
const plain = (v) => (nul(v) || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+\n/g, '\n').trim() || null;

function validAnswers(v) {
  const raw = (nul(v) || '').replace(/"/g, '').split('::').filter(Boolean);
  return raw.map((a) => ({ true: 'yes', false: 'no', na: 'na' }[a])).filter(Boolean); // 'anr' -> no answer buttons
}

const bySeq = (a, b) => Number(a.sequence) - Number(b.sequence);

const checklist = {
  id: nul(q.uuid),
  module: moduleKey,
  title: nul(english(q.questionnaireTitles && q.questionnaireTitles.questionnaireTitle).title) || nul(q.questionnaireName),
  group: nul(q.group && q.group.title),
  sourceModule: nul(q.group && q.group.module),
  level: nul(q.group && q.group.questionnaireLevel),
  year: nul(q.year),
  approvalRequired: bool(q.approvalRequired),
  showPhotosIcon: bool(q.showPhotosIcon),
  showAttachmentIcon: bool(q.showAttachmentIcon),
  showCommentIcon: bool(q.showCommentIcon),
  importedFrom: path.basename(input),
  categories: (q.categories.questionnaire_category || []).sort(bySeq).map((qc) => ({
    id: nul(qc.uuid),
    sequence: Number(qc.sequence),
    title: nul(english(qc.category.categoryTitles && qc.category.categoryTitles.categoryTitle).title),
    titleFr: nul(french(qc.category.categoryTitles && qc.category.categoryTitles.categoryTitle).title),
    location: nul(qc.questionnaireCategoryLocation),
    questions: ((qc.questions && qc.questions.category_question) || []).sort(bySeq).map((cq) => {
      const t = english(cq.question.questionTitles && cq.question.questionTitles.questionTitle);
      const fr = french(cq.question.questionTitles && cq.question.questionTitles.questionTitle);
      const cas = (cq.questionnaireCorrectiveActionList && cq.questionnaireCorrectiveActionList.questionnaireCorrectiveAction) || [];
      return {
        id: nul(cq.uuid),
        sequence: Number(cq.sequence),
        title: nul(t.title),
        label: nul(t.label),
        instructions: plain(t.commentsAndInstructions),
        titleFr: nul(fr.title),
        labelFr: nul(fr.label),
        instructionsFr: plain(fr.commentsAndInstructions),
        showWhen: ((cq.dependsOn && cq.dependsOn.dependency) || []).map((d) => ({ questionId: nul(d.questionUUID), answer: answerKey(d.requiredAnswerValue) })),
        weights: ((cq.questionWeightings && cq.questionWeightings.question_weighting) || []).map((w) => ({
          answer: answerKey(w.requiredQuestionValue), weight: Number(w.weight), title: nul(w.weighting && w.weighting.title) || 'Score',
        })),
        required: bool(cq.question_required),
        answers: validAnswers(cq.validAnswer),
        followUps: ((cq.options && cq.options.question_option) || []).sort(bySeq).map((o) => ({
          id: nul(o.uuid),
          type: nul(o.option.type),
          title: nul(english(o.option.questionOptionTitles && o.option.questionOptionTitles.questionOptionTitle).title) || nul(o.option.title),
          titleFr: nul(french(o.option.questionOptionTitles && o.option.questionOptionTitles.questionOptionTitle).title),
          link: link(o.option.jumpToMenuItem),
          requiredWhen: answerKey(o.requiredQuestionValue),
          required: bool(o.option_required),
        })),
        correctiveActions: cas.map((a) => ({
          answer: (nul(a.answer) || '').toLowerCase(),
          nonCompliant: bool(a.nonCompliant),
          taskTitle: nul(a.taskTitle),
          due: nul(a.dueDateAmount) ? { amount: Number(a.dueDateAmount), unit: (nul(a.dueDateUnit) || 'DAYS').toLowerCase() } : null,
          createTask: bool(a.shouldCreateTask),
          assignedTo: json(a.assignedTo).map((x) => x.name || `User ${x.userProfileID}`),
          taskTypes: json(a.taskTypes).map((x) => x.taskType),
        })),
      };
    }),
  })),
};

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(checklist, null, 1));
const nq = checklist.categories.reduce((n, c) => n + c.questions.length, 0);
console.log(`Imported "${checklist.title}": ${checklist.categories.length} categories, ${nq} questions -> ${output}`);

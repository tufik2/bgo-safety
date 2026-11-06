# Shared builder for app-authored checklists (same JSON format as imported Refined Risk questionnaires).
import json, uuid

NS = uuid.UUID('6f1b2c1e-7d0e-4e43-9a8b-2f6a3c9d5e10')  # stable ids: same text -> same id on re-run
uid = lambda *parts: str(uuid.uuid5(NS, '|'.join(parts)))
D = lambda n: {'amount': n, 'unit': 'days'}
W = lambda n: {'amount': n, 'unit': 'weeks'}
M = lambda n: {'amount': n, 'unit': 'months'}

def _question(cat, i, q, guide, task, due, extra, task_type):
    qid = uid(cat, q)
    fus = [{'id': uid(qid, 'details'), 'type': 'comments', 'title': 'Deficiency and action taken', 'requiredWhen': 'no', 'required': True},
           {'id': uid(qid, 'na'), 'type': 'comments', 'title': 'Reason not applicable', 'requiredWhen': 'na', 'required': False}]
    if extra == 'date':
        fus.insert(0, {'id': uid(qid, 'date'), 'type': 'text', 'title': 'Date of last review, test or exercise (YYYY-MM-DD)', 'requiredWhen': 'yes', 'required': True})
    return {'id': qid, 'sequence': i, 'title': q, 'label': None, 'instructions': guide or None, 'required': True,
            'answers': ['yes', 'no', 'na'], 'followUps': fus, 'showWhen': [], 'weights': [],
            'correctiveActions': [{'answer': 'no', 'nonCompliant': True, 'taskTitle': task, 'due': due, 'createTask': True,
                                   'assignedTo': ['Property Manager'], 'taskTypes': [task_type]}]}

def build(key, module, title, group, sections, out_file, source):
    """sections: [(section title, [(question, guidance, corrective task, due, extra or None), ...]), ...]
    Every question: Yes / No / N/A, 'No' is non-compliant. extra='date' asks the date of the last review/test when 'Yes'."""
    cats = []
    for ci, (st, qs) in enumerate(sections):
        cats.append({'id': uid('cat', st), 'sequence': ci, 'title': st, 'location': 'Other',
                     'questions': [_question(st, i, *q, group) for i, q in enumerate(qs)]})
    sign = 'Review and Approvals'
    cats.append({'id': uid(key, 'cat', sign), 'sequence': len(cats), 'title': sign, 'location': 'Other', 'questions': [{
        'id': uid(key, sign, 'assessors'), 'sequence': 0, 'title': 'Assessors', 'label': None, 'instructions': None, 'required': False,
        'answers': [], 'showWhen': [], 'weights': [], 'correctiveActions': [],
        'followUps': [
            {'id': uid(key, sign, 'a1n'), 'type': 'text', 'title': 'Assessor Name', 'requiredWhen': 'always', 'required': True},
            {'id': uid(key, sign, 'a1s'), 'type': 'signature', 'title': 'Signature of Assessor', 'requiredWhen': 'always', 'required': True},
            {'id': uid(key, sign, 'a2n'), 'type': 'text', 'title': 'Second Assessor Name', 'requiredWhen': 'always', 'required': False},
            {'id': uid(key, sign, 'a2s'), 'type': 'signature', 'title': 'Signature of Second Assessor', 'requiredWhen': 'always', 'required': False},
        ]}]})
    out = {'id': uid('checklist', key), 'module': module, 'title': title, 'group': group, 'sourceModule': None, 'level': 'Property',
           'year': '2026', 'approvalRequired': True, 'showPhotosIcon': True, 'showAttachmentIcon': False, 'showCommentIcon': True,
           'importedFrom': source, 'categories': cats}
    json.dump(out, open(out_file, 'w'), ensure_ascii=False, indent=1)
    print(f'{title}: {len(cats)-1} sections + sign-off, {sum(len(c["questions"]) for c in cats) - 1} questions')

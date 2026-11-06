// Checklists available under each dashboard tile. Add more imported
// questionnaires here (see scripts/import-questionnaire.js).
// period: 'year' = one inspection per property per calendar year.
import workplaceHazard from '../data/checklists/workplace-hazard-inspection.json';
import environmental from '../data/checklists/environmental.json';
import fireLifeSafety from '../data/checklists/fire-life-safety.json';
import emergencyPreparedness from '../data/checklists/emergency-preparedness.json';

export const MODULES = {
  fire: { title: 'Fire & life safety checklist', checklists: [fireLifeSafety], period: 'year' },
  emergency: { title: 'Emergency preparedness', checklists: [emergencyPreparedness], period: 'year' },
  health: { title: 'Health & safety survey', checklists: [workplaceHazard], period: 'year' },
  environmental: { title: 'Environmental survey', checklists: [environmental], period: 'year' },
};

// No approval step for now: surveys are final once submitted (overrides the imported setting)
for (const m of Object.values(MODULES)) m.checklists = m.checklists.map((c) => ({ ...c, approvalRequired: false }));

export const ALL_CHECKLISTS = Object.values(MODULES).flatMap((m) => m.checklists);
export const findChecklist = (id) => ALL_CHECKLISTS.find((c) => c.id === id);

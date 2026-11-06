// Incident reporting forms, modelled on the existing Refined Risk web forms
// (Accident Record and Near Miss). Field types:
//   auto, text, textarea, select, radio, date, time, checks, photos
// `half: true` puts two consecutive fields side by side.

export const PROVINCES = {
  Canada: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories',
    'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Québec', 'Saskatchewan', 'Yukon'],
  'United States of America': ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
    'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
    'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
    'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
    'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia',
    'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'],
};

const BODY_PARTS = ['Head', 'Face', 'Eye(s)', 'Ear(s)', 'Teeth', 'Neck', 'Chest', 'Upper Back', 'Lower Back', 'Abdomen', 'Stomach',
  'Pelvis', 'Left Ribs', 'Right Ribs', 'Left Shoulder', 'Right Shoulder', 'Left Arm', 'Right Arm', 'Left Elbow', 'Right Elbow',
  'Left Forearm', 'Right Forearm', 'Left Wrist', 'Right Wrist', 'Left Hand', 'Right Hand', 'Left Finger(s)', 'Right Finger(s)',
  'Left Hip', 'Right Hip', 'Left Thigh', 'Right Thigh', 'Left Knee', 'Right Knee', 'Left Lower Leg', 'Right Lower Leg',
  'Left Ankle', 'Right Ankle', 'Left Foot', 'Right Foot', 'Left Toe(s)', 'Right Toe(s)', 'Psychological'];

const ACCIDENT_TYPES = ['Animal Bite', 'Assault', 'Crush', 'Electrical', 'Fall', 'Fire/Explosion', 'Harmful Substances/Environmental',
  'Lifting', 'Motor Vehicle Incident', 'Other', 'Overexertion', 'Property Damage', 'Repetition', 'Sharp Edge', 'Slip/Trip',
  'Struck/Caught', 'Twist'];

// Options weren't visible in the screenshots — placeholders to confirm with BGO.
const SEVERITY = ['First aid only', 'Medical aid', 'Lost time', 'Gradual onset / occupational illness'];

const NEAR_MISS_FACTORS = ['Making safety devices inoperative', 'Using unsafe equipment/material unsafely', 'Unsafe loading/placing/mixing',
  'Taking unsafe position', 'Distraction/teasing/horseplay', 'Failure to use personal protective devices'];

export const FORMS = {
  accident: {
    key: 'accident',
    title: 'Accident Record',
    short: 'Accident / illness',
    numberPrefix: 'ACC',
    titleField: 'title',
    dateField: 'accidentDate',
    summaryField: 'type',
    sections: [
      { title: 'Identification', fields: [
        { id: 'number', type: 'auto', label: 'Accident Number' },
        { id: 'title', type: 'text', label: 'Accident Title', required: true, hint: 'Please do not include the name of the individual in the Accident Title.' },
        { id: 'firstName', type: 'text', label: 'First Name', half: true, autoCapitalize: 'words' },
        { id: 'lastName', type: 'text', label: 'Last Name', half: true, autoCapitalize: 'words' },
        { id: 'jobTitle', type: 'text', label: 'Job Title/Occupation' },
        { id: 'gender', type: 'radio', label: 'Gender', options: ['Male', 'Female'] },
      ] },
      { title: 'Employer Information', fields: [
        { id: 'employerName', type: 'text', label: 'Trade and Legal Name' },
        { id: 'mailingAddress', type: 'text', label: 'Mailing Address' },
        { id: 'country', type: 'select', label: 'Country', options: Object.keys(PROVINCES), clears: ['province'] },
        { id: 'province', type: 'select', label: 'Province / State', options: (v) => PROVINCES[v.country] || [], emptyHint: 'Choose a country first' },
        { id: 'city', type: 'text', label: 'City', half: true },
        { id: 'postalCode', type: 'text', label: 'Zip/Postal Code', half: true, autoCapitalize: 'characters' },
        { id: 'accidentDate', type: 'date', label: 'Accident Date', required: true },
        { id: 'accidentTime', type: 'time', label: 'Accident Time' },
        { id: 'reportedDate', type: 'date', label: 'Date Reported', required: true },
        { id: 'reportedTime', type: 'time', label: 'Time Reported' },
      ] },
      { title: 'Accident/Illness Reported To', fields: [
        { id: 'rtFirstName', type: 'text', label: 'First Name', half: true, autoCapitalize: 'words' },
        { id: 'rtLastName', type: 'text', label: 'Last Name', half: true, autoCapitalize: 'words' },
        { id: 'rtJobTitle', type: 'text', label: 'Job Title/Occupation' },
        { id: 'type', type: 'select', label: 'Accident/Illness Type', required: true, options: ACCIDENT_TYPES },
        { id: 'severity', type: 'select', label: 'Accident/Illness Timing/Severity', options: SEVERITY },
      ] },
      { title: 'Area of Injury (Body Part)', fields: [
        { id: 'bodyParts', type: 'checks', label: 'Select all that apply', options: BODY_PARTS, columns: 2 },
        { id: 'bodyOther', type: 'text', label: 'Other' },
      ] },
      { title: 'Accident Details', fields: [
        { id: 'details', type: 'textarea', label: 'Details', required: true, hint: 'Please do not include any confidential information (i.e. names).' },
        { id: 'witnesses', type: 'select', label: 'Are you aware of any witnesses or other employees involved in this accident/illness?', options: ['No', 'Unknown', 'Yes'] },
        { id: 'photos', type: 'photos', label: 'Photos' },
      ] },
    ],
  },

  nearMiss: {
    key: 'nearMiss',
    title: 'Near Miss',
    short: 'Near miss',
    numberPrefix: 'NM',
    titleField: 'title',
    dateField: 'date',
    summaryField: null,
    sections: [
      { title: 'Identification', fields: [
        { id: 'number', type: 'auto', label: 'Near Miss Number' },
        { id: 'title', type: 'text', label: 'Title', required: true, hint: 'Please do not include the name of the individual in the Near Miss Title.' },
        { id: 'location', type: 'text', label: 'Location' },
        { id: 'date', type: 'date', label: 'Near Miss Date', required: true },
        { id: 'time', type: 'time', label: 'Near Miss Time' },
        { id: 'reportedDate', type: 'date', label: 'Date Reported', required: true },
        { id: 'reportedTime', type: 'time', label: 'Time Reported' },
      ] },
      { title: 'What happened', fields: [
        { id: 'description', type: 'textarea', label: 'Description of Near Miss', required: true, hint: 'Please provide as many relevant details as possible.' },
        { id: 'equipment', type: 'textarea', label: 'Description of Machinery/Equipment/Chemicals Involved' },
      ] },
      { title: 'Contributing Factors', fields: [
        { id: 'factors', type: 'checks', label: 'Describe the contributing factors that caused the near miss to happen.', options: NEAR_MISS_FACTORS, columns: 1,
          required: true, satisfiedBy: 'factorsOther' },
        { id: 'factorsOther', type: 'textarea', label: 'If other, please explain' },
        { id: 'rootCause', type: 'textarea', label: 'Near Miss Root Cause', required: true, hint: 'Please describe the root cause of the near miss.' },
        { id: 'mitigation', type: 'textarea', label: 'Proposed Mitigation Measures', required: true, hint: 'Please describe the proposed mitigation measures (immediate and long-term).' },
      ] },
      { title: 'Photos', fields: [
        { id: 'photos', type: 'photos', label: 'Photos' },
      ] },
    ],
  },
};

const pad = (n) => String(n).padStart(2, '0');
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Sensible starting values for a new report at this property
export function defaults(formKey, user, asset) {
  const base = { reportedDate: today(), reportedTime: nowTime() };
  if (formKey === 'accident') {
    return { ...base, accidentDate: today(), accidentTime: nowTime(), country: 'Canada', province: asset.stateProvince, city: asset.city,
      rtFirstName: user.firstName || '', rtLastName: user.lastName || '', rtJobTitle: user.title || '', bodyParts: [], photos: [] };
  }
  return { ...base, date: today(), time: nowTime(), location: asset.address, factors: [], photos: [] };
}

const empty = (v) => v == null || (Array.isArray(v) ? v.length === 0 : !String(v).trim());

// -> { fieldId: 'message' } for every required field that's missing
export function validate(form, values) {
  const errors = {};
  for (const sec of form.sections) for (const f of sec.fields) {
    if (f.type === 'date' && values[f.id] && !/^\d{4}-\d{2}-\d{2}$/.test(values[f.id])) errors[f.id] = 'Use the format YYYY-MM-DD';
    if (!f.required || !empty(values[f.id])) continue;
    if (f.satisfiedBy && !empty(values[f.satisfiedBy])) continue;
    errors[f.id] = f.type === 'checks' ? (f.satisfiedBy ? 'Choose at least one, or explain under "If other"' : 'Choose at least one') : 'Required';
  }
  return errors;
}

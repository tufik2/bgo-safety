# Generates src/data/checklists/emergency-preparedness.json. Edit SECTIONS and re-run:
#   python3 scripts/build-emergency-checklist.py
# Based on CSA Z1600 (Emergency and continuity management programs), National Fire Code of Canada 2.8,
# provincial occupational health & safety and first aid regulations, and the standards named in each question.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from checklist_lib import build, D, W, M

SECTIONS = [
 ('Emergency Response Plan', [
  ('Is there a written Emergency Response Plan for the property, reviewed within the last 12 months?',
   'CSA Z1600. Separate from, and consistent with, the Fire Safety Plan.', 'Review and update the Emergency Response Plan', M(1), 'date'),
  ('Does the plan cover the hazards identified for this site (e.g. power outage, flood, gas leak, severe weather, medical emergency, bomb threat, violent incident, hazardous spill)?',
   'Based on a site hazard and risk assessment.', 'Complete a site hazard assessment and add missing scenarios to the plan', M(1), None),
  ('Are emergency roles (incident lead, wardens, first aiders, building operator) assigned, with alternates for each?',
   'Names and contact numbers in the plan.', 'Assign emergency roles and alternates; update the plan', W(2), None),
  ('Is the plan available to building staff and tenant emergency contacts (printed copy on site and electronic copy)?', '',
   'Distribute the current plan to staff and tenant contacts', W(2), None),
  ('Have tenants\u2019 own emergency procedures been collected and checked for consistency with the building plan?',
   'Especially for tenants with special hazards, large occupant loads or 24-hour operations.', 'Collect and review tenant emergency procedures', M(1), None),
 ]),
 ('Emergency Contacts & Communication', [
  ('Is the emergency contact list (fire, police, ambulance, utilities, elevator, restoration and alarm contractors, management) current, reviewed within the last 6 months?',
   'Post at the security or concierge desk and keep in the emergency kit.', 'Update and repost the emergency contact list', W(1), 'date'),
  ('Is the tenant emergency contact list current, including after-hours numbers?', '', 'Update tenant emergency and after-hours contacts', W(2), None),
  ('Can occupants be notified of an emergency (voice paging, mass notification or another reliable method), and was it tested within the last 12 months?',
   'Voice communication is part of the fire alarm in many high-rises (CAN/ULC-S524 / S536).', 'Test or set up occupant notification and record the result', M(1), 'date'),
  ('Is there a documented escalation process for notifying senior management, ownership and insurers?', '', 'Document the incident escalation and notification process', M(1), None),
 ]),
 ('Evacuation, Shelter & Accountability', [
  ('Are assembly points designated, marked and known to occupants, with a backup location?', 'Away from the building, fire department access and traffic.', 'Designate, sign and communicate assembly points', M(1), None),
  ('Is there a procedure to account for occupants after an evacuation (warden sweeps and reports)?', '', 'Add an occupant accountability procedure and brief wardens', M(1), None),
  ('Is there a shelter-in-place procedure (for outdoor hazards such as chemical releases or severe weather), including how to shut down air handling?',
   'CSA Z1600.', 'Write a shelter-in-place procedure, including HVAC shutdown steps', M(1), None),
  ('Are there procedures for occupants who need help to evacuate, with evacuation aids (e.g. evacuation chairs) available and staff trained?',
   'NFC 2.8.2. Answer N/A for single-storey buildings with level exits.', 'Provide evacuation aids and train staff in assisted evacuation', M(1), None),
 ]),
 ('Training & Exercises', [
  ('Has an exercise of a non-fire scenario (e.g. tabletop, shelter-in-place or power outage) been held within the last 12 months?',
   'Fire drills are covered in the Fire & Life Safety Inspection. CSA Z1600 exercise program.', 'Plan and hold an emergency exercise; record lessons learned', M(2), 'date'),
  ('Have building staff and the emergency team been trained on the Emergency Response Plan within the last 12 months?', '', 'Train staff and the emergency team on the plan', M(1), None),
  ('Were tenants briefed on emergency procedures within the last 12 months?', 'E.g. an annual tenant emergency meeting or bulletin.', 'Hold or send an annual tenant emergency briefing', M(1), None),
  ('Have corrective actions from the last exercise or real incident been completed?', '', 'Complete outstanding actions from the last exercise or incident', M(1), None),
 ]),
 ('First Aid & Medical Emergencies', [
  ('Are first aid kits provided as required by provincial regulation, fully stocked and inspected?',
   'CSA Z1220 / provincial first aid regulations (e.g. Ontario Reg. 1101, Alberta OHS Code Part 11).', 'Restock first aid kits and record the inspection', W(1), None),
  ('Is a trained first aider available on site during operating hours, as required by provincial regulation?', 'Keep training certificates on file.', 'Train or designate additional first aiders', M(1), None),
  ('Is an AED on site, signed, accessible, checked monthly, with pads and battery within their expiry dates?',
   'Manufacturer instructions; register with local EMS where a program exists. Answer N/A if no AED.', 'Service the AED and replace expired pads or battery', W(1), None),
  ('Where hazardous chemicals are used, are eyewash stations or showers provided, unobstructed and activated weekly?',
   'ANSI/ISEA Z358.1. Answer N/A if not required.', 'Install, repair or resume weekly testing of eyewash stations', W(1), None),
 ]),
 ('Utilities & Building Systems', [
  ('Are shut-offs for gas, water and electricity identified, labelled, accessible and shown on site plans?', '', 'Label utility shut-offs and add them to site plans', M(1), None),
  ('Are written shutdown and restart procedures available for critical building systems?', 'Kept with the building operator and in the emergency kit.', 'Write shutdown and restart procedures for critical systems', M(1), None),
  ('Is there an elevator entrapment procedure, with the 24-hour elevator contractor number posted?', 'CSA B44. Answer N/A if no elevators.', 'Post the elevator contractor number and write an entrapment procedure', W(1), None),
  ('Is there a procedure for power outages, including which systems run on emergency power and how long?', '', 'Document the power outage procedure and emergency power loads', M(1), None),
  ('Is there a water leak and flood procedure, with leak detection and sump pumps (if any) tested within the last 12 months?', '', 'Write a flood procedure and test sump pumps and leak detection', M(1), None),
 ]),
 ('Severe Weather & Natural Hazards', [
  ('Is there a severe weather procedure (snow and ice, high winds, extreme heat or cold, flooding), with weather alerts monitored?',
   'Environment and Climate Change Canada alerts.', 'Write a severe weather procedure and set up alert monitoring', M(1), None),
  ('Are roofs, drains and catch basins inspected before winter and spring thaw?', '', 'Inspect roofs, drains and catch basins', M(1), None),
  ('Where earthquakes are a risk, are earthquake procedures in place and heavy items secured?',
   'Mainly British Columbia and parts of Québec. Answer N/A elsewhere.', 'Add earthquake procedures and secure heavy items', M(2), None),
 ]),
 ('Security & Threats', [
  ('Is there a bomb threat procedure, with a call checklist at reception or security?', '', 'Add a bomb threat procedure and call checklist', W(2), None),
  ('Is there a procedure for a violent incident (lockdown or hold-and-secure), communicated to staff and tenants?', 'Coordinate with local police guidance.', 'Write and communicate a lockdown or hold-and-secure procedure', M(1), None),
  ('Is there a procedure for suspicious packages and mail?', '', 'Add a suspicious package procedure', M(1), None),
  ('Do access control and after-hours security procedures work as intended (doors secure, cards and keys controlled)?', '', 'Fix access control issues and update the key and card register', W(2), None),
 ]),
 ('Hazardous Materials & Spills', [
  ('Are spill kits available where fuels, oils or chemicals are stored or used, and fully stocked?', 'Answer N/A if none are stored.', 'Provide or restock spill kits', W(1), None),
  ('Are up-to-date Safety Data Sheets available for hazardous products on site?', 'WHMIS 2015 / Hazardous Products Regulations.', 'Update Safety Data Sheets for products on site', W(2), None),
  ('Is there a spill reporting procedure, including when to notify the provincial environment ministry?', '', 'Write a spill response and reporting procedure', M(1), None),
 ]),
 ('Emergency Supplies & Equipment', [
  ('Is there an emergency kit with the plan, contact lists, floor plans, master keys and flashlights, checked within the last 6 months?', '', 'Assemble or restock the emergency kit', W(2), None),
  ('Do wardens have identification (vests or hats), flashlights and a means to communicate (radios or phones)?', '', 'Supply warden vests, flashlights and radios', M(1), None),
 ]),
 ('Business Continuity & Recovery', [
  ('Are restoration, emergency repair and security contractors pre-arranged (agreements or approved vendor list)?', 'CSA Z1600 continuity planning.', 'Set up emergency service agreements with restoration and repair contractors', M(2), None),
  ('Are critical building records (drawings, as-builts, leases, contacts) backed up off site or online?', '', 'Back up critical building records off site', M(1), None),
  ('Is there a post-incident review procedure to record what happened and the follow-up actions?', '', 'Add a post-incident review procedure', M(1), None),
 ]),
]

build('emergency-preparedness', 'emergency', 'Emergency Preparedness Inspection', 'Emergency Preparedness', SECTIONS,
      'src/data/checklists/emergency-preparedness.json', 'scripts/build-emergency-checklist.py')

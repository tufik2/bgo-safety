# Generates src/data/checklists/fire-life-safety.json (same format as the imported Refined Risk questionnaires).
# Edit the SECTIONS list below and re-run:  python3 scripts/build-fire-checklist.py
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from checklist_lib import build, D, W, M

# (question, guidance, corrective task when "No", due, extra) ; extra: 'date' = ask date of last service when Yes
SECTIONS = [
 ('Fire Safety Plan & Records', [
  ('Is there a Fire Safety Plan for the building that has been reviewed within the last 12 months?',
   'National Fire Code of Canada (NFC) Division B, Section 2.8 / provincial fire code. The plan must reflect current occupancy, staff and systems.',
   'Review and update the Fire Safety Plan; submit to the fire department where required', M(1), 'date'),
  ('Is a copy of the Fire Safety Plan kept where the fire department expects it (e.g. fire safety plan box at the main entrance)?',
   'Location as approved by the local fire department.', 'Place a current copy of the Fire Safety Plan in the approved location', W(2), None),
  ('Are floor plans showing exits, pull stations and extinguishers posted on each floor?',
   'Typically posted near elevators and exit stairs.', 'Post current fire safety floor plans on every floor', M(1), None),
  ('Have supervisory staff and fire wardens been trained on their Fire Safety Plan duties, with records kept?',
   'Training records should show names, date and content.', 'Train supervisory staff and wardens; record attendance', M(1), None),
  ('Are inspection, testing and maintenance records for all fire protection systems kept on site for at least the past 2 years?',
   'NFC requires records to be retained and available to the fire department.', 'Collect missing service reports and set up the on-site fire log book', W(2), None),
 ]),
 ('Fire Drills & Emergency Response', [
  ('Has a fire drill been held within the frequency required for this occupancy (at least once a year for most buildings)?',
   'NFC 2.8.3. Some occupancies (e.g. high-rise, care, schools) require more frequent drills.', 'Schedule and hold a fire drill; record the date, time and observations', M(1), 'date'),
  ('Is the list of fire wardens and alternates current for every floor or tenant area?',
   'Confirm names and contact numbers with tenants.', 'Update the fire warden list and distribute it', W(2), None),
  ('Is the list of occupants needing assistance during evacuation current and kept confidential?',
   'Persons with disabilities who have self-identified; review with tenants at least annually.', 'Update the list of occupants needing evacuation assistance', W(2), None),
 ]),
 ('Fire Alarm & Detection', [
  ('Has the fire alarm system had its annual inspection and test by a qualified technician, with the report on file?',
   'CAN/ULC-S536, Inspection and Testing of Fire Alarm Systems.', 'Book the annual fire alarm inspection and test', W(2), 'date'),
  ('Have all deficiencies from the last fire alarm inspection been corrected?',
   'Check the deficiency list in the last annual report.', 'Correct outstanding fire alarm deficiencies and keep proof of repair', M(1), None),
  ('Is the fire alarm control panel showing normal, with no trouble or supervisory signals?',
   'Check the annunciator and panel display.', 'Call the fire alarm contractor to clear the trouble or supervisory condition', D(1), None),
  ('Are the required daily and monthly fire alarm checks recorded in the log book?',
   'CAN/ULC-S536 daily, monthly and annual requirements.', 'Resume and record daily and monthly fire alarm checks', W(1), None),
  ('Are manual pull stations visible, unobstructed and undamaged?', '', 'Clear access to or repair manual pull stations', W(1), None),
  ('Are smoke and heat detectors free of covers, paint, damage or obstructions?',
   'Construction dust covers must be removed after work.', 'Remove covers or replace damaged detectors', W(1), None),
  ('Is the fire alarm monitored by a listed monitoring station, and was the connection confirmed in the last 12 months?',
   'CAN/ULC-S561 monitoring, where required.', 'Confirm the monitoring contract and test the signal to the monitoring station', W(2), None),
 ]),
 ('Sprinklers, Standpipes & Fire Pumps', [
  ('Has the sprinkler and standpipe system had its annual inspection and test, with the report on file?',
   'NFPA 25 as referenced by the NFC.', 'Book the annual sprinkler and standpipe inspection', W(2), 'date'),
  ('Are all sprinkler control valves open and secured (sealed, locked or electrically supervised)?',
   'A closed valve leaves the building unprotected; check during every visit.', 'Open and secure the control valve; notify the fire department if protection was impaired', D(1), None),
  ('Is at least 457 mm (18 in.) of clear space maintained below sprinkler heads?', 'No storage up to the ceiling.', 'Lower or relocate storage to restore sprinkler clearance', W(1), None),
  ('Are sprinkler heads free of paint, corrosion, damage or anything hung from them?', '', 'Replace affected sprinkler heads', W(2), None),
  ('Is a supply of spare sprinkler heads and the head wrench kept in the spare head cabinet?', 'NFPA 13 / NFPA 25.', 'Restock the spare sprinkler head cabinet', W(2), None),
  ('Are fire department connections visible, accessible, capped and undamaged?', 'Clear of snow, landscaping and parked vehicles.', 'Clear, cap or repair the fire department connection', W(1), None),
  ('If there is a fire pump, is it run and tested at the required frequency with records kept?',
   'NFPA 25: weekly or monthly churn test depending on driver type. Answer N/A if no fire pump.', 'Resume fire pump testing and record results', W(1), None),
 ]),
 ('Portable Fire Extinguishers', [
  ('Are fire extinguishers in their designated locations, mounted, visible and unobstructed?', 'NFPA 10.', 'Replace missing extinguishers and clear access', W(1), None),
  ('Has each extinguisher been visually inspected within the last month, with the tag or record initialled?', 'NFPA 10 monthly inspection.', 'Complete and record monthly extinguisher inspections', W(1), None),
  ('Has annual maintenance been done on all extinguishers by a certified technician within the last 12 months?', 'NFPA 10 annual maintenance.', 'Book annual extinguisher maintenance', W(2), 'date'),
  ('Are pressure gauges in the operable range, with seals and pins intact?', '', 'Recharge or replace extinguishers that are discharged or tampered with', W(1), None),
  ('Are Class K extinguishers provided in commercial cooking areas?', 'Answer N/A if there is no commercial cooking.', 'Install Class K extinguishers in commercial kitchens', W(2), None),
 ]),
 ('Means of Egress & Exits', [
  ('Are exit routes, corridors and stairwells clear of storage and obstructions?', 'NFC 2.7.', 'Remove obstructions from exit routes', D(1), None),
  ('Do exit doors open easily from the inside without a key, tool or special knowledge?', 'Check locking hardware and any delayed-egress devices.', 'Repair or replace exit door hardware', D(1), None),
  ('Are exit signs lit, visible and in good condition?', '', 'Repair or replace exit signs', W(1), None),
  ('Do stairwell and exit doors close and latch on their own?', '', 'Repair door closers or latches on exit doors', W(1), None),
  ('Are exterior exit discharge areas clear (snow, ice, vehicles, storage) to a public way?', '', 'Clear the exit discharge area', D(1), None),
  ('Are handrails, guards and stair treads in good condition?', '', 'Repair handrails, guards or stair treads', W(2), None),
 ]),
 ('Emergency Lighting & Power', [
  ('Are monthly tests of emergency lighting units done and recorded?', 'CSA C22.2 No. 141 / NFC.', 'Resume monthly emergency lighting tests', W(1), None),
  ('Has the annual full-duration test of emergency lighting been done?', '', 'Book the annual emergency lighting duration test', M(1), 'date'),
  ('Do emergency lights work when tested and are their lamps and housings undamaged?', 'Press the test button on a sample of units.', 'Repair or replace failed emergency lighting units', W(1), None),
  ('If there is an emergency generator, is it run under load monthly and serviced annually, with records kept?',
   'CSA C282. Answer N/A if no generator.', 'Resume generator testing and book the annual service', W(2), None),
 ]),
 ('Fire Separations & Fire Doors', [
  ('Do fire doors close and latch fully, and are none wedged or tied open?', 'Only approved hold-open devices tied to the fire alarm are allowed.', 'Remove wedges and repair fire door closers or latches', D(1), None),
  ('Are fire door labels present and the doors, frames and hardware undamaged?', 'NFPA 80.', 'Repair or replace damaged fire doors or hardware', M(1), None),
  ('Are fire separations free of holes and unsealed penetrations (firestopping intact)?', 'Check above ceilings in service rooms after any trade work.', 'Seal openings with a listed firestop system', M(1), None),
  ('Have fire dampers been inspected within the required interval?', 'NFPA 80 / NFPA 105. Answer N/A if none.', 'Book fire damper inspection and repairs', M(1), None),
 ]),
 ('Housekeeping & Hazardous Materials', [
  ('Is combustible waste removed regularly, with no build-up in rooms, shafts or loading areas?', 'NFC 2.4.', 'Remove accumulated combustible waste and increase pickup frequency', W(1), None),
  ('Are flammable and combustible liquids stored in approved containers or cabinets, within allowed quantities?', 'NFC Part 4.', 'Move flammable liquids into approved storage', W(1), None),
  ('Are electrical, mechanical and sprinkler rooms free of storage?', '', 'Remove storage from service rooms', W(1), None),
  ('Do electrical panels have at least 1 m of clear space in front, with covers and breakers in place?', 'CSA C22.1 (Canadian Electrical Code).', 'Clear access to electrical panels and replace missing covers', W(1), None),
  ('Are extension cords used only temporarily, with no daisy-chained power bars?', '', 'Remove improper extension cords and power bars', W(1), None),
  ('Are smoking areas designated away from entrances, with proper non-combustible receptacles?', '', 'Designate smoking areas and provide proper receptacles', W(2), None),
 ]),
 ('Commercial Cooking', [
  ('Have kitchen exhaust hoods and ducts been cleaned at the required frequency, with the certificate posted?', 'NFPA 96. Answer N/A if no commercial cooking.', 'Book hood and duct cleaning', W(2), None),
  ('Has the kitchen fire suppression system been serviced within the last 6 months?', 'ULC/ORD-C1254.6 / NFPA 96.', 'Book kitchen suppression system service', W(2), None),
 ]),
 ('Fire Department Access', [
  ('Are fire routes clear, marked and signed, with no parking?', '', 'Clear the fire route and repair signage', D(1), None),
  ('Are private hydrants accessible, marked and inspected within the last 12 months?', 'NFPA 25. Answer N/A if no private hydrants.', 'Book the private hydrant inspection and clear access', M(1), None),
  ('Are the fire department key box and building keys present and current?', '', 'Update keys in the fire department key box', W(1), None),
 ]),
 ('Elevators & Building Systems', [
  ('Has elevator firefighters\u2019 emergency operation (fire recall) been tested within the last 12 months?', 'CSA B44. Answer N/A if no elevators.', 'Book the elevator fire recall test', M(1), None),
  ('Have smoke control and HVAC shutdown functions been tested with the fire alarm within the last 12 months?', 'Integrated testing, CAN/ULC-S1001. Answer N/A if none.', 'Book integrated testing of fire safety systems', M(1), None),
 ]),
]

build('fire-life-safety', 'fire', 'Fire & Life Safety Inspection', 'Fire & Life Safety', SECTIONS,
      'src/data/checklists/fire-life-safety.json', 'scripts/build-fire-checklist.py')

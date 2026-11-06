# BGO Safety — proof of concept

React Native (Expo SDK 58) app for property fire & life safety, emergency preparedness, health & safety and
environmental surveys, incident reporting and property teams, with a serverless AWS backend.

**Full setup guide:** `docs/BGO-Safety-AWS-Setup-Guide.pdf` (start with its *Configuration checklist*).

## Quick start

### 1. Try it without AWS (on-device demo data)
`src/config.js` ships pointing at the deployed API (`AUTH_MODE = 'aws'`, `https://bgosafety.refineddata.com`).
For a demo with no server, set `AUTH_MODE = 'local'` there: access codes appear on screen and data stays on the device.
```
npm install
npx expo start            # scan the QR code with Expo Go, or press w for the browser
```

### 2. Run the real API on your PC (no AWS)
```
cd server && npm install && npm test && npm run dev     # codes are printed in this terminal
```
In `src/config.js`: `AUTH_MODE = 'aws'`, `API_BASE_URL = 'http://<your PC IP>:3000'`, then `npx expo start`.

### 3. Deploy to AWS and test as a real app (one deploy)
Follow the guide's configuration checklist. In short:
1. **Before:** check SES/SNS in us-east-1; find your `*.refineddata.com` certificate in ca-central-1; create the Microsoft
   app registration with redirect URI `https://bgosafety.refineddata.com/auth/sso/callback`.
2. **Fill** the three `<...>` values in `server/samconfig.toml` (certificate ARN, tenant ID, client ID).
3. **Deploy once:**
   ```
   cd server && npm install && npm test
   sam build && sam deploy
   ```
4. **After:** paste the client secret into Secrets Manager (`bgo-safety/prod/app` → `ssoClientSecret`) and add the GoDaddy
   CNAME `bgosafety` → `ApiDomainTarget` output. The property and user lists in `server/data` load automatically on the
   API's first request. For later list updates:
   ```
   node scripts/import-lists.mjs --properties property-list.xlsx --users users.xlsx
   AWS_REGION=ca-central-1 node scripts/load-data.mjs --table bgo-safety-prod
   ```
5. **App:** already set up for the deployed API (`src/config.js`: `AUTH_MODE = 'aws'`,
   `API_BASE_URL = 'https://bgosafety.refineddata.com'`). Build the APK with `npx eas-cli@latest build -p android --profile preview`.

## Project layout

| Path | What |
| --- | --- |
| `App.js`, `src/screens/` | Screens: sign-in, properties, dashboard, surveys, incidents, property team |
| `src/config.js` | App settings (public only): sign-in mode, API address, SSO button, demo history |
| `src/store.js`, `src/remote.js` | Data: on-device (local mode) or API with offline outbox (aws mode) |
| `src/checklists/`, `src/data/checklists/` | Survey rules and the four checklists |
| `scripts/build-fire-checklist.py`, `scripts/build-emergency-checklist.py` | Source of the Fire & Life Safety and Emergency Preparedness checklists (re-run after edits, then `npm run sync-checklists` in `server/`) |
| `scripts/import-questionnaire.js` | Converts Refined Risk questionnaire XML exports |
| `server/template.yaml` | AWS stack (SAM): API Gateway, Lambda, DynamoDB, S3, Secrets Manager, alarm, custom domain |
| `server/samconfig.toml` | Deploy settings (fill the three `<...>` values, then `sam build && sam deploy`) |
| `server/src/` | API: sign-in (codes, Okta/Microsoft SSO), surveys, PDF reports, incidents, teams, photos |
| `server/scripts/` | `import-lists`, `load-data`, `dev-server`, `smoke-test`, `sync-checklists` |
| `server/data/` | Properties, users, `admins.json`, `extra-users.json` (Refined Data accounts) |

## Behaviour (POC)

- Sign-in: 6-digit code by email (SES) or text (SNS), or Okta SSO through the API. Same answer for unknown
  addresses; 60-second codes, 3 attempts. Token kept in the phone's secure storage.
- Roles: Admin (all properties, edits property teams, makes Admins) and Property Manager (assigned properties).
- Surveys are annual per property; start from last year's answers; save as a whole, with a choice if someone
  else saved in the meantime; no approval step. Submitting creates a PDF report in S3.
- Offline: surveys, incident reports and saved property locations stay on the phone and upload when the connection returns.
- Property location: the first person on site saves the phone's GPS position (±150 m or better); the app then opens
  that property automatically when someone arrives.
- `DEMO_HISTORY` / `DemoMode`: generated 2024–2025 surveys per property for trying the copy feature.
- Checklists marked as written for this app need review by qualified professionals before real use.

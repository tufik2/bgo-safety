// ============================================================================
// BGO Safety — app configuration (bundled inside the APK)
//
// Everything here ships to every phone and can be read by anyone who unzips
// the APK, encrypted or not (the key to decrypt it would ship too).
// So this file holds only PUBLIC settings. Secrets — the SSO client secret or
// private certificate, and AWS SES / SNS / S3 credentials — belong on the
// server: see server/config.example.js.
// ============================================================================

/* ---------- Sign-in ---------- */
// 'local' = POC: access codes are simulated on the device.
// 'aws'   = production: codes are sent by the BGO Safety API (SES email, SNS text).
export const AUTH_MODE = 'aws';     // 'local' = on-device demo with no server (codes shown on screen)

// API Gateway base URL, e.g. 'https://abc123.execute-api.ca-central-1.amazonaws.com/prod'
export const API_BASE_URL = 'https://bgosafety.refineddata.com';

/* ---------- Single sign-on (Okta or Microsoft Entra ID) ----------
   Sign-in runs through the API: the app opens the provider's page, the API swaps the result
   using the client secret / certificate kept in AWS Secrets Manager, and the app gets a
   one-time ticket. So the app needs no provider settings — those are deploy parameters
   (SsoMethod, SsoDomain or SsoTenantId, SsoClientId). See the AWS setup guide, section 3. */
export const SSO = {
  enabled: true,                       // show the button on the sign-in screen
  buttonLabel: 'Single sign-on',       // replaced by the API's label once SSO is configured (e.g. "Sign in with Microsoft")
  redirectPath: 'auth',                // app link the API sends users back to: bgosafety://auth
};

/* ---------- POC demo data ----------
   Creates approved 2024 and 2025 surveys the first time a property's surveys are opened, so
   "copy last year's answers" can be tried. Turn off (and set DemoMode=false on the API) for real use. */
export const DEMO_HISTORY = true;

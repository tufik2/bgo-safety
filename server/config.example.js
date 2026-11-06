// ============================================================================
// BGO Safety API — server configuration (NEVER bundle this in the app)
//
// Copy to server/config.js (git-ignored) for local testing. In AWS, store the
// values in Secrets Manager / SSM Parameter Store and give the Lambda an IAM
// role instead of access keys — then the AWS sections need no credentials.
// ============================================================================
module.exports = {
  /* ---------- SSO (Microsoft Entra ID) ----------
     The server verifies ID tokens the app sends (/auth/sso) using the tenant's
     public signing keys, so verification needs only tenantId + clientId.
     The credential below is for server-to-Microsoft calls (e.g. Microsoft Graph
     to read a user's profile or group membership). */
  sso: {
    tenantId: '',                    // Directory (tenant) ID
    clientId: '',                    // Application (client) ID (same as the app's, or a separate API registration)
    configType: 'certificate',       // 'certificate' | 'clientSecret'

    // configType 'clientSecret'
    clientSecret: '',

    // configType 'certificate' (PEM). Upload the PUBLIC certificate to the app
    // registration in Entra; keep the PRIVATE one only here / in Secrets Manager.
    privateCertificate: `-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`,
    publicCertificate: `-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----`,

    allowedEmailDomains: ['bgo.com', 'refineddata.com'], // optional extra check on SSO sign-ins
  },

  /* ---------- Email codes: Amazon SES ---------- */
  ses: {
    region: 'ca-central-1',
    fromAddress: 'no-reply@refineddata.com',  // verified SES identity
    fromName: 'BGO Safety',
    configurationSet: '',                     // optional, for delivery tracking
    // Prefer the Lambda's IAM role (ses:SendEmail). Only for local testing:
    accessKeyId: '',
    secretAccessKey: '',
  },

  /* ---------- Text codes: Amazon SNS ---------- */
  sns: {
    region: 'ca-central-1',
    smsType: 'Transactional',
    senderId: '',                             // optional; not supported in all countries
    originationNumber: '',                    // e.g. '+1…' if you have a registered number
    // Prefer the Lambda's IAM role (sns:Publish). Only for local testing:
    accessKeyId: '',
    secretAccessKey: '',
  },

  /* ---------- Photo / attachment storage: Amazon S3 (to be added) ---------- */
  s3: {
    region: 'ca-central-1',
    bucket: '',
    // The app never gets S3 keys: the API returns short-lived pre-signed upload URLs.
    accessKeyId: '',
    secretAccessKey: '',
  },

  /* ---------- Access codes ---------- */
  codes: { ttlSeconds: 60, maxAttempts: 3, requestsPer15Min: 5 },
};

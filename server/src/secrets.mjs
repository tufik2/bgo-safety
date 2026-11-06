// Loads the app secret (session signing key + SSO credential) from Secrets Manager.
// Re-read every 5 minutes, so a value pasted into the secret after the deploy (e.g. the SSO client
// secret) takes effect without redeploying. Local dev: DEV_SECRET env var (JSON) or a generated key.
import { env } from './util.mjs';

const TTL_MS = 5 * 60 * 1000;
let cached = null, at = 0;
export async function getSecrets() {
  if (cached && Date.now() - at < TTL_MS) return cached;
  const arn = env('SECRET_ARN');
  if (!arn) {
    cached = { jwtSecret: env('DEV_JWT_SECRET', 'dev-only-secret-change-me'), ...(JSON.parse(env('DEV_SECRET', '{}'))) };
    at = Date.now();
    return cached;
  }
  const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
  const sm = new SecretsManagerClient({});
  const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  const next = JSON.parse(res.SecretString || '{}');
  if (!next.jwtSecret) throw new Error('Secret is missing jwtSecret');
  cached = next; at = Date.now();
  return cached;
}
export const __resetForTests = () => { cached = null; at = 0; };

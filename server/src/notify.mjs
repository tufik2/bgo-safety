// Delivers access codes: SES for email, SNS for text. DELIVERY=console logs them instead (local dev).
import { env as rawEnv, e164 } from './util.mjs';

// "none" (or blank) means "not set". SAM can't pass an empty value, and it keeps a setting's previous
// value when the setting isn't listed, so "none" is how an old value gets cleared.
const env = (k, d = '') => { const v = rawEnv(k, d); return /^(none|-)$/i.test(String(v).trim()) ? '' : v; };

// a***@refineddata.com / ***-***-6517 in logs
const mask = (t) => (t.includes('@') ? `${t[0]}***@${t.split('@')[1]}` : `***-***-${t.slice(-4)}`);

// Text wording, chosen by the SmsWording deploy setting. To change the text itself, edit it here.
// {code} = the code, {expires} = "60 seconds" / "5 minutes".
// Sent like Refined Risk's existing 2FA (sender ID "RefinedRisk", no forced origination number), which
// Canadian carriers accept; forcing the toll-free number got texts blocked by Telus.
export const SMS_WORDINGS = {
  bgo: 'Your BGO Safety verification code is {code}. It expires in {expires}.',
  'registered-sample': 'RefinedRisk - Verification code is {code}',
};
const expiresText = (s) => (s % 60 === 0 && s >= 120 ? `${s / 60} minutes` : `${s} seconds`);
export const smsText = (code, ttlSeconds = 60) => (SMS_WORDINGS[env('SMS_WORDING', 'bgo')] || SMS_WORDINGS.bgo)
  .replace(/\{code\}/g, code).replace(/\{expires\}/g, expiresText(ttlSeconds));

let ses, sns;
export async function sendCode({ channel, to, code, ttlSeconds }) {
  const text = `Your BGO Safety access code is ${code}. It expires in ${ttlSeconds} seconds. If you didn't ask for it, ignore this message.`;
  if (env('DELIVERY') === 'console') {
    console.log(`[dev] access code for ${to} (${channel}): ${code}`);
    return;
  }
  if (channel === 'email') {
    const { SESv2Client, SendEmailCommand } = await import('@aws-sdk/client-sesv2');
    ses = ses || new SESv2Client({ region: env('SES_REGION') || undefined }); // may differ from the stack's region
    const from = env('SES_FROM_NAME') ? `"${env('SES_FROM_NAME')}" <${env('SES_FROM_ADDRESS')}>` : env('SES_FROM_ADDRESS');
    const res = await ses.send(new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ConfigurationSetName: env('SES_CONFIGURATION_SET') || undefined,
      Content: { Simple: {
        Subject: { Data: `Your BGO Safety access code: ${code}` },
        Body: {
          Text: { Data: text },
          Html: { Data: `<p>Your BGO Safety access code is</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in ${ttlSeconds} seconds. If you didn't ask for it, ignore this email.</p>` },
        },
      } },
    }));
    console.log(JSON.stringify({ event: 'code_sent', channel: 'email', to: mask(to), region: env('SES_REGION'), messageId: res.MessageId }));
    return;
  }
  const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
  sns = sns || new SNSClient({ region: env('SNS_REGION') || undefined });
  const attrs = { 'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' } };
  if (env('SNS_ORIGINATION_NUMBER')) attrs['AWS.MM.SMS.OriginationNumber'] = { DataType: 'String', StringValue: env('SNS_ORIGINATION_NUMBER') };
  if (env('SNS_SENDER_ID')) attrs['AWS.SNS.SMS.SenderID'] = { DataType: 'String', StringValue: env('SNS_SENDER_ID') };
  const res = await sns.send(new PublishCommand({ PhoneNumber: e164(to), Message: smsText(code, ttlSeconds), MessageAttributes: attrs }));
  // Accepted by SNS. If the text still doesn't arrive, look up this messageId in SNS delivery status logs (sandbox, spend limit, carrier).
  console.log(JSON.stringify({ event: 'code_sent', channel: 'sms', to: mask(to), region: env('SNS_REGION') || '(stack region)',
    originationNumber: env('SNS_ORIGINATION_NUMBER') || '(none set: AWS picks a shared number)', messageId: res.MessageId }));
}

// S3 access: short-lived links so the app uploads/downloads photos without AWS keys, plus
// server-side reads/writes (photos into PDFs, PDF reports out).
// Local dev server (STORE=memory): an in-memory store served at /dev-uploads/.
import { env } from './util.mjs';

export const devFiles = new Map(); // key -> { type, buf }  (dev server only)
const memory = () => env('STORE') === 'memory';

let s3, presigner, cmds;
async function client() {
  if (!s3) {
    cmds = await import('@aws-sdk/client-s3');
    s3 = new cmds.S3Client({});
    presigner = (await import('@aws-sdk/s3-request-presigner')).getSignedUrl;
  }
  return s3;
}

export async function presignPut(key, contentType, req) {
  if (memory()) return `${req.baseUrl}/dev-uploads/${key}`;
  const c = await client();
  return presigner(c, new cmds.PutObjectCommand({ Bucket: env('BUCKET_NAME'), Key: key, ContentType: contentType }), { expiresIn: 300 });
}

export async function presignGet(key, req, filename) {
  if (memory()) return `${req.baseUrl}/dev-uploads/${key}`;
  const c = await client();
  return presigner(c, new cmds.GetObjectCommand({
    Bucket: env('BUCKET_NAME'), Key: key,
    ...(filename ? { ResponseContentDisposition: `inline; filename="${filename}"` } : {}),
  }), { expiresIn: 3600 });
}

export async function putObject(key, buf, type) {
  if (memory()) { devFiles.set(key, { type, buf: Buffer.from(buf) }); return; }
  const c = await client();
  await c.send(new cmds.PutObjectCommand({ Bucket: env('BUCKET_NAME'), Key: key, Body: buf, ContentType: type }));
}

export async function getObject(key) {
  if (memory()) { const f = devFiles.get(key); return f ? f.buf : null; }
  const c = await client();
  try {
    const r = await c.send(new cmds.GetObjectCommand({ Bucket: env('BUCKET_NAME'), Key: key }));
    return Buffer.from(await r.Body.transformToByteArray());
  } catch { return null; }
}

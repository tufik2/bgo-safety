// Local API for testing without AWS: same routes as the Lambda, data in memory,
// access codes printed here instead of emailed/texted.
//   npm run dev            -> http://localhost:3000
// Point the app at it: src/config.js  AUTH_MODE = 'aws', API_BASE_URL = 'http://<your PC IP>:3000'
import http from 'node:http';
import os from 'node:os';

process.env.STORE = 'memory';
process.env.DELIVERY = 'console';
process.env.STAGE = 'dev';
process.env.DEMO_MODE = process.env.DEMO_MODE || 'true';
const { handler, setRepo } = await import('../src/handler.mjs');
const { createMemoryRepo } = await import('../src/repo-memory.mjs');
const { loadSeed } = await import('./seed-lib.mjs');
const { devFiles: files } = await import('../src/uploads.mjs');

const repo = createMemoryRepo();
const { users, properties } = loadSeed();
await repo.putUsers(users);
await repo.putProperties(properties);
setRepo(repo);

const PORT = Number(process.env.PORT || 3000);
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (url.pathname.startsWith('/dev-uploads/')) {
    const key = decodeURIComponent(url.pathname.slice('/dev-uploads/'.length));
    if (req.method === 'PUT') { files.set(key, { type: req.headers['content-type'], buf }); res.writeHead(200, cors); return res.end(); }
    const f = files.get(key);
    if (!f) { res.writeHead(404, cors); return res.end(); }
    res.writeHead(200, { ...cors, 'content-type': f.type || 'application/octet-stream' }); return res.end(f.buf);
  }
  const out = await handler({
    rawPath: url.pathname, requestContext: { http: { method: req.method } }, headers: req.headers,
    queryStringParameters: Object.fromEntries(url.searchParams), body: buf.length ? buf.toString('utf8') : '',
    __baseUrl: `http://${req.headers.host}`,
  });
  res.writeHead(out.statusCode, { ...out.headers, ...cors });
  res.end(out.body);
  console.log(`${req.method} ${url.pathname} -> ${out.statusCode}`);
}).listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`BGO Safety dev API on http://localhost:${PORT}  (${users.length} users, ${properties.length} properties)`);
  for (const ip of ips) console.log(`  from a phone/emulator on this network: http://${ip}:${PORT}`);
});

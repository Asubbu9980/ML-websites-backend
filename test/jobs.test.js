import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadSites } from '../src/config/sites.js';

const sites = loadSites({});
const transporters = {};
const logger = { info() {}, warn() {}, error() {} };

let server;
let baseUrl;

beforeEach(async () => {
  server?.close();
  const app = createApp({ sites, transporters, env: {}, logger });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server?.close());

test('GET /api/jobs returns 503 if database is not connected', async () => {
  const res = await fetch(`${baseUrl}/api/jobs`);
  assert.equal(res.status, 503);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.match(json.error, /Database service unavailable/i);
});

test('POST /api/jobs returns 503 if database is not connected', async () => {
  const res = await fetch(`${baseUrl}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId: 'ML-001',
      title: 'Full Stack Engineer',
      description: 'Job description',
      skills: ['Node.js', 'React'],
      experienceMin: 2,
      jobType: 'Full-time',
      expiryDate: new Date().toISOString(),
    }),
  });
  assert.equal(res.status, 503);
});

test('GET /api/jobs/:id with invalid ID returns 503 when DB not connected', async () => {
  const res = await fetch(`${baseUrl}/api/jobs/invalid-id`);
  assert.equal(res.status, 503);
});

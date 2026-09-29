import fs from 'fs';

// Ensure .env environment variables are loaded at startup using native Node.js env loader
if (fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch (err) {
    console.warn('⚠️  Could not parse .env file:', err.message);
  }
}

import { createApp } from './app.js';
import { loadSites } from './config/sites.js';
import { createTransporters } from './mailer.js';
import { connectDB } from './config/db.js';

// Connect to MongoDB if MONGODB_URI is provided
connectDB();

const sites = loadSites();
const transporters = createTransporters(sites);

for (const site of Object.values(sites)) {
  const p = site.envPrefix;
  if (!site.smtp.user || !site.smtp.pass) {
    console.warn(`⚠️  ${p}_SMTP_USER / ${p}_SMTP_PASS (or SMTP_USER / SMTP_PASS) not set – ${site.name} form will fail`);
  }
  if (!site.allowedOrigins.length) console.warn(`⚠️  ${p}_ALLOWED_ORIGINS is not set – browsers can't call ${site.id}`);
}

// Check each Gmail login once at startup so bad credentials show up in the logs.
const verified = new Set();
for (const site of Object.values(sites)) {
  const transporter = transporters[site.id];
  if (!site.smtp.user || verified.has(transporter)) continue;
  verified.add(transporter);
  transporter
    .verify()
    .then(() => console.log(`✅ SMTP login OK for ${site.smtp.user}`))
    .catch((err) => console.error(`❌ SMTP login failed for ${site.smtp.user}: ${err.message}`));
}

const port = Number(process.env.PORT || 3000);
const server = createApp({ sites, transporters }).listen(port, () => {
  console.log(`Email server listening on port ${port} for sites: ${Object.keys(sites).join(', ')}`);
});

// Render sends SIGTERM on deploys/restarts.
process.on('SIGTERM', () => {
  server.close(() => {
    for (const transporter of new Set(Object.values(transporters))) transporter.close();
    process.exit(0);
  });
});

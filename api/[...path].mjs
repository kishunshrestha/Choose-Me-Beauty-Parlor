import { openPostgresDatabase } from '../backend/database.mjs';
import { createApp } from '../backend/app.mjs';

// Vercel serves the built frontend as static files. This function supplies the
// Neon-backed Express API and the upload endpoint.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not configured for this Vercel environment.');

const db = await openPostgresDatabase(databaseUrl);
const deploymentHost = process.env.VERCEL_ENV === 'production'
  ? (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL)
  : process.env.VERCEL_URL;
const origin = process.env.APP_ORIGIN || (deploymentHost ? `https://${deploymentHost}` : 'http://localhost:3000');

const app = createApp(db, {
  origin,
  secure: true,
  dataDir: '/tmp/chooseme',
});

// Filesystem catch-all functions may receive the suffix without "/api".
// Normalize it to the paths used by the existing Express app. Uploaded media
// URLs are public "/uploads/..." URLs, rewritten to "/api/uploads/..." below.
app.use((req, _res, next) => {
  const url = req.url || '/';
  if (url.startsWith('/api/uploads/')) {
    req.url = url.slice(4);
  } else if (url !== '/api' && !url.startsWith('/api/')) {
    req.url = `/api${url.startsWith('/') ? '' : '/'}${url}`;
  }
  next();
});

export default app;

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

// Vercel catch-all functions can receive a path with or without the "/api"
// prefix. Normalize before Express matches routes. Public upload URLs are
// rewritten to /api/uploads/... and mapped back to /uploads/... here.
export default function handler(req, res) {
  const url = req.url || '/';
  if (url.startsWith('/api/uploads/')) {
    req.url = url.slice(4);
  } else if (url !== '/api' && !url.startsWith('/api/')) {
    req.url = `/api${url.startsWith('/') ? '' : '/'}${url}`;
  }
  return app(req, res);
}

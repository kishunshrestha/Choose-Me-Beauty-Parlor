import { openPostgresDatabase } from '../backend/database.mjs';
import { createApp } from '../backend/app.mjs';

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

// Vercel rewrites every API/upload URL to this single function and passes the
// original route in the "__route" query parameter. Rebuild the URL before
// Express matches it, while preserving the caller's other query parameters.
export default function handler(req, res) {
  const incoming = new URL(req.url || '/', 'https://vercel.internal');
  const route = incoming.searchParams.get('__route');
  if (route) {
    const path = route.startsWith('uploads/') ? `/${route}` : `/api/${route}`;
    incoming.searchParams.delete('__route');
    const query = incoming.searchParams.toString();
    req.url = path + (query ? `?${query}` : '');
  }
  return app(req, res);
}

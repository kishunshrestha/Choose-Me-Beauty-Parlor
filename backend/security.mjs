import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
import { dbGet, dbRun } from './database.mjs';
const scrypt = promisify(scryptCallback);
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(expected, key);
}
export async function bootstrapAdmin(db, accessFile, email = 'admin@chooseme.local', reset = false) {
  const existing = await dbGet(db, 'SELECT id FROM admin WHERE id=1');
  const configuredPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (!reset && existing) {
    const applied = await dbGet(db, "SELECT value FROM app_meta WHERE key='admin_initial_password_applied'");
    if (!configuredPassword || applied) return;
    if (configuredPassword.length < 12) throw new Error('ADMIN_INITIAL_PASSWORD must be at least 12 characters.');
    await dbRun(db, 'UPDATE admin SET email=?, password_hash=? WHERE id=1', [email, await hashPassword(configuredPassword)]);
    await dbRun(db, 'DELETE FROM sessions', []);
    await dbRun(db, "INSERT INTO app_meta (key,value) VALUES ('admin_initial_password_applied','1') ON CONFLICT(key) DO UPDATE SET value='1'", []);
    writeFileSync(accessFile, `CHOOSE ME — LOCAL ADMIN ACCESS\n\nAdmin: http://localhost:${process.env.PORT || 3000}/admin\nEmail: ${email}\nPassword: ${configuredPassword}\n\nKeep this file private. You can change your password in Admin → Account.\nThis file is excluded from source control. Delete it after saving your password securely.\n`, {mode:0o600});
    return;
  }
  const password = !reset && configuredPassword ? configuredPassword : randomBytes(18).toString('base64url');
  if (!reset && configuredPassword && configuredPassword.length < 12) throw new Error('ADMIN_INITIAL_PASSWORD must be at least 12 characters.');
  await dbRun(db, 'INSERT INTO admin (id,email,password_hash) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, password_hash=excluded.password_hash', [email, await hashPassword(password)]);
  await dbRun(db, 'DELETE FROM sessions', []);
  if (!reset && configuredPassword) await dbRun(db, "INSERT INTO app_meta (key,value) VALUES ('admin_initial_password_applied','1') ON CONFLICT(key) DO UPDATE SET value='1'", []);
  writeFileSync(accessFile, `CHOOSE ME — LOCAL ADMIN ACCESS\n\nAdmin: http://localhost:${process.env.PORT || 3000}/admin\nEmail: ${email}\nPassword: ${password}\n\nKeep this file private. You can change your password in Admin → Account.\nThis file is excluded from source control. Delete it after saving your password securely.\n`, {mode:0o600});
}
export function rateLimit(db, scope, max, windowMs) {
  return async (req, res, next) => {
    try {
      const now = Date.now(), key = `${scope}:${req.ip}`;
      await dbRun(db, 'DELETE FROM rate_limits WHERE resets_at < ?', [now]);
      const row = await dbGet(db, 'SELECT * FROM rate_limits WHERE key=?', [key]);
      if (row && row.count >= max) return res.set('Retry-After', String(Math.ceil((row.resets_at-now)/1000))).status(429).json({error:'Too many attempts. Please try again later.'});
      await dbRun(db, 'INSERT INTO rate_limits (key,count,resets_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1', [key,now+windowMs]);
      next();
    } catch (error) { next(error); }
  };
}

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { writeFileSync } from 'node:fs';
const scrypt = promisify(scryptCallback);
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export async function bootstrapAdmin(db, accessFile, email = 'admin@chooseme.local', reset = false) {
  if (!reset && db.prepare('SELECT id FROM admin WHERE id=1').get()) return;
  const password = randomBytes(18).toString('base64url');
  db.prepare('INSERT INTO admin VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, password_hash=excluded.password_hash').run(email, await hashPassword(password));
  db.prepare('DELETE FROM sessions').run();
  writeFileSync(accessFile, `CHOOSE ME — LOCAL ADMIN ACCESS\n\nAdmin: http://localhost:${process.env.PORT || 3000}/admin\nEmail: ${email}\nPassword: ${password}\n\nKeep this file private. You can change your password in Admin → Account.\nThis file is excluded from source control. Delete it after saving your password securely.\n`, {mode: 0o600});
}
export function rateLimit(db, scope, max, windowMs) {
  return (req, res, next) => {
    const now = Date.now();
    db.prepare('DELETE FROM rate_limits WHERE resets_at < ?').run(now);
    const key = `${scope}:${req.ip}`;
    const row = db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);
    if (row && row.count >= max) return res.set('Retry-After', String(Math.ceil((row.resets_at-now)/1000))).status(429).json({error: 'Too many attempts. Please try again later.'});
    db.prepare('INSERT INTO rate_limits VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + windowMs);
    next();
  };
}

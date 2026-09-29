import { resolve } from 'node:path';
import { openDatabase } from '../backend/database.mjs';
import { bootstrapAdmin } from '../backend/security.mjs';
const db=openDatabase(resolve(process.env.DATA_DIR || 'data','chooseme.sqlite'));
await bootstrapAdmin(db,resolve('ADMIN-ACCESS.txt'),process.env.ADMIN_EMAIL,true);
db.close();
console.log('Admin password reset. Read ADMIN-ACCESS.txt privately. Existing sessions have been signed out.');

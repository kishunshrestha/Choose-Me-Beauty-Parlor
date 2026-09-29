import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import sharp from 'sharp';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { z, ZodError } from 'zod';
import { listRecords, settings } from './database.mjs';
import { checkPassword, digest, hashPassword, rateLimit } from './security.mjs';
import { schemas, settingsSchema, enquirySchema } from './validation.mjs';

export function createApp(db, options = {}) {
  const app = express();
  const origin = options.origin || process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
  const secure = options.secure ?? process.env.COOKIE_SECURE === 'true';
  const uploadDir = resolve(options.dataDir || process.env.DATA_DIR || './data', 'uploads');
  mkdirSync(uploadDir, {recursive: true});
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", ...(options.dev ? ["'unsafe-inline'"] : [])],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", ...(options.dev ? ['ws://localhost:*','ws://127.0.0.1:*'] : [])],
      frameSrc: ['https://www.tiktok.com', 'https://www.google.com'],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
      upgradeInsecureRequests: secure ? [] : null,
    }},
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: secure ? undefined : false,
  }));
  app.use(express.json({limit: '48kb'}));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== origin) return res.status(403).json({error:'This request is not allowed.'});
      if (!req.is('application/json') && !req.is('multipart/form-data')) return res.status(415).json({error:'Send JSON or a photo upload.'});
    }
    next();
  });
  app.use('/uploads', express.static(uploadDir, {maxAge:'7d', dotfiles:'deny', index:false, setHeaders(res) {res.set('X-Content-Type-Options','nosniff');}}));

  const auth = (req, res, next) => {
    const token = req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('chooseme_session='))?.slice(17);
    const row = token && db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(token), Date.now());
    if (!row) return res.status(401).json({error:'Please sign in to continue.'});
    req.session = row;
    if (!['GET','HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== row.csrf) return res.status(403).json({error:'Your security token expired. Refresh and try again.'});
    next();
  };
  const cookieOptions = {httpOnly:true, sameSite:'strict', secure, path:'/', maxAge:8*60*60*1000};
  app.get('/api/health', (_req,res)=>res.json({ok:true}));
  app.get('/api/site', (_req,res)=>res.json({settings:settings(db), ...Object.fromEntries(Object.keys(schemas).map(kind=>[kind,listRecords(db,kind,true)]))}));
  app.post('/api/login', rateLimit(db,'login',10,15*60*1000), async (req,res) => {
    const input = z.object({email:z.string().email().max(254), password:z.string().min(1).max(200)}).parse(req.body);
    const admin = db.prepare('SELECT * FROM admin WHERE id=1').get();
    const valid = admin && await checkPassword(input.password, admin.password_hash);
    if (!valid || input.email.toLowerCase() !== admin.email.toLowerCase()) return res.status(401).json({error:'The email or password is incorrect.'});
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), csrf, Date.now()+cookieOptions.maxAge);
    res.cookie('chooseme_session',token,cookieOptions).json({email:admin.email,csrf});
  });
  app.post('/api/enquiries', rateLimit(db,'enquiry',6,10*60*1000), (req,res) => {
    const input=enquirySchema.parse(req.body);
    if (input.website) return res.status(400).json({error:'Please submit the form again.'});
    let subject='General appointment enquiry';
    const id=input.serviceId || input.courseId;
    if (id) {
      const kind=input.serviceId ? 'services':'courses';
      const record=db.prepare('SELECT payload FROM records WHERE id=? AND kind=? AND visible=1').get(id,kind);
      if (!record) return res.status(400).json({error:'This service or course is no longer available. Please choose another.'});
      subject=(kind==='courses'?'Course: ':'')+JSON.parse(record.payload).title;
    }
    db.prepare('INSERT INTO enquiries (id,name,phone,subject,preferred_date,message,created_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),input.name,input.phone,subject,input.preferredDate,input.message,new Date().toISOString());
    res.status(201).json({message:'Your enquiry has been received. We’ll contact you to discuss availability. Your appointment is not yet confirmed.'});
  });
  app.use('/api/admin',auth);
  app.get('/api/admin/session', (_req,res)=>res.json({email:db.prepare('SELECT email FROM admin WHERE id=1').get().email,csrf:_req.session.csrf}));
  app.post('/api/admin/logout',(req,res)=>{
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.session.token_hash);
    res.clearCookie('chooseme_session', {httpOnly:true,sameSite:'strict',secure,path:'/'}).json({ok:true});
  });
  app.post('/api/admin/password',rateLimit(db,'password',8,15*60*1000),async(req,res)=>{
    const input=z.object({currentPassword:z.string().min(1).max(200),newPassword:z.string().min(12,'Use at least 12 characters.').max(200)}).parse(req.body);
    const admin=db.prepare('SELECT * FROM admin WHERE id=1').get();
    if (!await checkPassword(input.currentPassword,admin.password_hash)) return res.status(400).json({error:'Your current password is incorrect.'});
    db.prepare('UPDATE admin SET password_hash=? WHERE id=1').run(await hashPassword(input.newPassword));
    db.prepare('DELETE FROM sessions WHERE token_hash<>?').run(req.session.token_hash);
    res.json({ok:true});
  });
  app.get('/api/admin/overview',(_req,res)=>res.json({
    services:db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='services'").get().n,
    visibleServices:db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='services' AND visible=1").get().n,
    enquiries:db.prepare('SELECT COUNT(*) AS n FROM enquiries').get().n,
    newEnquiries:db.prepare("SELECT COUNT(*) AS n FROM enquiries WHERE status='new'").get().n,
    gallery:db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='gallery'").get().n,
    recent:db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 5').all(),
  }));
  app.get('/api/admin/settings',(_req,res)=>res.json(settings(db)));
  app.put('/api/admin/settings',(req,res)=>{
    const data=settingsSchema.parse(req.body);
    db.prepare('UPDATE settings SET payload=? WHERE id=1').run(JSON.stringify(data));
    res.json(data);
  });
  app.get('/api/admin/enquiries',(_req,res)=>res.json(db.prepare('SELECT * FROM enquiries ORDER BY created_at DESC').all()));
  app.patch('/api/admin/enquiries/:id',(req,res)=>{
    const {status}=z.object({status:z.enum(['new','contacted','confirmed','completed','cancelled'])}).parse(req.body);
    const result=db.prepare('UPDATE enquiries SET status=? WHERE id=?').run(status,req.params.id);
    if (!result.changes) return res.status(404).json({error:'Enquiry not found.'});
    res.json({ok:true});
  });
  app.delete('/api/admin/enquiries/:id',(req,res)=>{
    const result=db.prepare('DELETE FROM enquiries WHERE id=?').run(req.params.id);
    if (!result.changes) return res.status(404).json({error:'Enquiry not found.'});
    res.json({ok:true});
  });
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:0}});
  app.post('/api/admin/upload',upload.single('image'),async(req,res)=>{
    if (!req.file) return res.status(400).json({error:'Choose an image to upload.'});
    try {
      const photo=sharp(req.file.buffer,{limitInputPixels:40_000_000});
      const metadata=await photo.metadata();
      if (!['jpeg','png','webp','avif'].includes(metadata.format)) return res.status(400).json({error:'Use a JPG, PNG, WebP or AVIF image.'});
      const filename=`${randomUUID()}.webp`;
      await photo.rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toFile(join(uploadDir,filename));
      res.status(201).json({url:`/uploads/${filename}`});
    } catch { res.status(400).json({error:'This photo could not be processed. Use a JPG, PNG, WebP or AVIF under 8 MB.'}); }
  });
  app.param('kind',(req,res,next,kind)=>{
    if (!Object.hasOwn(schemas,kind)) return res.status(404).json({error:'Content type not found.'});
    next();
  });
  app.get('/api/admin/content/:kind',(req,res)=>res.json(listRecords(db,req.params.kind)));
  app.post('/api/admin/content/:kind',(req,res)=>{
    const data=schemas[req.params.kind].parse(req.body), id=randomUUID(), now=new Date().toISOString();
    db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?)').run(id,req.params.kind,JSON.stringify(data),+data.visible,data.order,now,now);
    res.status(201).json({...data,id,updatedAt:now});
  });
  app.put('/api/admin/content/:kind/:id',(req,res)=>{
    const data=schemas[req.params.kind].parse(req.body), now=new Date().toISOString();
    const result=db.prepare('UPDATE records SET payload=?,visible=?,sort_order=?,updated_at=? WHERE id=? AND kind=?').run(JSON.stringify(data),+data.visible,data.order,now,req.params.id,req.params.kind);
    if (!result.changes) return res.status(404).json({error:'This item no longer exists.'});
    res.json({...data,id:req.params.id,updatedAt:now});
  });
  app.patch('/api/admin/content/:kind/:id/visibility',(req,res)=>{
    const {visible}=z.object({visible:z.boolean()}).parse(req.body);
    const record=db.prepare('SELECT payload FROM records WHERE id=? AND kind=?').get(req.params.id,req.params.kind);
    if (!record) return res.status(404).json({error:'This item no longer exists.'});
    const data={...JSON.parse(record.payload),visible};
    db.prepare('UPDATE records SET payload=?,visible=?,updated_at=? WHERE id=? AND kind=?').run(JSON.stringify(data),+visible,new Date().toISOString(),req.params.id,req.params.kind);
    res.json({...data,id:req.params.id});
  });
  app.delete('/api/admin/content/:kind/:id',(req,res)=>{
    const result=db.prepare('DELETE FROM records WHERE id=? AND kind=?').run(req.params.id,req.params.kind);
    if (!result.changes) return res.status(404).json({error:'This item no longer exists.'});
    res.json({ok:true});
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  app.use((error,_req,res,_next)=>{
    if (error instanceof ZodError) return res.status(400).json({error:error.issues.map(i=>`${i.path.join('.') || 'Form'}: ${i.message}`).join(' ')});
    if (error instanceof multer.MulterError) return res.status(400).json({error:'Upload one image under 8 MB.'});
    if (error.type==='entity.parse.failed') return res.status(400).json({error:'Invalid JSON request.'});
    if (error.type==='entity.too.large') return res.status(413).json({error:'This request is too large.'});
    console.error('Request failed:',error);
    res.status(500).json({error:'Something went wrong. Your changes were not saved. Please try again.'});
  });
  return app;
}

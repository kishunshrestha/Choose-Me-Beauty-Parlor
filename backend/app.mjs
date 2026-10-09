import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import sharp from 'sharp';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { z, ZodError } from 'zod';
import { dbGet, dbAll, dbRun, listRecords, settings } from './database.mjs';
import { checkPassword, digest, hashPassword, rateLimit } from './security.mjs';
import { schemas, settingsSchema, enquirySchema } from './validation.mjs';

export function createApp(db, options = {}) {
  const app = express();
  const origin = options.origin || process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
  const secure = options.secure ?? process.env.COOKIE_SECURE === 'true';
  const uploadDir = resolve(options.dataDir || process.env.DATA_DIR || './data', 'uploads');
  mkdirSync(uploadDir, {recursive:true});
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy:{directives:{
      defaultSrc:["'self'"],scriptSrc:["'self'",...(options.dev?["'unsafe-inline'"]:[])],
      styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],
      fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:','blob:','https:'],
      connectSrc:["'self'",...(options.dev?['ws://localhost:*','ws://127.0.0.1:*']:[])],
      frameSrc:['https://www.tiktok.com','https://www.google.com'],objectSrc:["'none'"],baseUri:["'self'"],formAction:["'self'"],
      upgradeInsecureRequests:secure?[]:null,
    }},crossOriginEmbedderPolicy:false,strictTransportSecurity:secure?undefined:false
  }));
  app.use(express.json({limit:'48kb'}));
  app.use('/api',(req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)){
      if(req.headers.origin&&req.headers.origin!==origin)return res.status(403).json({error:'This request is not allowed.'});
      const contentType=req.get('content-type')||'';
      const hasBody=Number(req.get('content-length')||0)>0||Boolean(req.get('transfer-encoding'));
      if(hasBody&&!/^application\/json(?:\s*;|$)/i.test(contentType)&&!/^multipart\/form-data(?:\s*;|$)/i.test(contentType))return res.status(415).json({error:'Send JSON or a photo upload.'});
    }
    next();
  });
  if(db.dialect!=='postgres') app.use('/uploads',express.static(uploadDir,{maxAge:'7d',dotfiles:'deny',index:false,setHeaders(res){res.set('X-Content-Type-Options','nosniff');}}));
  app.get('/uploads/:filename',async(req,res,next)=>{
    try {
      const filename=basename(req.params.filename);
      if(!/^[\w-]+\.webp$/.test(filename))return res.sendStatus(404);
      if(db.dialect!=='postgres')return next();
      const row=await dbGet(db,'SELECT content_type,image_data FROM media_uploads WHERE id=?',[filename]);
      if(!row)return res.sendStatus(404);
      res.set('Cache-Control','public, max-age=31536000, immutable').type(row.content_type).send(row.image_data);
    }catch(e){next(e);}
  });
  const auth=async(req,res,next)=>{
    try{
      const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('chooseme_session='))?.slice(17);
      const row=token&&await dbGet(db,'SELECT * FROM sessions WHERE token_hash=? AND expires_at>?',[digest(token),Date.now()]);
      if(!row)return res.status(401).json({error:'Please sign in to continue.'});
      req.session=row;
      if(!['GET','HEAD'].includes(req.method)&&req.headers['x-csrf-token']!==row.csrf)return res.status(403).json({error:'Your security token expired. Refresh and try again.'});
      next();
    }catch(e){next(e);}
  };
  const cookieOptions={httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:8*60*60*1000};
  app.get('/api/health',(_req,res)=>res.json({ok:true}));
  app.get('/api/site',async(_req,res)=>res.json({settings:await settings(db),...Object.fromEntries(await Promise.all(Object.keys(schemas).map(async kind=>[kind,await listRecords(db,kind,true)])))}));
  app.post('/api/login',rateLimit(db,'login',10,15*60*1000),async(req,res)=>{
    const input=z.object({email:z.string().email().max(254),password:z.string().min(1).max(200)}).parse(req.body);
    const admin=await dbGet(db,'SELECT * FROM admin WHERE id=1');
    const valid=admin&&await checkPassword(input.password,admin.password_hash);
    if(!valid||input.email.toLowerCase()!==admin.email.toLowerCase())return res.status(401).json({error:'The email or password is incorrect.'});
    await dbRun(db,'DELETE FROM sessions WHERE expires_at<?',[Date.now()]);
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
    await dbRun(db,'INSERT INTO sessions (token_hash,csrf,expires_at) VALUES (?,?,?)',[digest(token),csrf,Date.now()+cookieOptions.maxAge]);
    res.cookie('chooseme_session',token,cookieOptions).json({email:admin.email,csrf});
  });
  app.post('/api/enquiries',rateLimit(db,'enquiry',6,10*60*1000),async(req,res)=>{
    const input=enquirySchema.parse(req.body);
    if(input.website)return res.status(400).json({error:'Please submit the form again.'});
    let subject='General appointment enquiry';
    const id=input.serviceId||input.courseId;
    if(id){
      const kind=input.serviceId?'services':'courses';
      const record=await dbGet(db,'SELECT payload FROM records WHERE id=? AND kind=? AND visible=1',[id,kind]);
      if(!record)return res.status(400).json({error:'This service or course is no longer available. Please choose another.'});
      subject=(kind==='courses'?'Course: ':'')+JSON.parse(record.payload).title;
    }
    await dbRun(db,'INSERT INTO enquiries (id,name,phone,subject,preferred_date,message,created_at) VALUES (?,?,?,?,?,?,?)',[randomUUID(),input.name,input.phone,subject,input.preferredDate,input.message,new Date().toISOString()]);
    res.status(201).json({message:'Your enquiry has been received. We’ll contact you to discuss availability. Your appointment is not yet confirmed.'});
  });
  app.use('/api/admin',auth);
  app.get('/api/admin/session',async(req,res)=>res.json({email:(await dbGet(db,'SELECT email FROM admin WHERE id=1')).email,csrf:req.session.csrf}));
  app.post('/api/admin/logout',async(req,res)=>{
    await dbRun(db,'DELETE FROM sessions WHERE token_hash=?',[req.session.token_hash]);
    res.clearCookie('chooseme_session',{httpOnly:true,sameSite:'strict',secure,path:'/'}).json({ok:true});
  });
  app.post('/api/admin/password',rateLimit(db,'password',8,15*60*1000),async(req,res)=>{
    const input=z.object({currentPassword:z.string().min(1).max(200),newPassword:z.string().min(12,'Use at least 12 characters.').max(200)}).parse(req.body);
    const admin=await dbGet(db,'SELECT * FROM admin WHERE id=1');
    if(!await checkPassword(input.currentPassword,admin.password_hash))return res.status(400).json({error:'Your current password is incorrect.'});
    await dbRun(db,'UPDATE admin SET password_hash=? WHERE id=1',[await hashPassword(input.newPassword)]);
    await dbRun(db,'DELETE FROM sessions WHERE token_hash<>?',[req.session.token_hash]);
    res.json({ok:true});
  });
  app.get('/api/admin/overview',async(_req,res)=>{
    const [services,visibleServices,enquiries,newEnquiries,gallery,recent]=await Promise.all([
      dbGet(db,"SELECT COUNT(*) AS n FROM records WHERE kind='services'"),
      dbGet(db,"SELECT COUNT(*) AS n FROM records WHERE kind='services' AND visible=1"),
      dbGet(db,'SELECT COUNT(*) AS n FROM enquiries'),
      dbGet(db,"SELECT COUNT(*) AS n FROM enquiries WHERE status='new'"),
      dbGet(db,"SELECT COUNT(*) AS n FROM records WHERE kind='gallery'"),
      dbAll(db,'SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 5')
    ]);
    res.json({services:Number(services.n),visibleServices:Number(visibleServices.n),enquiries:Number(enquiries.n),newEnquiries:Number(newEnquiries.n),gallery:Number(gallery.n),recent});
  });
  app.get('/api/admin/settings',async(_req,res)=>res.json(await settings(db)));
  app.put('/api/admin/settings',async(req,res)=>{
    const data=settingsSchema.parse(req.body);
    await dbRun(db,'UPDATE settings SET payload=? WHERE id=1',[JSON.stringify(data)]);
    res.json(data);
  });
  app.get('/api/admin/enquiries',async(_req,res)=>res.json(await dbAll(db,'SELECT * FROM enquiries ORDER BY created_at DESC')));
  app.patch('/api/admin/enquiries/:id',async(req,res)=>{
    const {status}=z.object({status:z.enum(['new','contacted','confirmed','completed','cancelled'])}).parse(req.body);
    const result=await dbRun(db,'UPDATE enquiries SET status=? WHERE id=?',[status,req.params.id]);
    if(!result.changes)return res.status(404).json({error:'Enquiry not found.'});
    res.json({ok:true});
  });
  app.delete('/api/admin/enquiries/:id',async(req,res)=>{
    const result=await dbRun(db,'DELETE FROM enquiries WHERE id=?',[req.params.id]);
    if(!result.changes)return res.status(404).json({error:'Enquiry not found.'});
    res.json({ok:true});
  });
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:0}});
  app.post('/api/admin/upload',upload.single('image'),async(req,res)=>{
    if(!req.file)return res.status(400).json({error:'Choose an image to upload.'});
    try{
      const photo=sharp(req.file.buffer,{limitInputPixels:40_000_000});
      const metadata=await photo.metadata();
      if(!['jpeg','png','webp','avif'].includes(metadata.format))return res.status(400).json({error:'Use a JPG, PNG, WebP or AVIF image.'});
      const filename=`${randomUUID()}.webp`;
      const buffer=await photo.rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
      if(db.dialect==='postgres')await dbRun(db,'INSERT INTO media_uploads (id,content_type,image_data,created_at) VALUES (?,?,?,?)',[filename,'image/webp',buffer,new Date().toISOString()]);
      else writeFileSync(join(uploadDir,filename),buffer,{mode:0o600});
      res.status(201).json({url:`/uploads/${filename}`});
    }catch{res.status(400).json({error:'This photo could not be processed. Use a JPG, PNG, WebP or AVIF under 8 MB.'});}
  });
  app.param('kind',(req,res,next,kind)=>{if(!Object.hasOwn(schemas,kind))return res.status(404).json({error:'Content type not found.'});next();});
  app.get('/api/admin/content/:kind',async(req,res)=>res.json(await listRecords(db,req.params.kind)));
  app.post('/api/admin/content/:kind',async(req,res)=>{
    const data=schemas[req.params.kind].parse(req.body),id=randomUUID(),now=new Date().toISOString();
    await dbRun(db,'INSERT INTO records (id,kind,payload,visible,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',[id,req.params.kind,JSON.stringify(data),+data.visible,data.order,now,now]);
    res.status(201).json({...data,id,updatedAt:now});
  });
  app.put('/api/admin/content/:kind/:id',async(req,res)=>{
    const data=schemas[req.params.kind].parse(req.body),now=new Date().toISOString();
    const result=await dbRun(db,'UPDATE records SET payload=?,visible=?,sort_order=?,updated_at=? WHERE id=? AND kind=?',[JSON.stringify(data),+data.visible,data.order,now,req.params.id,req.params.kind]);
    if(!result.changes)return res.status(404).json({error:'This item no longer exists.'});
    res.json({...data,id:req.params.id,updatedAt:now});
  });
  app.patch('/api/admin/content/:kind/:id/visibility',async(req,res)=>{
    const {visible}=z.object({visible:z.boolean()}).parse(req.body);
    const record=await dbGet(db,'SELECT payload FROM records WHERE id=? AND kind=?',[req.params.id,req.params.kind]);
    if(!record)return res.status(404).json({error:'This item no longer exists.'});
    const data={...JSON.parse(record.payload),visible};
    await dbRun(db,'UPDATE records SET payload=?,visible=?,updated_at=? WHERE id=? AND kind=?',[JSON.stringify(data),+visible,new Date().toISOString(),req.params.id,req.params.kind]);
    res.json({...data,id:req.params.id});
  });
  app.delete('/api/admin/content/:kind/:id',async(req,res)=>{
    const result=await dbRun(db,'DELETE FROM records WHERE id=? AND kind=?',[req.params.id,req.params.kind]);
    if(!result.changes)return res.status(404).json({error:'This item no longer exists.'});
    res.json({ok:true});
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  app.use((error,_req,res,_next)=>{
    if(error instanceof ZodError)return res.status(400).json({error:error.issues.map(i=>`${i.path.join('.')||'Form'}: ${i.message}`).join(' ')});
    if(error instanceof multer.MulterError)return res.status(400).json({error:'Upload one image under 8 MB.'});
    if(error.type==='entity.parse.failed')return res.status(400).json({error:'Invalid JSON request.'});
    if(error.type==='entity.too.large')return res.status(413).json({error:'This request is too large.'});
    console.error('Request failed:',error);
    res.status(500).json({error:'Something went wrong. Your changes were not saved. Please try again.'});
  });
  return app;
}

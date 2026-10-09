import express from 'express';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { openDatabase, settings } from './database.mjs';
import { bootstrapAdmin } from './security.mjs';
import { createApp } from './app.mjs';

const dev=process.argv.includes('--dev');
const port=Number(process.env.PORT || 3000), host=process.env.HOST || '127.0.0.1';
const dataDir=resolve(process.env.DATA_DIR || 'data');
const db=openDatabase(resolve(dataDir,'chooseme.sqlite'));
await bootstrapAdmin(db,resolve('ADMIN-ACCESS.txt'),process.env.ADMIN_EMAIL);
const app=createApp(db,{dev,dataDir});
app.get('/robots.txt',(_req,res)=>res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n'));
app.get('/sitemap.xml',(_req,res)=>{
  const origin=process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(origin)}</loc></url></urlset>`);
});
function escapeHtml(value) {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function render(html,admin) {
  const site=settings(db);
  const title=admin ? 'Studio Admin | Choose Me' : `${site.name} | Dhulabari, Nepal`;
  const schema={ '@context':'https://schema.org','@type':'BeautySalon',name:site.name,telephone:site.internationalPhone,address:{'@type':'PostalAddress',streetAddress:site.address,addressLocality:'Dhulabari',addressCountry:'NP'}};
  const structured=JSON.stringify(schema).replace(/</g,'\\u003c');
  return html.replace(/<title>.*?<\/title>/,`<title>${escapeHtml(title)}</title>`).replace('</head>',`${admin?'<meta name="robots" content="noindex,nofollow">':`<script type="application/ld+json">${structured}</script>`}</head>`);
}
let vite;
if (dev) {
  const {createServer}=await import('vite');
  vite=await createServer({server:{middlewareMode:true},appType:'custom'});
  app.use(vite.middlewares);
  app.get(['/', '/admin'],async(req,res,next)=>{
    try {res.type('html').send(render(await vite.transformIndexHtml(req.originalUrl,readFileSync(resolve('frontend/index.html'),'utf8')),req.path==='/admin'));}
    catch(e){vite.ssrFixStacktrace(e);next(e);}
  });
} else {
  if (!existsSync(resolve('dist/index.html'))) throw new Error('Build the frontend first: npm run build');
  app.use(express.static(resolve('dist'),{index:false,maxAge:'1h'}));
  app.get(['/', '/admin'],(req,res)=>res.set('Cache-Control','no-cache').type('html').send(render(readFileSync(resolve('dist/index.html'),'utf8'),req.path==='/admin')));
}
app.use((_req,res)=>res.status(404).type('html').send('<h1>Page not found</h1><a href="/">Return to Choose Me</a>'));
const server=app.listen(port,host,()=>{
  console.log(`Choose Me is ready at http://localhost:${port}`);
  console.log(`Admin: http://localhost:${port}/admin — sign-in details are in ADMIN-ACCESS.txt`);
});
async function shutdown(){server.close();await vite?.close();db.close();process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);

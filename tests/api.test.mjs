import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { openDatabase } from '../backend/database.mjs';
import { bootstrapAdmin } from '../backend/security.mjs';
import { createApp } from '../backend/app.mjs';

let directory, db, server, base, cookie, csrf, credentials;
const origin='http://localhost:3000';
async function request(path,{method='GET',body,admin=false,headers={}}={}) {
  const multipart=body instanceof FormData;
  const response=await fetch(base+path,{method,headers:{Origin:origin,...(body&&!multipart?{'Content-Type':'application/json'}:{}),...(admin?{Cookie:cookie,'X-CSRF-Token':csrf}:{}),...headers},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});
  return {status:response.status,data:await response.json(),headers:response.headers};
}
before(async()=>{
  directory=mkdtempSync(join(tmpdir(),'chooseme-tests-'));
  db=openDatabase(join(directory,'test.sqlite'));
  await bootstrapAdmin(db,join(directory,'access.txt'),'owner@example.com');
  credentials={email:'owner@example.com',password:readFileSync(join(directory,'access.txt'),'utf8').match(/Password: (.*)/)[1]};
  server=createApp(db,{origin,dataDir:directory}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(directory,{recursive:true,force:true});});
test('public services are seeded; private data is protected',async()=>{
  const site=await request('/api/site');
  assert.equal(site.status,200);assert.equal(site.data.services.length,12);assert.equal(site.data.courses.length,5);
  assert.equal(site.data.testimonials.length,0);assert.equal(site.data.gallery.length,0);
  assert.equal((await request('/api/admin/content/services')).status,401);
  assert.equal((await request('/api/admin/enquiries')).status,401);
  assert.equal((await request('/api/admin/settings',{method:'PUT',body:{}})).status,401);
});
test('login, secure session attributes and CSRF/origin protection',async()=>{
  assert.equal((await request('/api/login',{method:'POST',body:{...credentials,password:'incorrect'}})).status,401);
  const login=await request('/api/login',{method:'POST',body:credentials});
  assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];csrf=login.data.csrf;
  assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
  assert.equal((await request('/api/admin/session',{admin:true})).status,200);
  assert.equal((await request('/api/admin/content/services',{method:'POST',admin:true,headers:{'X-CSRF-Token':'wrong'},body:{}})).status,403);
  assert.equal((await request('/api/admin/content/services',{method:'POST',admin:true,headers:{Origin:'https://attacker.invalid'},body:{}})).status,403);
});
test('service CRUD: publish, hide, restore, update, persist, delete',async()=>{
  const service={title:'QA Beauty Service',description:'A real database integration test.',category:'Makeup',price:'NPR 1,000',duration:'45 minutes',image:'',icon:'brush',visible:true,order:20};
  const created=await request('/api/admin/content/services',{method:'POST',body:service,admin:true});assert.equal(created.status,201);
  const id=created.data.id;
  assert.ok((await request('/api/site')).data.services.some(x=>x.id===id));
  assert.equal((await request(`/api/admin/content/services/${id}/visibility`,{method:'PATCH',body:{visible:false},admin:true})).status,200);
  assert.ok(!(await request('/api/site')).data.services.some(x=>x.id===id));
  assert.ok((await request('/api/admin/content/services',{admin:true})).data.some(x=>x.id===id&&!x.visible));
  assert.equal((await request('/api/enquiries',{method:'POST',body:{name:'Hidden test',phone:'9800000000',serviceId:id,preferredDate:'',message:''}})).status,400);
  assert.equal((await request(`/api/admin/content/services/${id}`,{method:'PUT',body:{...service,title:'Edited service',visible:true},admin:true})).status,200);
  const secondConnection=openDatabase(join(directory,'test.sqlite'));
  assert.equal(JSON.parse(secondConnection.prepare('SELECT payload FROM records WHERE id=?').get(id).payload).title,'Edited service');secondConnection.close();
  assert.equal((await request(`/api/admin/content/services/${id}`,{method:'DELETE',admin:true})).status,200);
  assert.ok(!(await request('/api/admin/content/services',{admin:true})).data.some(x=>x.id===id));
  assert.equal((await request(`/api/admin/content/services/${id}`,{method:'DELETE',admin:true})).status,404);
});
test('validation rejects bad payloads, protocol URLs, malformed TikTok links',async()=>{
  assert.equal((await request('/api/admin/content/services',{method:'POST',admin:true,body:{title:''}})).status,400);
  assert.equal((await request('/api/admin/content/tiktok',{method:'POST',admin:true,body:{title:'Bad',url:'https://evil.example/video/123',visible:true,order:1}})).status,400);
  assert.equal((await request('/api/admin/content/gallery',{method:'POST',admin:true,body:{title:'Bad',image:'javascript:alert(1)',alt:'Test',category:'Bridal',visible:true,order:1}})).status,400);
  const video=await request('/api/admin/content/tiktok',{method:'POST',admin:true,body:{title:'Test link',url:'https://www.tiktok.com/@test/video/123456789',visible:false,order:1}});
  assert.equal(video.status,201);assert.equal((await request('/api/site')).data.tiktok.length,0);
  assert.equal((await request('/api/admin/content/not-a-table',{admin:true})).status,404);
});
test('enquiry is saved and manageable, no hidden/private data leaks',async()=>{
  const service=(await request('/api/site')).data.services[0];
  const response=await request('/api/enquiries',{method:'POST',body:{name:'Test Client',phone:'+9779800000000',serviceId:service.id,preferredDate:'2099-01-01',message:'Please call me.',website:''}});
  assert.equal(response.status,201);assert.match(response.data.message,/not yet confirmed/);
  const rows=(await request('/api/admin/enquiries',{admin:true})).data;
  assert.equal(rows[0].name,'Test Client');assert.equal(rows[0].subject,service.title);assert.equal(rows[0].status,'new');
  assert.equal((await request(`/api/admin/enquiries/${rows[0].id}`,{method:'PATCH',admin:true,body:{status:'contacted'}})).status,200);
  assert.equal((await request('/api/admin/enquiries',{admin:true})).data[0].status,'contacted');
  assert.equal((await request(`/api/admin/enquiries/${rows[0].id}`,{method:'DELETE',admin:true})).status,200);
  assert.equal((await request('/api/enquiries',{method:'POST',body:{name:'Test',phone:'-------',preferredDate:'',message:''}})).status,400);
  assert.equal((await request('/api/enquiries',{method:'POST',body:{name:'Test',phone:'9800000000',preferredDate:'2099-02-30',message:''}})).status,400);
});
test('uploads are authenticated, validated and rewritten to WebP',async()=>{
  const picture=await sharp({create:{width:20,height:20,channels:3,background:'#c583a0'}}).png().toBuffer();
  const form=new FormData();form.append('image',new Blob([picture],{type:'image/png'}),'photo.png');
  const uploaded=await request('/api/admin/upload',{method:'POST',admin:true,body:form});
  assert.equal(uploaded.status,201);assert.match(uploaded.data.url,/^\/uploads\/[\w-]+\.webp$/);
  const file=await fetch(base+uploaded.data.url);assert.equal(file.status,200);assert.match(file.headers.get('content-type'),/image\/webp/);
  const bad=new FormData();bad.append('image',new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'],{type:'image/svg+xml'}),'bad.svg');
  assert.equal((await request('/api/admin/upload',{method:'POST',admin:true,body:bad})).status,400);
  const anonymous=new FormData();anonymous.append('image',new Blob([picture]),'photo.png');
  assert.equal((await request('/api/admin/upload',{method:'POST',body:anonymous})).status,401);
});
test('settings and account password updates persist; logout revokes session',async()=>{
  const settings=(await request('/api/admin/settings',{admin:true})).data;
  assert.equal((await request('/api/admin/settings',{method:'PUT',admin:true,body:{...settings,heroTitle:'Your beauty, your way.'}})).status,200);
  assert.equal((await request('/api/site')).data.settings.heroTitle,'Your beauty, your way.');
  assert.equal((await request('/api/admin/password',{method:'POST',admin:true,body:{currentPassword:'wrong',newPassword:'new-long-password-test'}})).status,400);
  assert.equal((await request('/api/admin/password',{method:'POST',admin:true,body:{currentPassword:credentials.password,newPassword:'new-long-password-test'}})).status,200);
  assert.equal((await request('/api/admin/logout',{method:'POST',admin:true})).status,200);
  assert.equal((await request('/api/admin/session',{admin:true})).status,401);
  assert.equal((await request('/api/login',{method:'POST',body:credentials})).status,401);
  assert.equal((await request('/api/login',{method:'POST',body:{...credentials,password:'new-long-password-test'}})).status,200);
});
test('login rate limit rejects excessive attempts',async()=>{
  db.prepare("DELETE FROM rate_limits WHERE key LIKE 'login:%'").run();
  for(let i=0;i<10;i++) assert.equal((await request('/api/login',{method:'POST',body:{email:'a@example.com',password:'bad'}})).status,401);
  assert.equal((await request('/api/login',{method:'POST',body:credentials})).status,429);
});

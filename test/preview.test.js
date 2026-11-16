'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),net=require('node:net'),{generateVAPIDKeys}=require('web-push');
test('disposable preview refuses production origins and ignores DATABASE_URL',async t=>{
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const keys=generateVAPIDKeys(),env={...process.env,PORT:String(port),DATABASE_URL:'postgresql://unused:unused@production.invalid/neondb',RESEND_API_KEY:'synthetic-provider-key',EMAIL_FROM:'synthetic@example.invalid',RECOVERY_TOKEN_KEY:'a'.repeat(64),ILKER_PREVIEW_PASSWORD:'synthetic-preview-password-only-12345',ILKER_PREVIEW_ORIGIN:'https://preview.invalid',ILKER_PREVIEW_VAPID_SUBJECT:'mailto:preview@example.invalid',ILKER_PREVIEW_VAPID_PUBLIC:keys.publicKey,ILKER_PREVIEW_VAPID_PRIVATE:keys.privateKey};
 const child=spawn(process.execPath,['scripts/preview-server.js'],{cwd:require('node:path').join(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});t.after(()=>child.kill('SIGTERM'));
 let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
 const deadline=Date.now()+10000;while(!output.includes('Isolated preview started')&&Date.now()<deadline){if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,50));}assert.match(output,/Isolated preview started/);
 const base='http://127.0.0.1:'+port;for(const url of ['/','/admin.html']){const res=await fetch(base+url);assert.equal(res.status,200);assert.match(await res.text(),/Synthetic data only/);assert.match(res.headers.get('x-robots-tag'),/noindex/);}
 const meta=await(await fetch(base+'/api/meta')).json();assert.equal(meta.management,true);assert.equal(meta.remindersEnabled,false);assert.equal((await(await fetch(base+'/api/admin/recovery/config')).json()).enabled,false);
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:env.ILKER_PREVIEW_ORIGIN},body:JSON.stringify({login:'owner',password:env.ILKER_PREVIEW_PASSWORD})});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/Secure/i);
 const denied=spawn(process.execPath,['scripts/preview-server.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...env,ILKER_PREVIEW_ORIGIN:'https://ilker-sevim.onrender.com'},stdio:'ignore'});const status=await new Promise(resolve=>denied.on('exit',resolve));assert.notEqual(status,0);
 const reused=spawn(process.execPath,['scripts/preview-server.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...env,VAPID_PUBLIC_KEY:keys.publicKey},stdio:'ignore'});assert.notEqual(await new Promise(resolve=>reused.on('exit',resolve)),0);
});

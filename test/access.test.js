'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createApp}=require('../server/app');
const {hashPassword,checkPassword}=require('../server/access-store');
const {mkdtempSync,rmSync}=require('node:fs');const {tmpdir}=require('node:os');const path=require('node:path');
const password='synthetic-owner-password';
async function setup(t,options={}){
 let clock=Date.parse('2030-01-01T00:00:00Z');
 const adminHash=await hashPassword(password);
 const runtime=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,now:()=>clock,production:false,vapid:{},adminHash,...options});
 const server=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await runtime.close();});const base='http://127.0.0.1:'+server.address().port;
 const request=async(route,body,session)=>{const response=await fetch(base+'/api/admin/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{Cookie:'rt_session='+session.raw,'X-CSRF-Token':session.csrf}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json(),headers:response.headers};};
 const owner=await runtime.access.login({password},'test-ip','iPhone Safari');
 return {runtime,request,owner,advance:ms=>clock+=ms};
}
async function employee(runtime,login='reception1'){
 const user=await runtime.access.saveUser('owner',{login,displayName:'Synthetic reception',role:'reception',active:true,newPassword:'synthetic-staff-password',currentPassword:password});
 const session=await runtime.access.login({login,password:'synthetic-staff-password'},login,'Android Chrome');return {user,session};
}
test('reception server permissions, CSRF, actor attribution and private account data',async t=>{
 const {runtime,request,owner}=await setup(t);const {user,session}=await employee(runtime);
 for(const route of ['users','audit','finance','revenue','finance/history/id','master-history'])assert.equal((await request(route,undefined,session)).status,403,route);
 for(const route of ['users','masters','rooms','catalog','duration','clients/anonymize','finance/adjust','delete'])assert.equal((await request(route,{},session)).status,403,route);
 for(const route of ['account','account/sessions','dashboard','clients','management','bookings','services','push/config'])assert.equal((await request(route,undefined,session)).status,200,route);
 assert.equal((await request('dashboard',undefined,session)).body.revenueMinor,undefined);
 for(const route of ['account/password','account/preferences','account/language','account/revoke','users']){
  assert.equal((await request(route,{}, {...owner,csrf:'invalid'})).status,403);assert.equal((await request(route,{})).status,401);
 }
 const created=await request('clients/save',{name:'Synthetic client',phone:'+994500000123',notes:'internal',requestKey:randomUUID(),actor:'owner'},session);assert.equal(created.status,200);
 const event=await runtime.db.prepare("SELECT actor FROM ilker_audit WHERE entity_id=? AND action='save'").get(created.body.id);assert.equal(event.actor,user.id);
 const exposed=JSON.stringify((await request('users',undefined,owner)).body);assert.ok(!exposed.includes('password_hash'));assert.ok(!exposed.includes(password));
 const devices=await request('account/sessions',undefined,session);assert.equal(devices.body.rows.length,1);assert.ok(!JSON.stringify(devices).includes(owner.raw));
});
test('password rotation revokes all sessions and push; environment hash cannot override persisted credentials',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ilker-auth-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'test.sqlite');
 const {runtime,request,owner}=await setup(t,{databasePath:file});
 const second=await runtime.access.login({password},'second-ip','Macintosh Safari');
 const sub={endpoint:'https://fcm.googleapis.com/synthetic-account-test',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}};
 await runtime.access.subscribe('owner',sub,require('node:crypto').createHash('sha256').update(owner.raw).digest('hex'));
 assert.equal((await request('account/password',{currentPassword:'wrong',newPassword:'new-synthetic-password'},owner)).status,403);
 const result=await request('account/password',{currentPassword:password,newPassword:'new-synthetic-password'},owner);assert.equal(result.status,200);assert.equal(result.body.signInRequired,true);
 assert.equal(await runtime.access.session(owner.raw),null);assert.equal(await runtime.access.session(second.raw),null);assert.equal(await runtime.access.deviceCount('owner'),0);
 await assert.rejects(runtime.access.login({password},'test-ip','Browser'),{status:401});
 const again=await createApp({databaseUrl:'',databasePath:file,management:true,preMigrated:true,production:false,vapid:{},adminHash:await hashPassword(password),now:()=>Date.parse('2030-01-01T00:00:00Z')});
 try{const login=await again.access.login({password:'new-synthetic-password'},'new-ip','Browser');assert.equal(login.user.id,'owner');assert.equal(await checkPassword(password,(await again.db.prepare("SELECT password_hash FROM ilker_users WHERE id='owner'").get()).password_hash),false);}finally{await again.close();}
});
test('safe user lifecycle and revoked request cannot write after authentication',async t=>{
 const {runtime,request,owner}=await setup(t);const {user,session}=await employee(runtime);
 await assert.rejects(runtime.access.saveUser('owner',{id:'owner',revision:1,login:'owner',displayName:'',role:'owner',active:false,currentPassword:password}),{status:409});
 await assert.rejects(runtime.access.saveUser('owner',{login:'reception1',displayName:'',role:'owner',active:true,newPassword:'synthetic-new-password',currentPassword:password}),{status:409});
 let release,entered;const ready=new Promise(r=>entered=r);const original=runtime.shop.saveClient;
 runtime.shop.saveClient=async(...args)=>{entered();await new Promise(r=>release=r);return original(...args);};
 const pending=request('clients/save',{name:'Must not be stored',phone:'+994500000124',requestKey:randomUUID()},session);await ready;
 await runtime.access.saveUser('owner',{id:user.id,revision:user.revision,login:user.login,displayName:user.display_name,role:'reception',active:false,currentPassword:password});release();
 assert.equal((await pending).status,401);assert.equal((await runtime.shop.clients()).count,0);assert.equal((await request('bookings',undefined,session)).status,401);
 assert.equal((await request('users',undefined,owner)).body.rows.find(u=>u.id===user.id).active,0);
});
test('shared database login throttling resets only after fixed cooldown',async t=>{
 const {runtime,advance}=await setup(t);
 for(let i=0;i<10;i++)await assert.rejects(runtime.access.login({login:'unknown-user',password:'wrong'},'attempt-ip',''),{status:401});
 await assert.rejects(runtime.access.login({login:'unknown-user',password:'wrong'},'different-ip',''),{status:429});
 assert.equal((await runtime.db.prepare('SELECT attempts FROM ilker_login_attempts WHERE attempts=10').all()).length>=1,true);
 advance(15*60000+1);await assert.rejects(runtime.access.login({login:'unknown-user',password:'wrong'},'attempt-ip',''),{status:401});
 // Unknown users and incorrect passwords produce the same externally visible error.
 const wrong=await runtime.access.login({password:'wrong'},'other-ip','').catch(e=>e);assert.equal(wrong.message,'Неверный логин или пароль.');
});
test('push ownership, per-user language/privacy and individual session revocation',async t=>{
 const sent=[],webpush=require('web-push'),keys=webpush.generateVAPIDKeys();
 const {runtime,request,owner}=await setup(t,{vapid:{subject:'mailto:synthetic@example.invalid',publicKey:keys.publicKey,privateKey:keys.privateKey},pushSend:async(sub,payload)=>sent.push(JSON.parse(payload))});
 const {user,session}=await employee(runtime);const sub={endpoint:'https://fcm.googleapis.com/synthetic-private-test',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}};
 assert.equal((await request('push/subscribe',{subscription:sub},session)).status,200);
 assert.equal((await request('push/subscribe',{subscription:sub},owner)).status,409);
 await request('push/unsubscribe',{endpoint:sub.endpoint},owner);assert.equal(await runtime.access.deviceCount(user.id),1);
 assert.equal((await request('push/test',{endpoint:sub.endpoint},owner)).status,400);
 await request('account/preferences',{language:'az',pushPrivate:true},session);assert.equal((await request('push/test',{endpoint:sub.endpoint},session)).status,200);assert.equal(sent[0].body,'Push bildirişinin yoxlanılması');
 assert.equal((await request('account/language',{language:'en'},session)).body.user.language,'en');assert.equal((await request('account/preferences',{pushPrivate:true},session)).body.user.language,'en');assert.equal((await request('account/language',{language:'az'},session)).body.user.push_private,1);assert.equal((await request('account/language',{language:'tr'},session)).status,400);
 const ownerSub={...sub,endpoint:sub.endpoint+'-owner'};await request('push/subscribe',{subscription:ownerSub},owner);await request('account/preferences',{language:'en',pushPrivate:false},owner);
 await runtime.shop.setDuration('haircut','zal',60);const master=(await runtime.shop.masters()).find(m=>m.id==='master-1');await runtime.shop.saveMaster({id:master.id,revision:master.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});
 await runtime.shop.book({name:'Synthetic private client',phone:'+994500000125',date:'2030-01-02',time:'11:00',masterId:master.id,serviceIds:['haircut'],room:'zal',requestKey:randomUUID()});await runtime.drainOutbox();
 const generic=sent.find(p=>p.title==='Yeni rezervasiya · İlker Sevim'),detailed=sent.find(p=>p.title==='New booking · İlker Sevim');assert.equal(generic.body,'Ətraflı məlumat üçün paneli açın.');assert.match(detailed.body,/11:00–12:00/);assert.ok(!JSON.stringify(sent).includes('Synthetic private client'));assert.ok(!JSON.stringify(sent).includes('+994500000125'));
 const row=(await request('account/sessions',undefined,session)).body.rows[0];assert.equal((await request('account/revoke',{id:row.id,currentPassword:'synthetic-staff-password'},session)).status,200);
 assert.equal(await runtime.access.deviceCount(user.id),0);assert.equal(await runtime.access.session(session.raw),null);
 await request('logout',{},owner);assert.equal(await runtime.access.deviceCount('owner'),0);
});
test('legacy owner credential, sessions and subscriptions survive the explicit migration',async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ilker-legacy-access-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'test.sqlite');const adminHash=await hashPassword(password),now=()=>Date.parse('2030-01-01T00:00:00Z');
 const legacy=await createApp({databaseUrl:'',databasePath:file,management:false,production:false,vapid:{},adminHash,now});const raw='a'.repeat(64),hash=require('node:crypto').createHash('sha256').update(raw).digest('hex');
 await legacy.db.prepare('INSERT INTO ilker_sessions(token_hash,csrf,expires) VALUES(?,?,?)').run(hash,'synthetic-csrf',now()+3600000);
 await legacy.db.prepare('INSERT INTO ilker_push_subscriptions(id,endpoint,subscription,created_at) VALUES(?,?,?,?)').run('legacy-device','https://fcm.googleapis.com/synthetic-legacy','{}',now());await legacy.close();
 const modern=await createApp({databaseUrl:'',databasePath:file,management:true,migrateManagement:true,production:false,vapid:{},adminHash,now});try{
  assert.equal((await modern.access.session(raw)).user.id,'owner');assert.equal(await modern.access.deviceCount('owner'),1);assert.equal((await modern.access.login({password},'migration-ip','')).user.role,'owner');assert.equal((await modern.access.users('owner')).length,1);
 }finally{await modern.close();}
});
test('current-password proofs have a durable separate attempt limit',async t=>{
 const {runtime,advance}=await setup(t);
 for(let i=0;i<5;i++)await assert.rejects(runtime.access.changePassword('owner',{currentPassword:'wrong',newPassword:'synthetic-updated-password'}),{status:403});
 await assert.rejects(runtime.access.changePassword('owner',{currentPassword:password,newPassword:'synthetic-updated-password'}),{status:429});
 advance(900001);assert.equal((await runtime.access.changePassword('owner',{currentPassword:password,newPassword:'synthetic-updated-password'})).ok,true);
});

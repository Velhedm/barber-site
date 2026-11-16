'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createApp}=require('../server/app'),{hashPassword}=require('../server/access-store');
test('owner settings take effect without restart and preserve visits and safe retries',async t=>{
 let clock=Date.parse('2030-01-01T00:00:00Z');const r=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,vapid:{},adminHash:await hashPassword('synthetic-owner-password'),now:()=>clock});t.after(()=>r.close());
 await r.shop.setDuration('haircut','zal',60);const m=(await r.shop.masters())[0];await r.shop.saveMaster({id:m.id,revision:m.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});
 const get=()=>r.db.prepare('SELECT name,phone,online,cancel_minutes,revision FROM ilker_business_settings WHERE id=1').get();
 const settings=await get(),payload={name:'Synthetic Client',phone:'+994500000111',date:'2030-01-02',time:'12:00',masterId:m.id,serviceIds:['haircut'],room:'zal',requestKey:randomUUID()};
 const b=await r.shop.book(payload);let session=await r.access.login({password:'synthetic-owner-password'},'synthetic','');const server=r.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;
 async function save(body){const res=await fetch(base+'/api/admin/business',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'rt_session='+session.raw,'X-CSRF-Token':session.csrf},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};}
 const data={name:'Synthetic Salon',phone:'+994 55 111 22 33',online:false,cancel_minutes:120,revision:settings.revision};assert.equal((await save(data)).status,200);assert.equal((await save(data)).status,409);
 const meta=await (await fetch(base+'/api/meta')).json();assert.equal(meta.business.name,'Synthetic Salon');assert.equal(meta.business.online,false);assert.equal((await r.shop.book(payload)).id,b.id);
 await assert.rejects(r.shop.book({...payload,requestKey:randomUUID(),time:'14:00'}),{message:'Online booking unavailable'});assert.equal((await r.shop.getBooking(b.id)).status,'active');
 clock=Date.parse('2030-01-02T06:00:01Z');assert.deepEqual(await r.shop.cancelByClient(b.id,payload.requestKey),{ok:true}); // Existing booking retained its original zero-minute cutoff.
 session=await r.access.login({password:'synthetic-owner-password'},'synthetic-again','');let current=await get();assert.equal((await save({...data,online:true,revision:current.revision})).status,200);
 await assert.rejects(r.shop.book({...payload,requestKey:randomUUID(),time:'14:00',expectedCancellationMinutes:0}),{message:'Cancellation policy changed'});
 const later={...payload,requestKey:randomUUID(),time:'14:00'},b2=await r.shop.book(later);current=await get();assert.equal((await save({...data,online:true,cancel_minutes:0,revision:current.revision})).status,200);
 clock=Date.parse('2030-01-02T08:00:01Z');await assert.rejects(r.shop.cancelByClient(b2.id,later.requestKey),{message:'Cancellation unavailable'}); // Newer setting cannot rewrite the agreed policy.
 assert.equal((await save({...data,phone:'<script>',revision:current.revision+1})).status,400);
 const limited=await r.access.saveUser('owner',{login:'synthetic-staff',displayName:'Staff',role:'reception',active:true,newPassword:'synthetic-staff-password',currentPassword:'synthetic-owner-password'});
 const staff=await r.access.login({login:limited.login,password:'synthetic-staff-password'},'staff-ip','');
 assert.equal((await fetch(base+'/api/admin/business',{headers:{Cookie:'rt_session='+staff.raw}})).status,403);
 assert.equal((await fetch(base+'/api/admin/business',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'rt_session='+staff.raw,'X-CSRF-Token':staff.csrf},body:JSON.stringify(data)})).status,403);
});

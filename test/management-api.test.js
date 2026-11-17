'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {scryptSync,randomUUID}=require('node:crypto');const {createApp}=require('../server/app');
test('management API rejects unauthenticated, CSRF, cross-origin, invalid inputs; no PII in public results',async t=>{
 const salt='1234567890abcdef1234567890abcdef';
 const runtime=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,now:()=>Date.parse('2030-01-01T00:00:00Z'),production:false,vapid:{},adminHash:salt+':'+scryptSync('test-owner-password',salt,64).toString('hex')});
 const server=runtime.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));await runtime.close();});const base='http://127.0.0.1:'+server.address().port;
 async function request(path,body,headers={}){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,headers:response.headers,data:await response.json()};}
 for(const route of ['management','clients','finance','dashboard'])assert.equal((await request('/api/admin/'+route)).status,401);
 const login=await request('/api/admin/login',{password:'test-owner-password'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0],auth={Cookie:cookie,'X-CSRF-Token':login.data.csrf};
 assert.match(login.headers.get('set-cookie'),/HttpOnly/i);assert.match(login.headers.get('set-cookie'),/SameSite=Strict/i);
 for(const route of ['masters','rooms','catalog','master-block','master-exception','bookings/create','bookings/reschedule','bookings/status','bookings/comment','clients/save','clients/anonymize','finance/adjust','availability']){
  assert.equal((await request('/api/admin/'+route,{})).status,401);
  assert.equal((await request('/api/admin/'+route,{}, {Cookie:cookie})).status,403);
  assert.equal((await request('/api/admin/'+route,{}, {...auth,Origin:'https://untrusted.invalid'})).status,403);
 }
 assert.equal((await request('/api/bookings',null)).status,400);
 const settings=await request('/api/admin/management',undefined,auth);assert.equal(settings.data.masters.length,7);assert.equal(settings.headers.get('cache-control'),'no-store');
 const master=settings.data.masters[0];
 assert.equal((await request('/api/admin/duration',{serviceId:'haircut',room:'zal',minutes:90},auth)).status,200);
 const save=await request('/api/admin/masters',{id:master.id,name:'<img src=x onerror=alert(1)>',online:true,archived:false,revision:master.revision,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))},auth);assert.equal(save.status,200);
 const payload={name:'Private Test',phone:'+994500000003',date:'2030-01-02',time:'11:00',masterId:master.id,serviceIds:['haircut'],room:'zal',requestKey:randomUUID()};
 const result=await request('/api/bookings',payload);assert.equal(result.status,201);assert.equal(result.data.masterId,master.id);assert.equal(result.data.priceMin,3500);
 assert.equal(result.data.name,undefined);assert.equal(result.data.phone,undefined);assert.equal(result.data.requestKey,undefined);
 const available=await request('/api/availability?'+new URLSearchParams({date:payload.date,serviceIds:'haircut',room:'zal',masterId:master.id}));assert.equal(available.status,200);assert.equal(available.data.slots.find(s=>s.time==='11:00').status,'booked');assert.equal(JSON.stringify(available).includes('Private Test'),false);
 assert.equal((await request('/api/bookings/cancel',{id:result.data.id,token:randomUUID()})).status,404);
 assert.equal((await request('/api/bookings/cancel',{id:result.data.id,token:payload.requestKey},{Origin:'https://untrusted.invalid'})).status,403);
 const missingMaster=await request('/api/availability?date=2030-01-02&serviceIds=haircut&room=zal');assert.equal(missingMaster.status,409);assert.equal(missingMaster.data.error,'Booking mode changed');
 const list=await request('/api/admin/bookings',undefined,auth);assert.equal(list.data.rows[0].master_id,master.id);assert.equal(list.data.rows[0].request_key,undefined);
 assert.equal((await request('/api/bookings/cancel',{id:result.data.id,token:payload.requestKey})).status,200);
 assert.equal((await request('/api/bookings/cancel',{id:result.data.id,token:payload.requestKey})).status,200);
 const freed=await request('/api/availability?'+new URLSearchParams({date:payload.date,serviceIds:'haircut',room:'zal',masterId:master.id}));assert.equal(freed.data.slots.find(s=>s.time==='11:00').status,'available');
 assert.equal((await request('/api/admin/delete',{id:result.data.id},auth)).status,200);assert.ok(await runtime.db.prepare('SELECT id FROM ilker_appointments WHERE id=?').get(result.data.id));
});

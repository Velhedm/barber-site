'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {mkdtempSync,rmSync}=require('node:fs');const os=require('node:os');const path=require('node:path');const {scryptSync,randomUUID}=require('node:crypto');const {createApp}=require('../server/app');
const password='test-owner-password';const salt='1234567890abcdef1234567890abcdef';const adminHash=salt+':'+scryptSync(password,salt,64).toString('hex');
async function start(options){const runtime=createApp(options);const server=runtime.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 async function request(url,body,headers={}){const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {response,data:await response.json()};}
 return {...runtime,request,base,stop:async()=>{await new Promise(r=>server.close(r));runtime.close();}};}
const booking=()=>({date:'2030-01-02',time:'14:00',name:'Test Customer',phone:'+994501234567',serviceId:'haircut',requestKey:randomUUID()});
test('concurrent booking, idempotency, persistent data, private owner controls and atomic day blocks',async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'ruslan-test-'));const options={databasePath:path.join(dir,'test.sqlite'),bookingLimit:100,adminHash,now:()=>Date.parse('2030-01-01T10:30:00Z')};let app=await start(options);
 try{
  const requests=await Promise.all(Array.from({length:20},()=>app.request('/api/bookings',booking())));assert.equal(requests.filter(r=>r.response.status===201).length,1);assert.equal(requests.filter(r=>r.response.status===409).length,19);
  let result=await app.request('/api/availability?date=2030-01-02');assert.equal(result.data.slots.find(s=>s.time==='14:00').status,'booked');assert.equal(JSON.stringify(result.data).includes('Test Customer'),false);
  const own=booking();own.time='15:00';const first=await app.request('/api/bookings',own);const second=await app.request('/api/bookings',own);assert.equal(first.data.id,second.data.id);assert.equal(app.db.prepare('SELECT count(*) AS n FROM outbox').get().n,2);
  assert.equal((await app.request('/api/bookings',{...booking(),time:'14:30'})).response.status,400);assert.equal((await app.request('/api/bookings',{...booking(),date:'2030-01-01',time:'14:00'})).response.status,400);
  assert.equal((await app.request('/api/admin/day?date=2030-01-02')).response.status,401);
  const login=await app.request('/api/admin/login',{password});const cookie=login.response.headers.get('set-cookie').split(';')[0];const headers={Cookie:cookie,'X-CSRF-Token':login.data.csrf};
  assert.equal((await app.request('/api/admin/day',{date:'2030-01-02',closed:true},{Cookie:cookie})).response.status,403);
  assert.equal((await app.request('/api/admin/slot',{date:'2030-01-02',time:'14:00',blocked:false},headers)).response.status,409);
  assert.equal((await app.request('/api/admin/slot',{date:'2030-01-02',time:'11:00',blocked:true},headers)).response.status,200);assert.equal((await app.request('/api/bookings',{...booking(),time:'11:00'})).response.status,409);
  await app.request('/api/admin/slot',{date:'2030-01-02',time:'11:00',blocked:false},headers);assert.equal((await app.request('/api/bookings',{...booking(),time:'11:00'})).response.status,201);
  await app.request('/api/admin/day',{date:'2030-01-03',closed:true},headers);assert.equal((await app.request('/api/bookings',{...booking(),date:'2030-01-03'})).response.status,409);
  await app.request('/api/admin/day',{date:'2030-01-03',closed:false},headers);assert.equal((await app.request('/api/bookings',{...booking(),date:'2030-01-03'})).response.status,201);
  await app.request('/api/admin/cancel',{id:first.data.id},headers);assert.equal((await app.request('/api/availability?date=2030-01-02')).data.slots.find(s=>s.time==='15:00').status,'available');
  assert.equal((await app.request('/api/admin/day',{date:'2030-01-02',closed:true},{...headers,Origin:'https://evil.invalid'})).response.status,403);
  await app.stop();app=await start(options);assert.equal((await app.request('/api/availability?date=2030-01-02')).data.slots.find(s=>s.time==='14:00').status,'booked');
 }finally{await app.stop();rmSync(dir,{recursive:true,force:true});}
});
test('Telegram outbox survives failure and retries without losing the booking',async()=>{
 let clock=Date.parse('2030-01-01T10:30:00Z');let calls=0;let sent;
 const app=await start({databasePath:':memory:',adminHash,now:()=>clock,telegramToken:'test-token',chatId:'123',telegramFetch:async(url,options)=>{calls++;sent=JSON.parse(options.body);return {ok:calls>1,json:async()=>({ok:calls>1})};}});
 try{const result=await app.request('/api/bookings',booking());assert.equal(result.response.status,201);await app.drainOutbox();let row=app.db.prepare('SELECT * FROM outbox').get();assert.equal(row.attempts,1);assert.equal(row.sent_at,null);clock+=60000;await app.drainOutbox();row=app.db.prepare('SELECT * FROM outbox').get();assert.ok(row.sent_at);assert.match(sent.text,/14:00 - 15:00/);assert.equal(sent.chat_id,'123');await app.drainOutbox();assert.equal(calls,2);}finally{await app.stop();}
});

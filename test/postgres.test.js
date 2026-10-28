'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,scryptSync,randomBytes}=require('node:crypto');
const {generateVAPIDKeys}=require('web-push');
const {createDatabase}=require('../server/database');
const {createApp}=require('../server/app');
// Explicit opt-in: creates and removes its own isolated schema, never touches production bookings.
test('Neon: two servers, atomic reservations, owner controls, durable sessions and Push jobs', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const schema='rt_test_'+randomUUID().replaceAll('-','');
 const options={databaseUrl:process.env.TEST_DATABASE_URL,proxyUrl:process.env.HTTPS_PROXY};
 const control=await createDatabase(options);await control.exec('CREATE SCHEMA '+schema);
 const url=new URL(options.databaseUrl);url.hostname=url.hostname.replace('-pooler','');url.searchParams.set('options','-c search_path='+schema);
 const salt='1234567890abcdef1234567890abcdef';
 const configuration={...options,databaseUrl:url.href,bookingLimit:100,adminHash:salt+':'+scryptSync('test-owner-password',salt,64).toString('hex'),now:()=>Date.parse('2030-01-01T05:00:00Z'),vapid:{...generateVAPIDKeys(),subject:'mailto:test@example.com'},pushSend:async()=>({statusCode:201})};
 const instances=[];
 async function start(){const r=await createApp(configuration);const server=r.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const request=async(url,body,headers={})=>{const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,headers:response.headers,data:await response.json()};};
 const stop=async()=>{await new Promise(resolve=>server.close(resolve));await r.close();};const instance={...r,request,stop};instances.push(instance);return instance;}
 const booking=()=>({date:'2030-01-02',time:'14:00',name:'Test Customer',phone:'+994501234567',serviceId:'haircut',requestKey:randomUUID()});
 try{
  const a=await start(),b=await start();
  const login=await a.request('/api/admin/login',{password:'test-owner-password'});assert.equal(login.status,200);
  const headers={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};
  assert.equal((await b.request('/api/admin/session',undefined,headers)).status,200);
  const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test-neon',keys:{p256dh:generateVAPIDKeys().publicKey,auth:randomBytes(16).toString('base64url')}};
  assert.equal((await a.request('/api/admin/push/subscribe',{subscription:sub},headers)).status,200);
  const results=await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).request('/api/bookings',booking())));
  assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===409).length,19);
  const confirmed=results.find(r=>r.status===201).data;
  assert.equal((await b.request('/api/availability?date=2030-01-02')).data.slots.find(s=>s.time==='14:00').status,'booked');
  assert.equal((await a.db.prepare('SELECT count(*) AS n FROM push_deliveries').get()).n,1);
  await a.drainOutbox();assert.equal((await b.db.prepare('SELECT count(*) AS n FROM push_deliveries WHERE sent_at IS NOT NULL').get()).n,1);
  assert.equal((await b.request('/api/admin/bookings?q=Customer',undefined,headers)).data.count,1);
  await a.request('/api/admin/day',{date:'2030-01-03',closed:true},headers);
  assert.equal((await b.request('/api/bookings',{...booking(),date:'2030-01-03'})).status,409);
  await b.request('/api/admin/day',{date:'2030-01-03',closed:false},headers);
  const repeat={...booking(),date:'2030-01-03'};const one=await b.request('/api/bookings',repeat);assert.equal(one.status,201);assert.equal((await a.request('/api/bookings',repeat)).data.id,one.data.id);
  await a.request('/api/admin/slot',{date:'2030-01-04',time:'14:00',blocked:true},headers);
  assert.equal((await b.request('/api/bookings',{...booking(),date:'2030-01-04'})).status,409);
  await b.request('/api/admin/slot',{date:'2030-01-04',time:'14:00',blocked:false},headers);
  await a.request('/api/admin/cancel',{id:confirmed.id},headers);assert.equal((await b.request('/api/admin/delete',{id:confirmed.id},headers)).status,200);
  const c=await start();assert.equal((await c.request('/api/admin/session',undefined,headers)).status,200);assert.equal((await c.request('/api/availability?date=2030-01-03')).data.slots.find(s=>s.time==='14:00').status,'booked');
 }finally{await Promise.all(instances.map(i=>i.stop()));await control.exec('DROP SCHEMA '+schema+' CASCADE');await control.close();}
});

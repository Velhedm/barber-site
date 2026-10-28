'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID,randomBytes,scryptSync}=require('node:crypto');const {generateVAPIDKeys}=require('web-push');const {createApp}=require('../server/app');
const salt='1234567890abcdef1234567890abcdef';const adminHash=salt+':'+scryptSync('test-owner-password',salt,64).toString('hex');
const vapid={...generateVAPIDKeys(),subject:'mailto:test@example.com'};
function subscription(id){return {endpoint:'https://fcm.googleapis.com/fcm/send/'+id,expirationTime:null,keys:{p256dh:generateVAPIDKeys().publicKey,auth:randomBytes(16).toString('base64url')}};}
async function fixture(pushSend){let clock=Date.parse('2030-01-01T05:00:00Z');const r=await createApp({databasePath:':memory:',vapid,adminHash,now:()=>clock,pushSend});const server=r.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
const request=async(url,body,headers={})=>{const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,response,data:await response.json()};};
const login=await request('/api/admin/login',{password:'test-owner-password'});const headers={Cookie:login.response.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};
return {...r,base,headers,request,tick:()=>{clock+=3600000;},stop:async()=>{await new Promise(resolve=>server.close(resolve));await r.close();}};}
const booking=()=>({date:'2030-01-02',time:'14:00',name:'Private Customer',phone:'+994501234567',serviceId:'haircut',requestKey:randomUUID()});
test('owner-only subscriptions, endpoint validation, fan-out, retries, 410 cleanup and private payloads',async()=>{
const calls=[];let fail=true;const f=await fixture(async(sub,payload)=>{calls.push({endpoint:sub.endpoint,payload:JSON.parse(payload)});if(sub.endpoint.endsWith('/gone'))throw {statusCode:410};if(sub.endpoint.endsWith('/retry')&&fail)throw {statusCode:503};return {statusCode:201};});
try{
 assert.equal((await f.request('/api/admin/push/config')).status,401);assert.equal((await f.request('/api/admin/push/config',undefined,f.headers)).data.enabled,true);
 assert.equal((await f.request('/api/admin/push/subscribe',{subscription:subscription('valid')},{Cookie:f.headers.Cookie})).status,403);
 const bad=subscription('bad');bad.endpoint='https://127.0.0.1/internal';assert.equal((await f.request('/api/admin/push/subscribe',{subscription:bad},f.headers)).status,400);
 for(const id of ['ok','retry','gone'])assert.equal((await f.request('/api/admin/push/subscribe',{subscription:subscription(id)},f.headers)).status,200);
 const result=await f.request('/api/bookings',booking());assert.equal(result.status,201);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_deliveries').get()).n,3);
 await f.drainOutbox();assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get()).n,2);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_deliveries WHERE sent_at IS NOT NULL').get()).n,1);
 for(const call of calls){assert.equal(JSON.stringify(call.payload).includes('Private Customer'),false);assert.equal(JSON.stringify(call.payload).includes('+994501234567'),false);assert.match(call.payload.body,/14:00–15:00/);assert.match(call.payload.url,/^\/admin.html\?booking=/);}
 fail=false;f.tick();await f.drainOutbox();assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_deliveries WHERE sent_at IS NOT NULL').get()).n,2);
 const count=calls.length;await f.drainOutbox();assert.equal(calls.length,count);
 assert.equal((await f.request('/api/admin/bookings',undefined,f.headers)).data.rows[0].name,'Private Customer');assert.equal((await f.request('/api/admin/bookings')).status,401);
 assert.equal((await f.request('/api/admin/delete',{id:result.data.id},f.headers)).status,409);
 assert.equal((await f.request('/api/admin/cancel',{id:result.data.id},f.headers)).status,200);assert.equal((await f.request('/api/admin/bookings?status=cancelled',undefined,f.headers)).data.count,1);
 assert.equal((await f.request('/api/admin/delete',{id:result.data.id},f.headers)).status,200);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_events').get()).n,0);
 await f.request('/api/admin/logout',{endpoint:'https://fcm.googleapis.com/fcm/send/ok'},f.headers);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_subscriptions').get()).n,1);assert.equal((await f.request('/api/admin/bookings',undefined,f.headers)).status,401);
}finally{await f.stop();}});
test('no devices: booking succeeds without inventing notification delivery; cancel skips pending push',async()=>{
let sends=0;const f=await fixture(async()=>{sends++;return {statusCode:201};});try{
 const first=await f.request('/api/bookings',booking());assert.equal(first.status,201);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_events').get()).n,1);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_deliveries').get()).n,0);
 const sub=subscription('ok');await f.request('/api/admin/push/subscribe',{subscription:sub},f.headers);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_deliveries').get()).n,0);
 const second=await f.request('/api/bookings',{...booking(),time:'15:00'});await f.request('/api/admin/cancel',{id:second.data.id},f.headers);await f.drainOutbox();assert.equal(sends,0);
 await f.request('/api/admin/push/test',{endpoint:sub.endpoint},f.headers);assert.equal(sends,1);
 await f.request('/api/admin/push/unsubscribe',{endpoint:sub.endpoint},f.headers);assert.equal((await f.db.prepare('SELECT count(*) AS n FROM push_deliveries').get()).n,0);
}finally{await f.stop();}});

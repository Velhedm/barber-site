'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createApp}=require('../server/app'),{hashPassword}=require('../server/access-store');
async function setup(t){const r=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,vapid:{},adminHash:await hashPassword('synthetic-owner-password'),now:()=>Date.parse('2030-01-01T00:00:00Z')});t.after(()=>r.close());await r.shop.setDuration('haircut','zal',90);const server=r.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base='http://127.0.0.1:'+server.address().port;const request=async(url,body,headers={})=>{const response=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:response.status,headers:response.headers,data:await response.json()};};return {r,request};}
const booking=()=>({name:'Synthetic Client',phone:'+994500000117',date:'2030-01-02',time:'11:00',room:'zal',serviceIds:['haircut'],requestKey:randomUUID(),expectedCancellationMinutes:0});
async function online(r){const m=(await r.shop.masters())[0];return r.shop.saveMaster({id:m.id,revision:m.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});}
test('shared intake stays active until a configured master takes over; old visits stay protected',async t=>{
 const {r,request}=await setup(t);const before=await request('/api/meta');assert.equal(before.data.management,true);assert.equal(before.data.clientMasterMode,false);
 const payload=booking(),slots=await request('/api/availability?date=2030-01-02&room=zal&serviceIds=haircut');assert.equal(slots.data.slots.find(x=>x.time==='11:00').status,'available');
 const login=await request('/api/admin/login',{password:'synthetic-owner-password'});const auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':login.data.csrf};assert.equal((await request('/api/admin/slot',{date:payload.date,time:'14:00',blocked:true},auth)).status,200);const day=await request('/api/admin/day?date='+payload.date,undefined,auth);assert.equal(day.data.legacyIntake,true);const sharedBlock=day.data.slots.find(row=>row.kind==='block'&&row.time==='14:00');assert.ok(sharedBlock);
 const first=await request('/api/bookings',payload);assert.equal(first.status,201);assert.equal((await r.shop.getBooking(first.data.id)).master_id,null);assert.equal((await r.shop.clients()).count,1);
 assert.equal((await request('/api/bookings',payload)).data.id,first.data.id);const m=await online(r);assert.equal((await request('/api/meta')).data.clientMasterMode,true);
 assert.equal((await request('/api/availability?date=2030-01-02&room=zal&serviceIds=haircut')).status,409);
 const newSlots=await request('/api/availability?date=2030-01-02&room=zal&serviceIds=haircut&masterId='+m.id);assert.notEqual(newSlots.data.slots.find(x=>x.time==='12:00').status,'available');assert.equal(newSlots.data.slots.find(x=>x.time==='12:30').status,'available');assert.notEqual(newSlots.data.slots.find(x=>x.time==='14:00').status,'available');assert.equal((await request('/api/admin/slot',{date:payload.date,time:'16:00',blocked:true},auth)).status,409);assert.equal((await request('/api/admin/shared-block/open',{id:sharedBlock.id},auth)).status,200);const opened=await request('/api/availability?date=2030-01-02&room=zal&serviceIds=haircut&masterId='+m.id);assert.equal(opened.data.slots.find(x=>x.time==='14:00').status,'available');
 assert.equal((await request('/api/bookings',{...payload,requestKey:randomUUID(),time:'14:00'})).status,409);assert.equal((await request('/api/bookings',payload)).data.id,first.data.id);
 const fresh=(await r.shop.masters()).find(x=>x.id===m.id);await r.shop.saveMaster({id:fresh.id,revision:fresh.revision,name:'',online:false,archived:false,stepMinutes:fresh.step_minutes,serviceIds:fresh.serviceIds,schedule:fresh.schedule});assert.equal((await request('/api/meta')).data.clientMasterMode,true);
 assert.equal((await r.shop.getBooking(first.data.id)).status,'active');assert.equal((await request('/api/bookings/cancel',{id:first.data.id,token:payload.requestKey})).status,200);
});
test('transition intake applies live catalog, quote and cancellation rules',async t=>{
 const {r,request}=await setup(t);const service=(await r.shop.services(true)).find(s=>s.id==='haircut');
 await r.shop.saveService({id:service.id,revision:service.revision,name:'Synthetic haircut',translations:{ru:'Синтетика',en:'Synthetic haircut'},active:true,archived:false,position:service.position,options:{zal:{priceMin:3500,priceMax:3500,durationMinutes:90},vip:{priceMin:4000,priceMax:4000,durationMinutes:60}}});
 const stale=await request('/api/bookings',{...booking(),expectedQuote:{min:1,max:1,duration:90}});assert.equal(stale.status,409);
 const good=await request('/api/bookings',{...booking(),expectedQuote:{min:3500,max:3500,duration:90}});assert.equal(good.status,201);assert.equal(good.data.priceMin,3500);assert.equal(good.data.items[0].service_name,'Synthetic haircut');
});
test('racing shared booking with master activation never double books',async t=>{
 const {r,request}=await setup(t);const payload=booking();const [save,result]=await Promise.all([online(r),request('/api/bookings',payload)]);assert.ok([201,409].includes(result.status));
 const slots=await request('/api/availability?date=2030-01-02&room=zal&serviceIds=haircut&masterId='+save.id);
 if(result.status===201)assert.notEqual(slots.data.slots.find(x=>x.time==='11:00').status,'available');else assert.equal((await r.shop.listBookings()).count,0);
});
test('shared intake sums multiple fractional prices exactly once',async t=>{
 const {r,request}=await setup(t);for(const [id,amount]of [['haircut',10],['beard_cut',20]]){const service=(await r.shop.services(true)).find(s=>s.id===id);await r.shop.saveService({id,revision:service.revision,name:service.name,translations:service.translations,active:true,archived:false,position:service.position,options:{zal:{priceMin:amount,priceMax:amount,durationMinutes:30},vip:{priceMin:amount,priceMax:amount,durationMinutes:30}}});}
 const result=await request('/api/bookings',{...booking(),serviceIds:['haircut','beard_cut'],expectedQuote:{min:30,max:30,duration:60}});assert.equal(result.status,201);assert.equal(result.data.priceMin,30);assert.equal(result.data.items.reduce((sum,i)=>sum+i.price_min,0),30);
});
test('first master cannot end the existing intake without a genuinely bookable service',async t=>{
 const {r,request}=await setup(t),m=(await r.shop.masters())[0];const options={id:m.id,revision:m.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'10:00',breaks:[]}))};
 await assert.rejects(r.shop.saveMaster(options),{message:'Configure bookable service first'});assert.equal((await request('/api/meta')).data.clientMasterMode,false);
 const service=(await r.shop.services(true)).find(s=>s.id==='haircut');await r.shop.saveService({id:service.id,revision:service.revision,name:service.name,translations:service.translations,active:false,archived:false,position:service.position,options:{zal:{priceMin:3500,priceMax:3500,durationMinutes:30},vip:{priceMin:4000,priceMax:4000,durationMinutes:30}}});
 await assert.rejects(r.shop.saveMaster(options),{message:'Configure bookable service first'});assert.equal((await request('/api/meta')).data.clientMasterMode,false);
});

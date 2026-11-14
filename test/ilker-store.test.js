'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {createDatabase}=require('../server/database');const {prepareIlkerStore}=require('../server/ilker-store');
test('new catalog stores snapshots and isolates old data; duration, concurrency and revenue are safe',async()=>{
 let now=Date.parse('2030-01-01T00:00:00Z');const db=await createDatabase({databasePath:':memory:',databaseUrl:''});
 try{
  await db.prepare("INSERT INTO slots(id,date,time,kind,name,created_at) VALUES(?,?,?,'booking',?,?)").run('legacy-id','2030-01-02','10:00','Legacy person','2030-01-01');
  const shop=await prepareIlkerStore(db,{now:()=>now});const make=(overrides={})=>({date:'2030-01-02',time:'10:00',name:'Test Name',phone:'+994501234567',serviceId:'haircut',room:'zal',requestKey:randomUUID(),...overrides});
  await assert.rejects(shop.book(make()),e=>e.status===409); // unknown duration is never guessed
  await shop.setDuration('haircut','zal',90);await shop.setDuration('haircut','vip',90);const attempts=await Promise.allSettled(Array.from({length:20},(_,i)=>shop.book(make({room:i%2?'zal':'vip'}))));
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);assert.equal(attempts.filter(x=>x.status==='rejected'&&x.reason.status===409).length,19);
  const first=attempts.find(x=>x.status==='fulfilled').value;assert.equal(first.duration_minutes,90);assert.equal(first.actual_price,first.room==='zal'?3500:6000);
  const legacy=await db.prepare('SELECT name FROM slots WHERE id=?').get('legacy-id');assert.equal(legacy.name,'Legacy person');
  await shop.setDuration('haircut',first.room,30);const same=await shop.book(make({date:first.date,time:first.time,room:first.room,requestKey:first.request_key}));assert.equal(same.id,first.id);assert.equal(same.duration_minutes,90);
  await assert.rejects(shop.book(make({time:'11:00'})),e=>e.status===409); // existing snapshot is still 90 minutes
  await shop.setDuration('keratin_botox','zal',30);const range=await shop.book(make({time:'12:00',serviceId:'keratin_botox'}));assert.equal(range.actual_price,null);assert.equal(range.price_min,15000);assert.equal(range.price_max,20000);
  await assert.rejects(shop.setActualPrice(range.id,149),e=>e.status===400);// A range has no revenue until an owner enters the actual price.
  await shop.setDuration('rf_microcurrent_cavitation','vip',30);const pkg=await shop.book(make({time:'13:00',serviceId:'rf_microcurrent_cavitation',room:'vip'}));assert.equal(pkg.actual_price,40000);assert.equal(pkg.sessions_count,8);
  assert.equal((await shop.revenue()).total,'0.00');await assert.rejects(shop.complete(first.id),e=>e.status===409);
  now=Date.parse('2030-01-02T11:00:00Z');await shop.complete(first.id);await shop.complete(range.id);await shop.complete(pkg.id);
  assert.equal((await shop.revenue()).unpriced,1);await shop.setActualPrice(range.id,'180.50');
  const revenue=await shop.revenue();assert.equal(revenue.totalMinor,first.actual_price+18050+40000);assert.equal(revenue.visits,3);assert.equal(revenue.total,((first.actual_price+18050+40000)/100).toFixed(2));
  const count=await db.prepare('SELECT count(*) AS n FROM ilker_appointments').get();assert.equal(count.n,3);
 }finally{await db.close();}
});

test('owner day and hour controls, room duration, and cancellation keep availability consistent',async()=>{
 const db=await createDatabase({databasePath:':memory:',databaseUrl:''});try{const shop=await prepareIlkerStore(db,{now:()=>Date.parse('2030-01-01T00:00:00Z')});
 let a=await shop.availability('2030-01-02','haircut','zal');assert.equal(a.durationMinutes,null);assert.equal(a.slots.find(s=>s.time==='10:00').status,'pending');
 await shop.setDuration('haircut','zal',90);a=await shop.availability('2030-01-02','haircut','vip');assert.equal(a.durationMinutes,null);
 await shop.setSlot('2030-01-02','11:00',true);a=await shop.availability('2030-01-02','haircut','zal');assert.equal(a.slots.find(s=>s.time==='10:00').status,'blocked');
 await shop.setSlot('2030-01-02','11:00',false);await shop.setDay('2030-01-02',true);assert.equal((await shop.availability('2030-01-02','haircut','zal')).dayClosed,true);
 const data={date:'2030-01-02',time:'10:00',name:'Test Name',phone:'+994501234567',serviceId:'haircut',room:'zal',requestKey:randomUUID()};await assert.rejects(shop.book(data),e=>e.status===409);
 await shop.setDay(data.date,false);const booked=await shop.book(data);await assert.rejects(shop.setSlot(data.date,'11:00',true),e=>e.status===409);
 await shop.cancel(booked.id);assert.equal((await shop.availability(data.date,'haircut','zal')).slots.find(s=>s.time==='10:00').status,'available');await shop.remove(booked.id);assert.equal((await db.prepare('SELECT count(*) AS n FROM ilker_appointments WHERE kind=\'booking\'').get()).n,0);
 }finally{await db.close();}
});

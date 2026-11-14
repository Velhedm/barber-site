'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');const {createDatabase}=require('../server/database');const {prepareIlkerStore}=require('../server/ilker-store');
test('multiple services share one booking, preserve snapshots and block the full duration',async()=>{
 let now=Date.parse('2030-01-01T00:00:00Z');const db=await createDatabase({databaseUrl:'',databasePath:':memory:'});const shop=await prepareIlkerStore(db,{now:()=>now});
 try{
  await shop.setDuration('haircut','vip',60);await shop.setDuration('beard_cut','vip',30);
  let a=await shop.availability('2030-01-02',undefined,'vip',['haircut','beard_cut']);assert.equal(a.durationMinutes,90);assert.equal(a.slots.find(x=>x.time==='20:00').status,'blocked');
  const input={date:'2030-01-02',time:'10:00',serviceIds:['haircut','beard_cut'],room:'vip',name:'Test Customer',phone:'+994501234567',requestKey:randomUUID()};const row=await shop.book(input);
  assert.equal(row.duration_minutes,90);assert.equal(row.actual_price,9500);assert.deepEqual((await shop.items(row.id)).map(x=>x.price_min),[6000,3500]);assert.equal((await shop.book(input)).id,row.id);
  await assert.rejects(shop.book({...input,serviceIds:['haircut'],requestKey:input.requestKey}),/retry differs/);
  await assert.rejects(shop.book({...input,time:'11:00',room:'zal',serviceIds:['massage_20'],requestKey:randomUUID()}),/unavailable/);
  await assert.rejects(shop.book({...input,serviceIds:['haircut','haircut'],requestKey:randomUUID()}),/Unknown service/);
  await shop.setDuration('haircut','vip',120);assert.equal((await shop.items(row.id))[0].duration_minutes,60);
  now=Date.parse('2030-01-02T08:00:00Z');await shop.complete(row.id);const revenue=await shop.revenue();assert.equal(revenue.total,'95.00');assert.equal(revenue.visits,1);
 }finally{await db.close();}
});
test('a ranged service and an eight-session package contribute once and require an actual total',async()=>{
 let now=Date.parse('2030-01-01T00:00:00Z');const db=await createDatabase({databaseUrl:'',databasePath:':memory:'});const shop=await prepareIlkerStore(db,{now:()=>now});try{
  await shop.setDuration('keratin_botox','zal',60);await shop.setDuration('rf_microcurrent_cavitation','zal',60);
  const row=await shop.book({date:'2030-01-02',time:'10:00',serviceIds:['keratin_botox','rf_microcurrent_cavitation'],room:'zal',name:'Test Client',phone:'+994501234567',requestKey:randomUUID()});assert.equal(row.price_min,55000);assert.equal(row.price_max,60000);assert.equal(row.actual_price,null);assert.deepEqual((await shop.items(row.id)).map(x=>x.sessions_count),[1,8]);
  await shop.setActualPrice(row.id,'575');now=Date.parse('2030-01-02T09:00:00Z');await shop.complete(row.id);const revenue=await shop.revenue();assert.equal(revenue.total,'575.00');assert.equal(revenue.visits,1);
 }finally{await db.close();}
});

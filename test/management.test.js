'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {createApp} = require('../server/app');
const {migrateManagement} = require('../server/management-migration');
const {normalizeWeek, roomHasSpace} = require('../server/scheduling');
const now = () => Date.parse('2030-01-01T00:00:00Z');
const week = () => Array.from({length: 7}, () => ({closed: false, start: '09:00', end: '21:00', breaks: [{start: '13:00', end: '14:00'}]}));
async function fixture(t) {
  const app = await createApp({databaseUrl: '', databasePath: ':memory:', management: true, migrateManagement: true, now, production: false});
  t.after(() => app.close()); const shop = app.shop;
  for (const category of ['zal', 'vip']) {await shop.setDuration('haircut', category, 90); await shop.setDuration('beard_cut', category, 30);}
  const enable = async (id, extra = {}) => {
    const old = (await shop.masters()).find(m => m.id === id);
    return shop.saveMaster({id, name: '', online: true, archived: false, stepMinutes: 30, schedule: week(), serviceIds: ['haircut', 'beard_cut'], revision: old.revision, ...extra});
  };
  await enable('master-1'); await enable('master-2');
  const booking = (masterId = 'master-1', time = '11:00', extra = {}) => ({masterId, time, date: '2030-01-02', serviceIds: ['haircut'], room: 'zal', name: 'Synthetic Test', phone: '+994500000001', requestKey: randomUUID(), ...extra});
  return {...app, enable, booking};
}
test('migration is idempotent; blank placeholders and no fictitious rooms', async t => {
  const app = await createApp({databaseUrl: '', databasePath: ':memory:', management: true, migrateManagement: true, now, production: false}); t.after(() => app.close());
  assert.equal((await app.shop.masters()).length, 7);
  assert.ok((await app.shop.masters()).every(m => !m.name && !m.online && m.schedule.every(d => d.closed)));
  assert.equal((await app.shop.rooms()).length, 0); assert.equal((await app.shop.services()).length, 21);
  assert.equal((await migrateManagement(app.db)).alreadyApplied, true);
});
test('90-minute occupation, independent masters, exact step, breaks and closing boundaries', async t => {
  const {shop, booking} = await fixture(t);
  await shop.book(booking());
  for (const time of ['11:00', '11:30', '12:00']) await assert.rejects(shop.book(booking('master-1', time)), {status: 409});
  await shop.book(booking('master-2'));
  await shop.book(booking('master-1', '12:30', {serviceIds: ['beard_cut']}));
  for (const time of ['11:10', '13:00', '20:00', '21:00']) await assert.rejects(shop.book(booking('master-1', time)), {status: 409});
  const slots = await shop.availabilityInput(booking());
  assert.equal(slots.slots.find(s => s.time === '12:30').status, 'blocked'); // 90 minutes would cross lunch
  assert.equal(JSON.stringify(slots).includes('Synthetic'), false);
});
test('30 / 60 / 90 / 120 minute visits and combined services preserve exact length', async t => {
  const {shop, booking} = await fixture(t);
  for (const duration of [30, 60, 90, 120]) {
    await shop.setDuration('haircut', 'zal', duration);
    const row = await shop.book(booking('master-1', '09:00', {date: `2030-01-${String(duration / 30 + 10).padStart(2, '0')}`}));
    assert.equal(row.duration_minutes, duration);
    const availability = await shop.availabilityInput({...booking(), date: row.date, serviceIds: ['beard_cut']});
    for (let m = 0; m < duration; m += 30) assert.equal(availability.slots.find(s => s.time === `${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`).status, 'booked');
  }
  await shop.setDuration('haircut', 'zal', 90);
  const originalRequest=booking('master-1','09:00',{serviceIds:['haircut','beard_cut']});
  const row = await shop.book(originalRequest);
  assert.equal(row.duration_minutes, 120); assert.equal(row.actual_price, 5500); assert.equal(row.items.length, 2);
  assert.equal((await shop.book({...booking(), requestKey: originalRequest.requestKey, time: '09:00', serviceIds: ['haircut', 'beard_cut']})).id, row.id);
  const s = (await shop.services(true)).find(s => s.id === 'haircut');
  await shop.saveService({...s, name: 'Updated name', options: {zal: {priceMin: 9999, priceMax: 9999, durationMinutes: 30}, vip: {priceMin: 12000, priceMax: 12000, durationMinutes: 30}}});
  const unchanged = await shop.publicResult(row);
  assert.equal(unchanged.items[0].price_min, 3500); assert.equal(unchanged.items[0].duration_minutes, 90); assert.notEqual(unchanged.items[0].service_name, 'Updated name');
});
test('racing writes produce one visit; cancellation is idempotent and archival keeps history', async t => {
  const {shop, booking, db} = await fixture(t);
  const results = await Promise.allSettled(Array.from({length: 20}, () => shop.book(booking())));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.status === 409));
  const row = results.find(r => r.status === 'fulfilled').value;
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ilker_push_events').get()).n, 1);
  await shop.cancel(row.id); await shop.cancel(row.id);
  const retry = await shop.book(booking()); assert.notEqual(retry.id, row.id);
  await shop.remove(row.id); assert.ok(await db.prepare('SELECT id FROM ilker_appointments WHERE id=?').get(row.id));
});
test('archival retains history, offline prevents public booking, assignments and stale revisions checked', async t => {
  const {shop, booking, enable} = await fixture(t);
  const row = await shop.book(booking());
  await enable('master-1', {archived: true, online: false});
  await assert.rejects(shop.book(booking('master-1', '15:00')), {status: 409});
  assert.equal((await shop.history('master-1')).rows[0].id, row.id);
  const m = (await shop.masters()).find(m => m.id === 'master-2');
  await assert.rejects(shop.saveMaster({id: m.id, name: 'New', online: true, archived: false, stepMinutes: 30, schedule: week(), serviceIds: ['haircut'], revision: m.revision - 1}), {status: 409});
  await enable('master-2', {serviceIds: ['haircut']});
  assert.equal((await shop.eligible({serviceIds: ['haircut', 'beard_cut'], room: 'zal'})).length, 0);
});
test('room capacity across masters uses peak occupancy; snapshots retain original room', async t => {
  const {shop, booking, enable} = await fixture(t);
  const room = await shop.saveRoom({name: 'Test resource', capacity: 1, archived: false});
  await enable('master-1', {roomId: room.id}); await enable('master-2', {roomId: room.id});
  await shop.book(booking()); await assert.rejects(shop.book(booking('master-2')), {status: 409});
  await assert.rejects(shop.saveRoom({...room, capacity: 0, archived: false}), {status: 400});
  await enable('master-1', {roomId: null});
  await assert.rejects(shop.book(booking('master-2')), {status: 409});
  assert.equal(roomHasSpace({start: 0, end: 120}, [{start: 0, end: 60}, {start: 60, end: 120}], 2), true);
  assert.equal(roomHasSpace({start: 0, end: 120}, [{start: 0, end: 90}, {start: 60, end: 120}], 2), false);
});
test('exceptions, exact blocks, global closures and invalid schedules fail safely', async t => {
  const {shop, booking} = await fixture(t);
  await shop.setBlock({masterId: 'master-1', date: '2030-01-02', start: '11:15', end: '11:45', blocked: true});
  await assert.rejects(shop.book(booking()), {status: 409});
  await shop.setBlock({masterId: 'master-1', date: '2030-01-02', start: '11:15', end: '11:45', blocked: false});
  await shop.setException({masterId: 'master-1', date: '2030-01-02', day: {closed: true}});
  await assert.rejects(shop.book(booking()), {status: 409});
  await shop.setException({masterId: 'master-1', date: '2030-01-02', day: null});
  await shop.setDay('2030-01-02', true); await assert.rejects(shop.book(booking()), {status: 409});
  await shop.setDay('2030-01-02', false); await shop.book(booking());
  assert.throws(() => normalizeWeek(week().map(day => ({...day, end: '08:00'}))));
});
test('unassigned historical visits block every master without reassigning or deleting records', async t => {
  const {shop, booking, db} = await fixture(t);
  await db.prepare("INSERT INTO ilker_appointments(id,date,time,kind,duration_minutes,created_at) VALUES('legacy','2030-01-02','11:00','booking',90,'2030-01-01')").run();
  await assert.rejects(shop.book(booking('master-1')), {status: 409}); await assert.rejects(shop.book(booking('master-2')), {status: 409});
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ilker_booking_assignment').get()).n, 0);
  assert.ok(await db.prepare("SELECT id FROM ilker_appointments WHERE id='legacy'").get());
});

test('failure to enqueue notification rolls back the booking transaction', async t => {
  const {shop,booking,db}=await fixture(t);
  await db.exec("CREATE TRIGGER reject_event BEFORE INSERT ON ilker_push_events BEGIN SELECT RAISE(ABORT, 'synthetic event failure'); END;");
  await assert.rejects(shop.book(booking()));
  for(const table of ['ilker_appointments','ilker_booking_items','ilker_booking_assignment'])assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM '+table).get()).n,0);
});
test('all supported time steps affect starts only; changes apply immediately without restart',async t=>{
 const {shop,booking,enable}=await fixture(t);
 for(const step of [10,15,20,30,60]){
  await enable('master-1',{stepMinutes:step});const slots=await shop.availabilityInput(booking());
  assert.equal(slots.durationMinutes,90);
  assert.equal(slots.slots[1].time,step===60?'10:00':`09:${String(step).padStart(2,'0')}`);
 }
 await enable('master-1',{stepMinutes:15});await shop.book(booking('master-1','09:15'));
 const next=await shop.availabilityInput(booking());assert.equal(next.slots.find(s=>s.time==='10:30').status,'booked');assert.equal(next.slots.find(s=>s.time==='10:45').status,'available');
});
test('new master and service, archival, category pricing and custom date schedules',async t=>{
 const {shop,booking}=await fixture(t);
 const service=await shop.saveService({name:'Test xidmət',translations:{ru:'Тестовая услуга',en:'Test service'},active:true,archived:false,position:100,options:{zal:{priceMin:1250,priceMax:1250,durationMinutes:30},vip:{priceMin:2500,priceMax:3000,durationMinutes:60}}});
 const m=await shop.saveMaster({name:'',online:true,archived:false,stepMinutes:20,schedule:week(),serviceIds:[service.id]});
 await shop.setException({masterId:m.id,date:'2030-01-02',day:{closed:false,start:'10:00',end:'12:00',breaks:[]}});
 await assert.rejects(shop.book(booking(m.id,'09:00',{serviceIds:[service.id]})),{status:409});
 const row=await shop.book(booking(m.id,'10:00',{serviceIds:[service.id],room:'vip'}));assert.equal(row.price_min,2500);assert.equal(row.price_max,3000);assert.equal(row.actual_price,null);assert.equal(row.duration_minutes,60);
 await shop.saveService({...service,active:false,archived:true,options:{zal:{priceMin:1250,priceMax:1250,durationMinutes:30},vip:{priceMin:2500,priceMax:3000,durationMinutes:60}}});
 await assert.rejects(shop.book(booking(m.id,'11:00',{serviceIds:[service.id],room:'vip'})),{status:409});assert.equal((await shop.history(m.id)).rows.length,1);assert.equal((await shop.items(row.id))[0].service_name,'Test xidmət');
});
test('stale displayed price fails before saving; confirmed snapshot is authoritative',async t=>{
 const {shop,booking,db}=await fixture(t);
 await assert.rejects(shop.book(booking('master-1','11:00',{expectedQuote:{min:100,max:100,duration:90}})),{status:409,message:'Quote changed'});
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ilker_appointments').get()).n,0);
 const row=await shop.book(booking('master-1','11:00',{expectedQuote:{min:3500,max:3500,duration:90}}));assert.equal(row.actual_price,3500);
});

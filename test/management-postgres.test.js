'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {createDatabase} = require('../server/database');
const {createApp} = require('../server/app');
const {migrateManagement} = require('../server/management-migration');
const {migrateReception}=require('../server/reception-migration');
const {migrateAccess}=require('../server/access-migration');
const {migratePush}=require('../server/push-migration');
const {migratePushChanges,migratePushOrder}=require('../server/push-changes');
const {migrateRecovery}=require('../server/recovery-migration');
const {migrateReminders}=require('../server/reminders');
const {migrateBusinessSettings,migrateBookingPolicy}=require('../server/business-settings');
const {migrateSystemAlerts}=require('../server/system-alerts');

// Isolated schema AND explicit test-branch hostname: no synthetic rows in real tables.
test('PostgreSQL: migration preserves copied records; independent processes serialize overlapping requests', {skip: !process.env.ILKER_TEST_DATABASE_URL}, async () => {
  const parsed = new URL(process.env.ILKER_TEST_DATABASE_URL);
  if (parsed.hostname !== process.env.ILKER_TEST_EXPECTED_HOST || parsed.hostname.replace('-pooler','') === 'ep-weathered-surf-b43wbped.c-6.us-east-2.aws.neon.tech') throw new Error('Nonproduction test branch host must be explicitly confirmed');
  parsed.hostname = parsed.hostname.replace('-pooler', '');
  const configuration = {databaseUrl: parsed.href, bootstrapLegacy: false, proxyUrl: process.env.HTTPS_PROXY};
  const control = await createDatabase(configuration);
  const schema = 'ilker_test_' + randomUUID().replaceAll('-', '');
  const runtimes = [];
  const keys=require('web-push').generateVAPIDKeys();let sent=0,release,ready,autoSend=false;const payloads=[];
  const adminHash=await require('../server/access-store').hashPassword('synthetic-postgres-owner');
  const started=new Promise(resolve=>ready=resolve);
  try {
    // Only aggregates of copied real records; never expose customer contacts in test output.
    const before = await control.prepare('SELECT COUNT(*) AS n FROM ilker_appointments').get();
    const fingerprints=async()=>control.prepare("SELECT (SELECT md5(string_agg(row_to_json(b)::text,'|' ORDER BY b.id)) FROM ilker_appointments b) AS appointments,(SELECT md5(string_agg(row_to_json(i)::text,'|' ORDER BY i.booking_id,i.position)) FROM ilker_booking_items i) AS items").get();
    const beforeFingerprint=await fingerprints();
    const beforeItems = await control.prepare('SELECT COUNT(*) AS n FROM ilker_booking_items').get();
    await migrateManagement(control);
    await migrateReception(control);
    await migrateAccess(control);
    await migratePush(control);
    await migratePushChanges(control);
    await migratePushOrder(control);
    await migrateRecovery(control);
    await migrateReminders(control);
    await migrateBusinessSettings(control);
    await migrateSystemAlerts(control);
    await migrateBookingPolicy(control);
    assert.equal((await migrateReception(control)).alreadyApplied,true);
    const oldRevenue=await control.prepare("SELECT COALESCE(SUM(actual_price),0) AS n FROM ilker_appointments WHERE kind='booking' AND status='completed'").get();
    const migratedRevenue=await control.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM ilker_finance_entries WHERE reason='opening_balance'").get();
    assert.equal(migratedRevenue.n,oldRevenue.n);
    assert.equal((await control.prepare('SELECT COUNT(*) AS n FROM ilker_appointments').get()).n, before.n);
    assert.equal((await control.prepare('SELECT COUNT(*) AS n FROM ilker_booking_items').get()).n, beforeItems.n);
    assert.equal((await migrateManagement(control)).alreadyApplied, true);
    assert.deepEqual(await fingerprints(),beforeFingerprint);
    await control.exec(require('node:fs').readFileSync(require('node:path').join(__dirname,'../migrations/management-grants.sql'),'utf8'));
    await control.exec('CREATE SCHEMA ' + schema);
    parsed.searchParams.set('options', '-c search_path=' + schema);
    async function start() {
      const runtime = await createApp({...configuration, databaseUrl: parsed.href, management: true, migrateManagement: runtimes.length===0, preMigrated:runtimes.length>0, production: false, adminHash, now: () => Date.parse('2030-01-01T00:00:00Z'), vapid: {subject:'mailto:synthetic@example.invalid',publicKey:keys.publicKey,privateKey:keys.privateKey},pushSend:async(_,body)=>{sent++;if(autoSend){payloads.push(JSON.parse(body));return;}ready();await new Promise(resolve=>release=resolve);}});
      runtimes.push(runtime);return runtime;
    }
    const a = await start();
    await a.shop.setDuration('haircut', 'zal', 90);
    for (const id of ['master-1','master-2']) {
      const m = (await a.shop.masters()).find(m => m.id === id);
      await a.shop.saveMaster({id,name:'',online:true,archived:false,revision:m.revision,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});
    }
    const b = await start();
    const request = (masterId='master-1',time='11:00') => ({name:'Synthetic Test',phone:'+994500000001',date:'2030-01-02',time,masterId,serviceIds:['haircut'],room:'zal',requestKey:randomUUID()});
    const result = await Promise.allSettled(Array.from({length:20},(_,i)=>(i%2?a:b).shop.book(request('master-1',i%2?'11:00':'11:30'))));
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
    assert.deepEqual(result.filter(r=>r.status==='rejected').map(r=>({status:r.reason.status||0,code:r.reason.code||'none'})),Array.from({length:19},()=>({status:409,code:'none'})));
    const independent = await b.shop.book(request('master-2'));assert.equal(independent.master_id,'master-2');
    const retry = request('master-1','15:00');const first=await a.shop.book(retry);assert.equal((await b.shop.book(retry)).id,first.id);
    const cancelled=await Promise.all([a.shop.cancelByClient(first.id,retry.requestKey),b.shop.cancelByClient(first.id,retry.requestKey)]);assert.ok(cancelled.every(x=>x.ok));assert.equal((await b.shop.availabilityInput(retry)).slots.find(s=>s.time==='15:00').status,'available');
    const c=await start();assert.equal((await c.shop.history('master-2')).rows[0].id,independent.id);
    await a.db.prepare('INSERT INTO ilker_push_subscriptions(id,endpoint,subscription,created_at) VALUES(?,?,?,?)').run('synthetic-push','https://fcm.googleapis.com/synthetic','{}',1);
    await a.db.prepare("INSERT INTO ilker_push_owners(subscription_id,user_id) VALUES('synthetic-push','owner')").run();
    await a.shop.book({...request('master-1','18:00'),date:'2030-01-05'});
    const draining=a.drainOutbox();await started;await b.drainOutbox();assert.equal(sent,1);release();await draining;
    const beforeMove=await a.shop.getBooking(independent.id),move={id:independent.id,revision:beforeMove.revision,requestKey:randomUUID(),date:'2030-01-03',time:'11:30',masterId:'master-1',room:'zal',serviceIds:['haircut']};
    const moved=await b.shop.reschedule(move);assert.equal(moved.master_id,'master-1');assert.equal((await a.shop.reschedule(move)).revision,moved.revision);assert.equal((await a.db.prepare('SELECT COUNT(*) AS n FROM ilker_push_changes WHERE booking_id=?').get(moved.id)).n,1);
    const another=await a.shop.book({...request('master-2','16:00'),date:'2030-01-03'});
    const competing=await Promise.allSettled([moved,another].map((row,i)=>(i?a:b).shop.reschedule({id:row.id,revision:row.revision,requestKey:randomUUID(),date:'2030-01-04',time:'10:00',masterId:'master-2',room:'zal',serviceIds:['haircut']})));
    assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.equal(competing.find(r=>r.status==='rejected').reason.status,409);
    const clients=await c.shop.clients({q:'500000001'});assert.equal(clients.count,1);
    // Synthetic completed visit predates the fixed clock. Never alter copied public records.
    const id=randomUUID();await a.db.prepare("INSERT INTO ilker_appointments(id,date,time,kind,status,name,phone,service_id,room,service_name,price_min,price_max,actual_price,duration_minutes,created_at) VALUES(?,'2029-12-31','11:00','booking','completed','Synthetic Test','+994500000001','haircut','zal','Test haircut',3500,3500,3500,90,'2029-12-31')").run(id);
    await a.db.prepare("INSERT INTO ilker_visit_state(booking_id,client_id) VALUES(?,?)").run(id,clients.rows[0].id);
    const adjustment={id,revision:1,requestKey:randomUUID(),totalMinor:3500,reason:'correction'};
    await b.shop.adjustFinance(adjustment);await c.shop.adjustFinance(adjustment);
    assert.equal((await a.shop.finance({from:'2029-12-31',to:'2029-12-31'})).totalMinor,3500);
    assert.equal((await a.shop.ledgerHistory(id)).length,1);
    const share=await a.db.prepare('SELECT SUM(amount) AS n FROM ilker_finance_items').get();assert.equal(share.n,3500);
    autoSend=true;await c.drainOutbox();assert.ok(payloads.some(p=>p.title.includes('Мастер изменён')));assert.ok(!JSON.stringify(payloads).includes('+994500000001'));

  } finally {
    await Promise.all(runtimes.map(r=>r.close()));
    await control.exec('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
    await control.close();
  }
});

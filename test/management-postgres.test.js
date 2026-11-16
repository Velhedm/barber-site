'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {createDatabase} = require('../server/database');
const {createApp} = require('../server/app');
const {migrateManagement} = require('../server/management-migration');

// Isolated schema AND explicit test-branch hostname: no synthetic rows in real tables.
test('PostgreSQL: migration preserves copied records; independent processes serialize overlapping requests', {skip: !process.env.ILKER_TEST_DATABASE_URL}, async () => {
  const parsed = new URL(process.env.ILKER_TEST_DATABASE_URL);
  if (parsed.hostname !== process.env.ILKER_TEST_EXPECTED_HOST) throw new Error('Test branch host must be explicitly confirmed');
  parsed.hostname = parsed.hostname.replace('-pooler', '');
  const configuration = {databaseUrl: parsed.href, bootstrapLegacy: false, proxyUrl: process.env.HTTPS_PROXY};
  const control = await createDatabase(configuration);
  const schema = 'ilker_test_' + randomUUID().replaceAll('-', '');
  const runtimes = [];
  try {
    // Only aggregates of copied real records; never expose customer contacts in test output.
    const before = await control.prepare('SELECT COUNT(*) AS n FROM ilker_appointments').get();
    const fingerprints=async()=>control.prepare("SELECT (SELECT md5(string_agg(row_to_json(b)::text,'|' ORDER BY b.id)) FROM ilker_appointments b) AS appointments,(SELECT md5(string_agg(row_to_json(i)::text,'|' ORDER BY i.booking_id,i.position)) FROM ilker_booking_items i) AS items").get();
    const beforeFingerprint=await fingerprints();
    const beforeItems = await control.prepare('SELECT COUNT(*) AS n FROM ilker_booking_items').get();
    await migrateManagement(control);
    assert.equal((await control.prepare('SELECT COUNT(*) AS n FROM ilker_appointments').get()).n, before.n);
    assert.equal((await control.prepare('SELECT COUNT(*) AS n FROM ilker_booking_items').get()).n, beforeItems.n);
    assert.equal((await migrateManagement(control)).alreadyApplied, true);
    assert.deepEqual(await fingerprints(),beforeFingerprint);
    await control.exec(require('node:fs').readFileSync(require('node:path').join(__dirname,'../migrations/management-grants.sql'),'utf8'));
    await control.exec('CREATE SCHEMA ' + schema);
    parsed.searchParams.set('options', '-c search_path=' + schema);
    async function start() {
      const runtime = await createApp({...configuration, databaseUrl: parsed.href, management: true, migrateManagement: runtimes.length===0, preMigrated:runtimes.length>0, production: false, now: () => Date.parse('2030-01-01T00:00:00Z'), vapid: {}});
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
    await a.shop.cancel(first.id);assert.equal((await b.shop.availabilityInput(retry)).slots.find(s=>s.time==='15:00').status,'available');
    const c=await start();assert.equal((await c.shop.history('master-2')).rows[0].id,independent.id);
  } finally {
    await Promise.all(runtimes.map(r=>r.close()));
    await control.exec('DROP SCHEMA IF EXISTS '+schema+' CASCADE');
    await control.close();
  }
});

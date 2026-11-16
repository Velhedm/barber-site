'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {createDatabase}=require('../server/database'),{createApp}=require('../server/app'),{hashPassword}=require('../server/access-store');
test('PostgreSQL access: atomic credential import, shared sessions/revocation, role changes and durable throttle',{skip:!process.env.ILKER_TEST_DATABASE_URL},async()=>{
 const parsed=new URL(process.env.ILKER_TEST_DATABASE_URL);if(parsed.hostname!==process.env.ILKER_TEST_EXPECTED_HOST)throw new Error('Explicit test host required');parsed.hostname=parsed.hostname.replace('-pooler','');
 const config={databaseUrl:parsed.href,bootstrapLegacy:false,proxyUrl:process.env.HTTPS_PROXY};const control=await createDatabase(config),schema='ilker_access_test_'+randomUUID().replaceAll('-',''),runtimes=[];
 try{
  await control.exec('CREATE SCHEMA '+schema);parsed.searchParams.set('options','-c search_path='+schema);
  const password='postgres-synthetic-owner',adminHash=await hashPassword(password),now=()=>Date.parse('2030-01-01T00:00:00Z');
  const start=async first=>{const r=await createApp({...config,databaseUrl:parsed.href,management:true,migrateManagement:first,preMigrated:!first,production:false,adminHash,now,vapid:{}});runtimes.push(r);return r;};
  const a=await start(true),[b,c]=await Promise.all([start(false),start(false)]);assert.equal((await a.access.users('owner')).length,1);
  const owner=await a.access.login({password},'owner-ip','iPhone Safari');assert.equal((await b.access.session(owner.raw)).user.id,'owner');
  const user=await b.access.saveUser('owner',{login:'pg-reception',displayName:'Synthetic',role:'reception',active:true,newPassword:'postgres-synthetic-staff',currentPassword:password});
  const staff=await c.access.login({login:user.login,password:'postgres-synthetic-staff'},'staff-ip','Android');assert.equal((await a.access.session(staff.raw)).user.role,'reception');
  const changed=await b.access.saveUser('owner',{id:user.id,revision:user.revision,login:user.login,displayName:'Synthetic',role:'reception',active:false,currentPassword:password});assert.equal(changed.active,0);assert.equal(await c.access.session(staff.raw),null);
  const results=await Promise.allSettled([a,b,c].map(r=>r.access.saveUser('owner',{id:user.id,revision:changed.revision,login:user.login,displayName:'Synthetic',role:'reception',active:true,currentPassword:password})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,2);
  await c.access.changePassword('owner',{currentPassword:password,newPassword:'postgres-updated-owner'});assert.equal(await a.access.session(owner.raw),null);
  const next=await b.access.login({password:'postgres-updated-owner'},'next-ip','');assert.equal(next.user.id,'owner');await assert.rejects(c.access.login({password},'old-ip',''),{status:401});
  // Seed only synthetic throttle metadata; assert a different instance enforces it.
  await a.db.prepare('INSERT INTO ilker_login_attempts(bucket,attempts,resets_at) VALUES(?,10,?)').run('user:'+createHash('sha256').update('pg-throttled').digest('hex'),now()+900000);
  await assert.rejects(c.access.login({login:'pg-throttled',password:'wrong'},'new-ip',''),{status:429});
  const logs=await a.access.events('owner');assert.ok(logs.some(e=>e.action==='password_changed'));assert.ok(!JSON.stringify(logs).includes('postgres-updated-owner'));
 }finally{await Promise.all(runtimes.map(r=>r.close()));await control.exec('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await control.close();}
});

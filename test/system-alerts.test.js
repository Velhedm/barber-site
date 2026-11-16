'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('../server/app'),{hashPassword}=require('../server/access-store'),webpush=require('web-push');
test('server faults create localized, private, deduplicated Push alerts with retry',async t=>{
 let clock=Date.parse('2030-01-01T00:00:00Z'),fail=false;const sent=[],keys=webpush.generateVAPIDKeys();
 const r=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,now:()=>clock,adminHash:await hashPassword('synthetic-owner-password'),vapid:{subject:'mailto:synthetic@example.invalid',publicKey:keys.publicKey,privateKey:keys.privateKey},pushSend:async(s,p)=>{if(fail)throw new Error('temporary');sent.push(JSON.parse(p));}});t.after(()=>r.close());
 const sub={endpoint:'https://fcm.googleapis.com/synthetic-system',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}};await r.access.subscribe('owner',sub,null);await r.access.language('owner','en');
 const server=r.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const original=r.shop.settings;r.shop.settings=async()=>{throw Object.assign(new Error('secret synthetic internal detail'),{status:500});};
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/meta');assert.equal(response.status,500);assert.ok(!JSON.stringify(await response.json()).includes('secret synthetic'));r.shop.settings=original;
 fail=true;await r.drainOutbox();assert.equal(sent.length,0);fail=false;clock+=30000;await Promise.all([r.drainOutbox(),r.drainOutbox()]);assert.equal(sent.length,1);assert.equal(sent[0].title,'System error · İlker Sevim');assert.ok(!JSON.stringify(sent).includes('secret synthetic'));
 r.systemAlerts.flag();await r.drainOutbox();assert.equal(sent.length,1);clock+=900000;r.systemAlerts.flag();await r.drainOutbox();assert.equal(sent.length,2);
});

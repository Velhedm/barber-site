'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createApp}=require('../server/app'),{hashPassword}=require('../server/access-store'),webpush=require('web-push');
test('transactional booking change events retry without leaking contacts or duplicating operations',async t=>{
 let clock=Date.parse('2030-01-01T00:00:00Z'),fail=true;const sent=[],keys=webpush.generateVAPIDKeys();
 const app=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,adminHash:await hashPassword('synthetic-owner-password'),now:()=>clock,vapid:{subject:'mailto:synthetic@example.invalid',publicKey:keys.publicKey,privateKey:keys.privateKey},pushSend:async(_,body)=>{if(fail){fail=false;throw new Error('synthetic failure');}sent.push(JSON.parse(body));}});t.after(()=>app.close());
 await app.shop.setDuration('haircut','zal',60);const m=(await app.shop.masters()).find(x=>x.id==='master-1');await app.shop.saveMaster({id:m.id,revision:m.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});
 await app.access.subscribe('owner',{endpoint:'https://fcm.googleapis.com/synthetic',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}});await app.access.preferences('owner',{language:'az',pushPrivate:true});
 const input={name:'Synthetic private',phone:'+994500000001',date:'2030-01-02',time:'11:00',masterId:m.id,serviceIds:['haircut'],room:'zal',requestKey:randomUUID()};const visit=await app.shop.book(input);
 const move={id:visit.id,revision:visit.revision,date:'2030-01-02',time:'12:00',masterId:m.id,serviceIds:['haircut'],room:'zal',requestKey:randomUUID()};await app.shop.reschedule(move);await app.shop.reschedule(move);
 await app.db.exec("CREATE TRIGGER synthetic_push_failure BEFORE INSERT ON ilker_push_changes BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
 await assert.rejects(app.shop.cancelByClient(visit.id,input.requestKey));assert.equal((await app.shop.getBooking(visit.id)).status,'active');await app.db.exec('DROP TRIGGER synthetic_push_failure');
 await app.shop.cancelByClient(visit.id,input.requestKey);await app.shop.cancelByClient(visit.id,input.requestKey);
 assert.equal((await app.db.prepare('SELECT COUNT(*) AS n FROM ilker_push_changes').get()).n,2);
 await app.drainOutbox();assert.equal(sent.length,0);clock+=30000;await app.drainOutbox();assert.equal(sent.length,2);
 assert.deepEqual(sent.map(x=>x.title),['Rezervasiya dəyişdirildi · İlker Sevim','Rezervasiya ləğv edildi · İlker Sevim']);
 assert.ok(sent.every(x=>x.body==='Ətraflı məlumat üçün paneli açın.'));assert.ok(!JSON.stringify(sent).includes(input.phone));assert.ok(!JSON.stringify(sent).includes(input.name));
 await app.drainOutbox();assert.equal(sent.length,2);
});
test('two instances do not deliver the same booking-change event concurrently',async t=>{
 const {mkdtempSync,rmSync}=require('node:fs'),path=require('node:path'),{tmpdir}=require('node:os');const dir=mkdtempSync(path.join(tmpdir(),'ilker-change-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 let started,release,count=0;const ready=new Promise(r=>started=r),keys=webpush.generateVAPIDKeys();
 const config={databaseUrl:'',databasePath:path.join(dir,'test.db'),management:true,production:false,adminHash:await hashPassword('synthetic-owner-password'),now:()=>Date.parse('2030-01-01T00:00:00Z'),vapid:{subject:'mailto:synthetic@example.invalid',publicKey:keys.publicKey,privateKey:keys.privateKey},pushSend:async()=>{count++;started();await new Promise(r=>release=r);}};
 const a=await createApp({...config,migrateManagement:true}),b=await createApp({...config,preMigrated:true});t.after(async()=>{await a.close();await b.close();});
 await a.shop.setDuration('haircut','zal',60);const m=(await a.shop.masters()).find(x=>x.id==='master-1');await a.shop.saveMaster({id:m.id,revision:m.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});
 await a.access.subscribe('owner',{endpoint:'https://fcm.googleapis.com/synthetic',keys:{p256dh:'A'.repeat(87),auth:'A'.repeat(22)}});const request={name:'Synthetic',phone:'+994500000001',date:'2030-01-02',time:'11:00',masterId:m.id,serviceIds:['haircut'],room:'zal',requestKey:randomUUID()};const row=await a.shop.book(request);await a.shop.cancelByClient(row.id,request.requestKey);
 const first=a.drainOutbox();await ready;await b.drainOutbox();assert.equal(count,1);release();await first;await b.drainOutbox();assert.equal(count,1);
});

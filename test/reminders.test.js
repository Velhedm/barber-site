'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createApp}=require('../server/app'),{hashPassword}=require('../server/access-store');
async function setup(t){let clock=Date.parse('2030-01-01T00:00:00Z'),fail=false;const sent=[];
 const r=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,vapid:{},adminHash:await hashPassword('synthetic-owner-password'),origin:'https://synthetic.invalid',recoveryKey:'a'.repeat(64),now:()=>clock,emailProvider:{configured:true,send:async mail=>{if(fail)throw new Error('temporary');sent.push(mail);}}});t.after(()=>r.close());
 await r.shop.setDuration('haircut','zal',60);const master=(await r.shop.masters())[0];await r.shop.saveMaster({id:master.id,revision:master.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});
 return {r,sent,set:n=>clock=n,fail:value=>fail=value,book:(extra={})=>r.shop.book({name:'Synthetic',phone:'+994500000111',date:'2030-01-02',time:'12:00',masterId:master.id,serviceIds:['haircut'],room:'zal',requestKey:randomUUID(),...extra})};}
test('consent is optional; reminders use configured schedule and never duplicate accepted deliveries',async t=>{
 const {r,sent,set,book}=await setup(t);const settings=await r.reminders.settings();await r.reminders.saveSettings({revision:settings.revision,enabled:true,offsets:[1440,120]},'owner');
 const booking=await book({reminder:{consent:true,email:'synthetic@example.invalid',language:'en'}});assert.equal((await r.reminders.list()).length,2);
 set(Date.parse('2030-01-01T08:00:01Z'));await Promise.all([r.drainEmail(),r.drainEmail()]);assert.equal(sent.length,1);assert.equal(sent[0].to,'synthetic@example.invalid');assert.equal((await r.reminders.list()).filter(j=>j.state==='sent').length,1);
 set(Date.parse('2030-01-02T06:00:01Z'));await r.drainEmail();assert.equal(sent.length,2);await r.drainEmail();assert.equal(sent.length,2);
 assert.ok(!JSON.stringify(await r.reminders.list()).includes('synthetic@example.invalid'));assert.equal((await r.shop.getBooking(booking.id)).status,'active');
});
test('rescheduling, cancellation, retry and anonymization suppress old jobs and erase email',async t=>{
 const {r,sent,set,fail,book}=await setup(t);const settings=await r.reminders.settings();await r.reminders.saveSettings({revision:settings.revision,enabled:true,offsets:[120]},'owner');
 const b=await book({reminder:{consent:true,email:'synthetic@example.invalid',language:'az'}});
 await r.shop.reschedule({id:b.id,revision:b.revision,requestKey:randomUUID(),date:b.date,time:'14:00',masterId:b.master_id,serviceIds:['haircut'],room:'zal'},'owner');
 set(Date.parse('2030-01-02T08:00:01Z'));fail(true);await r.drainEmail();assert.equal((await r.reminders.list()).find(j=>j.state==='pending').attempts,1);fail(false);set(Date.parse('2030-01-02T08:01:01Z'));await r.drainEmail();assert.equal(sent.length,1);
 const fresh=await r.shop.getBooking(b.id);await r.shop.setStatus({id:b.id,revision:fresh.revision,requestKey:randomUUID(),status:'cancelled'},'owner');assert.equal((await r.db.prepare('SELECT email FROM ilker_reminder_consent WHERE booking_id=?').get(b.id)).email,'');
 const client=(await r.shop.clients()).rows[0];await r.shop.anonymizeClient({id:client.id,revision:client.revision},'owner');assert.equal((await r.db.prepare('SELECT email FROM ilker_reminder_consent WHERE booking_id=?').get(b.id)).email,'');
});
test('disabled, invalid, revoked and provider-unavailable cases do not silently send',async t=>{
 const {r,book,sent,set}=await setup(t);await assert.rejects(book({reminder:{consent:true,email:'synthetic@example.invalid',language:'en'}}),{status:409});assert.equal((await r.shop.listBookings()).count,0);
 let settings=await r.reminders.settings();await r.reminders.saveSettings({revision:settings.revision,enabled:true,offsets:[120]},'owner');await assert.rejects(book({reminder:{consent:true,email:'bad',language:'en'}}),{status:400});
 const b=await book({reminder:{consent:true,email:'synthetic@example.invalid',language:'en'}});settings=await r.reminders.settings();await r.reminders.saveSettings({revision:settings.revision,enabled:false,offsets:[120]},'owner');set(Date.parse('2030-01-02T06:00:01Z'));await r.drainEmail();assert.equal(sent.length,0);assert.equal((await r.shop.getBooking(b.id)).status,'active');
});
test('reusing a booking request key cannot silently change reminder consent',async t=>{
 const {r,book}=await setup(t);const settings=await r.reminders.settings();await r.reminders.saveSettings({revision:settings.revision,enabled:true,offsets:[120]},'owner');
 const requestKey=randomUUID(),first=await book({requestKey,reminder:{consent:true,email:'synthetic@example.invalid',language:'en'}});
 assert.equal((await book({requestKey,reminder:{consent:true,email:'synthetic@example.invalid',language:'en'}})).id,first.id);
 await assert.rejects(book({requestKey,reminder:{consent:true,email:'other@example.invalid',language:'en'}}),{status:409});
});
test('staff can revoke reminder consent without cancelling the visit',async t=>{
 const {r,book}=await setup(t);const settings=await r.reminders.settings();await r.reminders.saveSettings({revision:settings.revision,enabled:true,offsets:[120]},'owner');
 const row=await book({reminder:{consent:true,email:'synthetic@example.invalid',language:'en'}});assert.equal((await r.shop.getBooking(row.id)).reminder_opt_in,1);
 await r.reminders.revokeByStaff(row.id,'owner');assert.equal((await r.shop.getBooking(row.id)).reminder_opt_in,0);assert.equal((await r.shop.getBooking(row.id)).status,'active');assert.equal((await r.reminders.list())[0].state,'cancelled');assert.equal((await r.db.prepare('SELECT email FROM ilker_reminder_consent WHERE booking_id=?').get(row.id)).email,'');
});
test('if a cancellation races an accepted message, history reports it as sent',async t=>{
 let clock=Date.parse('2030-01-01T00:00:00Z'),entered,release;const waiting=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);
 const r=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,vapid:{},adminHash:await hashPassword('synthetic-owner-password'),now:()=>clock,emailProvider:{configured:true,send:async()=>{entered();await blocked;}}});t.after(()=>r.close());
 await r.shop.setDuration('haircut','zal',60);const master=(await r.shop.masters())[0];await r.shop.saveMaster({id:master.id,revision:master.revision,name:'',online:true,archived:false,stepMinutes:30,serviceIds:['haircut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[]}))});
 const config=await r.reminders.settings();await r.reminders.saveSettings({revision:config.revision,enabled:true,offsets:[120]},'owner');const row=await r.shop.book({name:'Synthetic',phone:'+994500000111',date:'2030-01-02',time:'12:00',masterId:master.id,serviceIds:['haircut'],room:'zal',requestKey:randomUUID(),reminder:{consent:true,email:'synthetic@example.invalid',language:'en'}});
 clock=Date.parse('2030-01-02T06:00:01Z');const pending=r.drainEmail();await waiting;await r.shop.setStatus({id:row.id,revision:row.revision,requestKey:randomUUID(),status:'cancelled'},'owner');release();await pending;assert.equal((await r.reminders.list())[0].state,'sent');assert.equal((await r.db.prepare('SELECT email FROM ilker_reminder_consent WHERE booking_id=?').get(row.id)).email,'');
});

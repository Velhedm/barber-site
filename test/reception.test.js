'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {createApp}=require('../server/app');const {phoneKey,allocate}=require('../server/reception-domain');
async function fixture(t){let current=Date.parse('2030-01-01T04:00:00Z');const app=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,now:()=>current,vapid:{}});t.after(()=>app.close());
 for(const category of ['zal','vip']){await app.shop.setDuration('haircut',category,90);await app.shop.setDuration('beard_cut',category,30);}
 for(const id of ['master-1','master-2']){const m=(await app.shop.masters()).find(m=>m.id===id);await app.shop.saveMaster({id,name:'',online:id==='master-1',archived:false,revision:m.revision,stepMinutes:30,serviceIds:['haircut','beard_cut'],schedule:Array.from({length:7},()=>({closed:false,start:'09:00',end:'21:00',breaks:[{start:'13:00',end:'14:00'}]}))});}
 const request=(extra={})=>({name:'Synthetic client',phone:'+994 (50) 000-00-01',date:'2030-01-02',time:'11:00',serviceIds:['haircut'],masterId:'master-1',room:'zal',requestKey:randomUUID(),...extra});
 const change=(row,extra={})=>({id:row.id,revision:row.revision,requestKey:randomUUID(),...extra});return {...app,request,change,setNow:v=>current=Date.parse(v)};
}
test('reception can book offline master; normalizes clients and protects profiles from public writes',async t=>{
 const {shop,request}=await fixture(t);await assert.rejects(shop.book(request({masterId:'master-2'})),{status:409});
 const first=await shop.book(request({masterId:'master-2'}),{internal:true,actor:'owner'});assert.equal(first.source,'reception');
 const second=await shop.book(request({phone:'0500000001',name:'Different booking name'}));assert.equal(second.client_id,first.client_id);
 const clients=await shop.clients({q:'500000001'});assert.equal(clients.count,1);assert.equal(clients.rows[0].name,'Synthetic client');assert.equal(clients.rows[0].visits,2);assert.equal(second.name,'Different booking name');
 assert.equal(phoneKey('+994 50 000 00 01'),phoneKey('0500000001'));assert.equal(phoneKey('00994500000001'),phoneKey('500000001'));
});
test('transfer preserves original snapshots and frees old interval; conflicting transfer rolls back',async t=>{
 const {shop,request,change}=await fixture(t);let visit=await shop.book(request());
 await shop.setDuration('haircut','zal',30);
 const move=change(visit,{date:'2030-01-03',time:'10:00',masterId:'master-2',room:'zal',serviceIds:['haircut']});
 visit=await shop.reschedule(move);assert.equal(visit.duration_minutes,90);assert.equal(visit.actual_price,3500);assert.equal(visit.master_id,'master-2');
 assert.equal((await shop.reschedule(move)).revision,visit.revision);
 assert.equal((await shop.availabilityInput(request())).slots.find(s=>s.time==='11:00').status,'available');
 await shop.book(request({masterId:'master-2',date:'2030-01-03',time:'15:00'}),{internal:true});
 await assert.rejects(shop.reschedule(change(visit,{date:'2030-01-03',time:'15:00',masterId:'master-2',room:'zal',serviceIds:['haircut']})),{status:409});
 assert.equal((await shop.getBooking(visit.id)).time,'10:00');
 await assert.rejects(shop.reschedule({...move,requestKey:randomUUID(),time:'17:00'}),{status:409});
 const updated=await shop.reschedule(change(visit,{date:'2030-01-03',time:'16:00',masterId:'master-2',room:'vip',serviceIds:['haircut','beard_cut']}));assert.equal(updated.duration_minutes,120);assert.equal(updated.price_min,9500);assert.equal(updated.items.length,2);
});
test('concurrent transfers keep exactly one target booking and retain losing source',async t=>{
 const {shop,request,change}=await fixture(t);const a=await shop.book(request({time:'09:00'})),b=await shop.book(request({time:'15:00'}));
 const results=await Promise.allSettled([a,b].map(row=>shop.reschedule(change(row,{time:'17:00',date:'2030-01-02',masterId:'master-2',serviceIds:['haircut'],room:'zal'}))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 const stored=await shop.listBookings();assert.equal(stored.count,2);assert.equal(stored.rows.filter(r=>r.time==='17:00').length,1);
});
test('attendance, completion, correction and paid cancellation preserve append-only financial history',async t=>{
 const {shop,request,change,setNow,db}=await fixture(t);let row=await shop.book(request({serviceIds:['haircut','beard_cut'],time:'10:00'}));
 await assert.rejects(shop.setStatus(change(row,{status:'no_show'})),{status:409});
 setNow('2030-01-02T06:00:00Z');row=await shop.setStatus(change(row,{status:'arrived'}));
 assert.equal((await shop.availabilityInput(request({time:'11:00'}))).slots.find(s=>s.time==='11:00').status,'booked');
 await assert.rejects(shop.setStatus(change(row,{status:'completed'})),{status:409});setNow('2030-01-02T09:00:00Z');
 const completion=change(row,{status:'completed'});row=await shop.setStatus(completion);await shop.setStatus(completion);assert.equal(row.paid_minor,5500);
 const correction=change(row,{totalMinor:5001,reason:'discount'});row=await shop.adjustFinance(correction);await shop.adjustFinance(correction);
 assert.equal((await shop.ledgerHistory(row.id)).length,2);assert.equal((await shop.finance({from:row.date,to:row.date})).totalMinor,5001);
 const shares=await db.prepare('SELECT SUM(amount) AS n FROM ilker_finance_items').get();assert.equal(shares.n,5001);
 row=await shop.setStatus(change(row,{status:'cancelled'}));assert.equal(row.paid_minor,5001);assert.equal((await shop.finance({from:row.date,to:row.date})).cancellations,1);
 await shop.remove(row.id);assert.equal((await shop.finance()).totalMinor,5001);
 await assert.rejects(shop.adjustFinance(change(row,{totalMinor:0,reason:'refund'})),{status:409}); // archive changed revision
 const latest=await shop.getBooking(row.id);await shop.adjustFinance(change(latest,{totalMinor:0,reason:'refund'}));assert.equal((await shop.finance()).totalMinor,0);assert.equal((await shop.ledgerHistory(row.id)).length,3);
 const audit=await db.prepare("SELECT details_json FROM ilker_audit WHERE action='finance_adjustment'").all();assert.equal(audit.length,2);assert.ok(audit.every(r=>!r.details_json.includes('Synthetic')));
});
test('CRM editing, history and anonymization remove contacts but preserve money and service history',async t=>{
 const {shop,request,change,setNow}=await fixture(t);let visit=await shop.book(request());let client=(await shop.clients()).rows[0];
 await shop.saveClient({...client,name:'Updated profile',phone:'+994500000002',notes:'Private note'});
 assert.equal((await shop.getBooking(visit.id)).phone,visit.phone); // historical snapshot preserved
 await assert.rejects(shop.saveClient({...client,name:'Stale'}),{status:409});
 client=(await shop.clients()).rows[0];await assert.rejects(shop.anonymizeClient(client),{status:409});
 visit=await shop.comment(change(visit,{notes:'Private visit note'}));setNow('2030-01-02T10:00:00Z');visit=await shop.setStatus(change(visit,{status:'completed'}));
 await shop.anonymizeClient(client);const clean=await shop.getBooking(visit.id);assert.equal(clean.name,'Клиент удалён');assert.equal(clean.phone,'');assert.equal(clean.notes,'');assert.equal(clean.paid_minor,3500);assert.equal(clean.items.length,1);assert.equal((await shop.clients()).count,0);
 await assert.rejects(shop.comment(change(clean,{notes:'attempt'})),{status:409});
 const newClient=await shop.saveClient({name:'New profile',phone:client.phone});assert.notEqual(newClient.id,client.id);
});
test('financial distribution preserves exact total even with large values and zero-priced services',()=>{
 const items=[{price_min:999999999},{price_min:999999999},{price_min:0}];assert.equal(allocate(999999999,items).reduce((s,i)=>s+i.amount,0),999999999);assert.equal(allocate(-101,[{price_min:0},{price_min:0}]).reduce((s,i)=>s+i.amount,0),-101);
});
test('editing ongoing services checks overlaps; transfer resets arrival; client retries do not duplicate',async t=>{
 const {shop,request,change,setNow}=await fixture(t);let row=await shop.book(request({time:'10:00'}));setNow('2030-01-02T06:10:00Z');row=await shop.setStatus(change(row,{status:'arrived'}));
 row=await shop.reschedule(change(row,{time:'10:00',date:row.date,masterId:row.master_id,room:'zal',serviceIds:['haircut','beard_cut']}));assert.equal(row.duration_minutes,120);assert.equal(row.status,'arrived');
 row=await shop.reschedule(change(row,{time:'15:00',date:row.date,masterId:row.master_id,room:'zal',serviceIds:['haircut','beard_cut']}));assert.equal(row.status,'active');
 const input={name:'Retry Client',phone:'+994500000003',notes:'Line one\nLine two',requestKey:randomUUID()};const client=await shop.saveClient(input);assert.equal((await shop.saveClient(input)).id,client.id);assert.equal((await shop.clients()).count,2);
});
test('ledger failure rolls back completion and revision; repeat after recovery books income once',async t=>{
 const {shop,request,change,setNow,db}=await fixture(t);const row=await shop.book(request());setNow('2030-01-02T10:00:00Z');const input=change(row,{status:'completed'});
 await db.exec("CREATE TRIGGER fail_ledger BEFORE INSERT ON ilker_finance_entries BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;");await assert.rejects(shop.setStatus(input));const after=await shop.getBooking(row.id);assert.equal(after.status,'active');assert.equal(after.revision,row.revision);assert.equal(after.paid_minor,0);
 await db.exec('DROP TRIGGER fail_ledger');await shop.setStatus(input);await shop.setStatus(input);assert.equal((await shop.finance()).totalMinor,3500);assert.equal((await shop.ledgerHistory(row.id)).length,1);
});
test('historical unassigned visits can be assigned safely without losing original price or CRM link',async t=>{
 const {shop,db,change}=await fixture(t),id=randomUUID();await db.prepare("INSERT INTO ilker_appointments(id,date,time,kind,name,phone,service_id,service_name,room,price_min,price_max,actual_price,duration_minutes,created_at) VALUES(?,'2030-01-02','11:00','booking','Synthetic legacy','+994500000009','haircut','Historic haircut','zal',2500,2500,2500,60,'2030-01-01')").run(id);
 await shop.linkCreated(id);const row=await shop.getBooking(id);const result=await shop.reschedule(change(row,{date:row.date,time:row.time,masterId:'master-1',room:'zal',serviceIds:['haircut']}));assert.equal(result.actual_price,2500);assert.equal(result.duration_minutes,60);assert.equal(result.client_id,row.client_id);assert.equal(result.service_name,'Historic haircut');
});

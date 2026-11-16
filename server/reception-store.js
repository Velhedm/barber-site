'use strict';
const {randomUUID,createHash}=require('node:crypto');
const {failure,minute,dateValid,dayFor,windowOf,overlaps}=require('./scheduling');
const {phoneKey,clean,range,allocate}=require('./reception-domain');
const UUID=/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i;
const integer=(v,min=0,max=999999999)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw failure(400,'Invalid details');return v;};
const snapshotItem=i=>({serviceId:i.service_id,name:i.service_name,priceMin:i.price_min,priceMax:i.price_max,durationMinutes:i.duration_minutes,sessions:i.sessions_count});
const financeReasons=['discount','refund','correction'];
const noteText=value=>{if(value===undefined||value===null)return '';if(typeof value!=='string'||value.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw failure(400,'Invalid details');return value.trim();};

async function createReceptionStore(db,base,{now=()=>Date.now()}={}){
 if(!await db.prepare('SELECT version FROM ilker_management_versions WHERE version=2').get())throw new Error('Reception migration required');
 const iso=()=>new Date(now()).toISOString(),today=()=>new Date(now()+14400000).toISOString().slice(0,10);
 async function clientFor(name,phone){
  const key=phoneKey(phone);let client=await db.prepare('SELECT * FROM ilker_clients WHERE phone_key=? AND anonymized=0').get(key);
  if(!client){const id=randomUUID();await db.prepare('INSERT INTO ilker_clients(id,name,phone,phone_key,created_at) VALUES(?,?,?,?,?)').run(id,name,phone,key,iso());client=await db.prepare('SELECT * FROM ilker_clients WHERE id=?').get(id);}
  // Unauthenticated booking must never overwrite an existing private customer profile.
  return client;
 }
 async function linkCreated(id,{internal=false}={}){
  const row=await db.prepare('SELECT name,phone FROM ilker_appointments WHERE id=?').get(id),client=await clientFor(row.name,row.phone);
  await db.prepare('INSERT INTO ilker_visit_state(booking_id,client_id,source) VALUES(?,?,?)').run(id,client.id,internal?'reception':'online');
 }
 const joins=`FROM ilker_appointments b LEFT JOIN ilker_booking_assignment a ON a.booking_id=b.id
  LEFT JOIN ilker_visit_state v ON v.booking_id=b.id LEFT JOIN ilker_clients c ON c.id=v.client_id
  LEFT JOIN (SELECT booking_id,SUM(amount) AS paid FROM ilker_finance_entries GROUP BY booking_id) f ON f.booking_id=b.id`;
 const columns=`b.id,b.date,b.time,b.kind,b.status,b.name,b.phone,b.service_id,b.room,b.service_name,b.price_min,b.price_max,b.actual_price,b.duration_minutes,b.sessions_count,b.created_at,
  a.master_id,a.master_name,a.room_id,a.room_name,v.revision,v.client_id,v.notes,v.source,c.anonymized,
  COALESCE(f.paid,0) AS paid_minor,CASE WHEN EXISTS(SELECT 1 FROM ilker_booking_archive ba WHERE ba.booking_id=b.id) THEN 1 ELSE 0 END AS archived`;
 async function hydrate(rows){const map=await base.itemsFor(rows.map(r=>r.id));return rows.map(row=>({...row,archived:Boolean(row.archived),anonymized:Boolean(row.anonymized),items:map.get(row.id)||[]}));}
 async function getBooking(id){const row=await db.prepare(`SELECT ${columns} ${joins} WHERE b.id=? AND b.kind='booking'`).get(id);if(!row)throw failure(404,'Booking not found');return (await hydrate([row]))[0];}
 async function publicResult(row){return row.kind==='block'?base.publicResult(row):getBooking(row.id);}
 const book=async(input,options)=>{const row=await base.book(input,options);return getBooking(row.id);};
 function revision(row,expected){if(!Number.isInteger(expected)||expected!==row.revision)throw failure(409,'Changed elsewhere; reload');}
 async function bump(id){await db.prepare('UPDATE ilker_visit_state SET revision=revision+1 WHERE booking_id=?').run(id);}
 async function operation(action,input,actor,fn){
  if(!UUID.test(input.requestKey||''))throw failure(400,'Invalid request key');
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return db.transaction(async()=>{
   const previous=await db.prepare('SELECT * FROM ilker_operations WHERE request_key=?').get(input.requestKey);
   if(previous){if(previous.action!==action||previous.entity_id!==input.id||previous.request_hash!==hash)throw failure(409,'Booking retry differs');return getBooking(input.id);}
   const row=await getBooking(input.id);revision(row,input.revision);
   await fn(row);
   await bump(row.id);
   await db.prepare('INSERT INTO ilker_operations(request_key,action,entity_id,request_hash,created_at) VALUES(?,?,?,?,?)').run(input.requestKey,action,row.id,hash,iso());
   return getBooking(row.id);
  });
 }
 function snapshot(row){return {date:row.date,time:row.time,masterId:row.master_id,roomId:row.room_id,category:row.room,duration:row.duration_minutes,priceMin:row.price_min,priceMax:row.price_max,status:row.status,items:row.items};}
 async function planChange(input){
  const previous=await getBooking(input.id);if(!['active','arrived'].includes(previous.status)||previous.archived)throw failure(409,'Booking cannot be changed');
  const ids=input.serviceIds;
  const original=previous.items.length?previous.items:[{service_id:previous.service_id,service_name:previous.service_name,price_min:previous.price_min,price_max:previous.price_max,duration_minutes:previous.duration_minutes,sessions_count:previous.sessions_count}];
  const same=Array.isArray(ids)&&ids.length===original.length&&original.every(item=>ids.includes(item.service_id))&&input.room===previous.room;
  // Preserve original quote and length for a pure date/time/master transfer.
  const chosenOverride=same?ids.map(id=>snapshotItem(original.find(item=>item.service_id===id))):null;
  const plan=await base.planVisit(input,{internal:true,ignoreId:previous.id,chosenOverride,allowPastTime:input.date===previous.date&&input.time===previous.time?previous.time:null});
  return {...plan,previous,same};
 }
 async function adminAvailability(input){
  const plan=input.id?await planChange(input):await base.planVisit(input,{internal:true});return {...plan.data,priceMin:plan.chosen.reduce((s,i)=>s+i.priceMin,0),priceMax:plan.chosen.reduce((s,i)=>s+i.priceMax,0)};
 }
 async function reschedule(input,actor='owner'){
  return operation('reschedule',input,actor,async row=>{
   const {data,master,chosen,same}=await planChange(input);
   if(!data.slots.some(s=>s.time===input.time&&s.status==='available'))throw failure(409,'Time unavailable');
   const min=chosen.reduce((s,i)=>s+i.priceMin,0),max=chosen.reduce((s,i)=>s+i.priceMax,0);
   if(input.expectedQuote&&(input.expectedQuote.min!==min||input.expectedQuote.max!==max||input.expectedQuote.duration!==data.durationMinutes))throw failure(409,'Quote changed');
   integer(min);integer(max);
   const masterName=master.name||`Мастер ${master.position}`;
   await db.prepare('UPDATE ilker_appointments SET date=?,time=?,service_id=?,room=?,service_name=?,price_min=?,price_max=?,actual_price=?,duration_minutes=?,sessions_count=?,status=? WHERE id=?')
    .run(input.date,input.time,chosen[0].serviceId,input.room,chosen.map(i=>i.name).join(', '),min,max,same?row.actual_price:min===max?min:null,data.durationMinutes,chosen.length===1?chosen[0].sessions:1,(row.date===input.date&&row.time===input.time&&row.master_id===master.id)?row.status:'active',row.id);
   await db.prepare('INSERT INTO ilker_booking_assignment(booking_id,master_id,master_name,room_id,room_name) VALUES(?,?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET master_id=excluded.master_id,master_name=excluded.master_name,room_id=excluded.room_id,room_name=excluded.room_name,revision=ilker_booking_assignment.revision+1')
    .run(row.id,master.id,masterName,master.room_id,master.room_name||null);
   if(!same){await db.prepare('DELETE FROM ilker_booking_items WHERE booking_id=?').run(row.id);await base.writeItems(row.id,chosen);}
   await base.audit(actor,'reschedule','booking',row.id,{before:snapshot(row),after:{date:input.date,time:input.time,masterId:master.id,roomId:master.room_id,category:input.room,duration:data.durationMinutes,items:chosen}});
  });
 }
 async function ledger(row,amount,reason,key,actor){
  integer(Math.abs(amount));
  const id=randomUUID();await db.prepare('INSERT INTO ilker_finance_entries(id,booking_id,amount,reason,actor,operation_key,created_at,visit_date,master_id,master_name,category) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .run(id,row.id,amount,reason,actor,key,iso(),row.date,row.master_id||null,row.master_name||null,row.room);
  const items=row.items.length?row.items:[{service_id:row.service_id,service_name:row.service_name,price_min:row.price_min}];
  const shares=allocate(amount,items);for(let i=0;i<shares.length;i++){const item=shares[i];await db.prepare('INSERT INTO ilker_finance_items(entry_id,position,service_id,service_name,amount) VALUES(?,?,?,?,?)').run(id,i,item.service_id,item.service_name,item.amount);}
 }
 async function setStatus(input,actor='owner'){
  if(!['arrived','no_show','completed','cancelled'].includes(input.status))throw failure(400,'Invalid status');
  return operation('status',input,actor,async row=>{
   if(row.status===input.status)return;
   const permitted={active:['arrived','no_show','completed','cancelled'],arrived:['completed','cancelled'],completed:['cancelled'],cancelled:[],no_show:[]};
   if(!permitted[row.status]?.includes(input.status)||row.archived)throw failure(409,'Invalid status transition');
   const start=Date.parse(`${row.date}T${row.time}:00+04:00`),end=start+row.duration_minutes*60000;
   if(input.status==='arrived'&&row.date!==today())throw failure(409,'Arrival is only allowed on visit day');
   if(input.status==='no_show'&&start>now())throw failure(409,'Visit has not started');
   if(input.status==='completed'){
    if(end>now())throw failure(409,'Visit has not finished');
    if(row.actual_price===null)throw failure(409,'Set actual price first');
    if(!await db.prepare('SELECT id FROM ilker_finance_entries WHERE operation_key=?').get('completion:'+row.id))await ledger(row,row.actual_price,'completion','completion:'+row.id,actor);
   }
   await db.prepare('UPDATE ilker_appointments SET status=? WHERE id=?').run(input.status,row.id);
   await base.audit(actor,'status','booking',row.id,{from:row.status,to:input.status,paymentPreserved:true});
  });
 }
 async function legacyStatus(id,status,actor='owner'){
  const row=await getBooking(id);if(row.status===status)return {ok:true};return setStatus({id,status,revision:row.revision,requestKey:randomUUID()},actor);
 }
 async function setActualPrice(id,price,actor='owner'){
  if(!/^\d{1,7}(?:\.\d{1,2})?$/.test(String(price)))throw failure(400,'Invalid actual price');const [whole,fraction='']=String(price).split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return db.transaction(async()=>{
   const row=await getBooking(id);if(!['active','arrived'].includes(row.status))throw failure(409,'Use financial correction');
   if(row.actual_price===amount)return row;
   if(row.price_min===row.price_max||amount<row.price_min||amount>row.price_max)throw failure(400,'Price must be within quoted range');
   await db.prepare('UPDATE ilker_appointments SET actual_price=? WHERE id=?').run(amount,id);await bump(id);await base.audit(actor,'quote_finalized','booking',id,{before:row.actual_price,after:amount});return getBooking(id);
  });
 }
 async function adjustFinance(input,actor='owner'){
  integer(input.totalMinor);if(!financeReasons.includes(input.reason))throw failure(400,'Select correction reason');
  return operation('finance',input,actor,async row=>{
   const hasEntry=await db.prepare('SELECT id FROM ilker_finance_entries WHERE booking_id=? LIMIT 1').get(row.id);
   if(!hasEntry&&row.status!=='completed')throw failure(409,'Complete the visit first');
   const delta=input.totalMinor-row.paid_minor;
   await ledger(row,delta,input.reason,input.requestKey,actor);
   // Keep the original agreed price; receipts and adjustments are an independent ledger.
   await base.audit(actor,'finance_adjustment','booking',row.id,{before:row.paid_minor,after:input.totalMinor,delta,reason:input.reason});
  });
 }
 async function comment(input,actor='owner'){
  const notes=noteText(input.notes);return operation('comment',input,actor,async row=>{
   if(row.anonymized)throw failure(409,'Client is anonymized');
   await db.prepare('UPDATE ilker_visit_state SET notes=? WHERE booking_id=?').run(notes,row.id);await base.audit(actor,'comment','booking',row.id,{changed:true});
  });
 }
 async function remove(id,actor='owner'){
  return db.transaction(async()=>{const row=await getBooking(id);if(row.archived)return {ok:true};if(row.status!=='cancelled')throw failure(409,'Cancel the booking first');
   await db.prepare('INSERT INTO ilker_booking_archive(booking_id,created_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(id,iso());await bump(id);await base.audit(actor,'archive','booking',id);return {ok:true};});
 }
 function filters(input={}){
  const conditions=["b.kind='booking'"],args=[];
  if(input.from||input.to){range(input.from,input.to);conditions.push('b.date>=? AND b.date<=?');args.push(input.from,input.to);}
  if(input.masterId){conditions.push('a.master_id=?');args.push(clean(input.masterId,80));}
  if(input.clientId){conditions.push('v.client_id=?');args.push(clean(input.clientId,80));}
  const status=['active','arrived','completed','no_show','cancelled','all'].includes(input.status)?input.status:'all';
  if(status==='active')conditions.push("b.status IN ('active','arrived')");else if(status!=='all'){conditions.push('b.status=?');args.push(status);}
  const q=clean(input.q,80,true),digits=q.replace(/\D/g,'');
  if(q){conditions.push("(LOWER(b.name) LIKE LOWER(?) ESCAPE '!' OR b.phone LIKE ? ESCAPE '!' OR (?<>'' AND c.phone_key LIKE ?))");const escaped=q.replace(/[!%_]/g,'!$&');args.push('%'+escaped+'%','%'+escaped+'%',digits,'%'+digits+'%');}
  return {where:conditions.join(' AND '),args};
 }
 async function listBookings(input={}){
  const {where,args}=filters(input),offset=integer(Number(input.offset||0),0,1000000);
  const rows=await db.prepare(`SELECT ${columns} ${joins} WHERE ${where} ORDER BY b.date DESC,b.time DESC,b.id DESC LIMIT 50 OFFSET ?`).all(...args,offset);
  const count=(await db.prepare(`SELECT COUNT(*) AS n ${joins} WHERE ${where}`).get(...args)).n;
  return {rows:await hydrate(rows),count,offset};
 }
 async function clients(input={}){
  const offset=integer(Number(input.offset||0),0,1000000),q=clean(input.q,80,true),escaped=q.replace(/[!%_]/g,'!$&'),digits=q.replace(/\D/g,''),where=["c.anonymized=0"],args=[];
  if(q){where.push("(LOWER(c.name) LIKE LOWER(?) ESCAPE '!' OR c.phone LIKE ? ESCAPE '!' OR (?<>'' AND c.phone_key LIKE ?))");args.push('%'+escaped+'%','%'+escaped+'%',digits,'%'+digits+'%');}
  if(input.masterId){where.push('EXISTS(SELECT 1 FROM ilker_visit_state v JOIN ilker_booking_assignment a ON a.booking_id=v.booking_id WHERE v.client_id=c.id AND a.master_id=?)');args.push(clean(input.masterId,80));}
  const rows=await db.prepare(`SELECT c.*,(SELECT COUNT(*) FROM ilker_visit_state v WHERE v.client_id=c.id) AS visits,
   (SELECT COUNT(*) FROM ilker_visit_state v JOIN ilker_appointments b ON b.id=v.booking_id WHERE v.client_id=c.id AND b.status='cancelled') AS cancelled,
   (SELECT COUNT(*) FROM ilker_visit_state v JOIN ilker_appointments b ON b.id=v.booking_id WHERE v.client_id=c.id AND b.status='no_show') AS no_shows,
   (SELECT COALESCE(SUM(f.amount),0) FROM ilker_visit_state v JOIN ilker_finance_entries f ON f.booking_id=v.booking_id WHERE v.client_id=c.id) AS paid_minor
   FROM ilker_clients c WHERE ${where.join(' AND ')} ORDER BY LOWER(c.name),c.id LIMIT 50 OFFSET ?`).all(...args,offset);
  const count=(await db.prepare(`SELECT COUNT(*) AS n FROM ilker_clients c WHERE ${where.join(' AND ')}`).get(...args)).n;
  return {rows:rows.map(({phone_key,...row})=>row),count,offset};
 }
 async function saveClient(input,actor='owner'){
  if(input.requestKey!==undefined&&!UUID.test(input.requestKey))throw failure(400,'Invalid request key');
  const requestHash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const name=clean(input.name,80),phone=clean(input.phone,30),key=phoneKey(phone),notes=noteText(input.notes);
  return db.transaction(async()=>{
   if(input.requestKey){const previous=await db.prepare('SELECT * FROM ilker_operations WHERE request_key=?').get(input.requestKey);if(previous){if(previous.action!=='client_save'||previous.request_hash!==requestHash)throw failure(409,'Booking retry differs');const {phone_key,...saved}=await db.prepare('SELECT * FROM ilker_clients WHERE id=?').get(previous.entity_id);return saved;}}
   const duplicate=await db.prepare('SELECT id FROM ilker_clients WHERE phone_key=?').get(key);
   if(duplicate&&duplicate.id!==input.id)throw failure(409,'Client phone already exists');
   let id=input.id;
   if(id){const row=await db.prepare('SELECT * FROM ilker_clients WHERE id=? AND anonymized=0').get(id);if(!row)throw failure(404,'Client not found');revision(row,input.revision);
    await db.prepare('UPDATE ilker_clients SET name=?,phone=?,phone_key=?,notes=?,revision=revision+1 WHERE id=?').run(name,phone,key,notes,id);
   }else{id=randomUUID();await db.prepare('INSERT INTO ilker_clients(id,name,phone,phone_key,notes,created_at) VALUES(?,?,?,?,?,?)').run(id,name,phone,key,notes,iso());}
   if(input.requestKey)await db.prepare('INSERT INTO ilker_operations(request_key,action,entity_id,request_hash,created_at) VALUES(?,?,?,?,?)').run(input.requestKey,'client_save',id,requestHash,iso());
   await base.audit(actor,'save','client',id,{contactChanged:true});const {phone_key,...safe}=await db.prepare('SELECT * FROM ilker_clients WHERE id=?').get(id);return safe;
  });
 }
 async function anonymizeClient(input,actor='owner'){
  return db.transaction(async()=>{
   const row=await db.prepare('SELECT * FROM ilker_clients WHERE id=?').get(input.id);if(!row)throw failure(404,'Client not found');
   if(row.anonymized)return {ok:true};revision(row,input.revision);
   if(await db.prepare("SELECT 1 FROM ilker_visit_state v JOIN ilker_appointments b ON b.id=v.booking_id WHERE v.client_id=? AND b.status IN ('active','arrived') LIMIT 1").get(input.id))throw failure(409,'Resolve active visits before anonymizing');
   await db.prepare("UPDATE ilker_appointments SET name='Клиент удалён',phone='' WHERE id IN (SELECT booking_id FROM ilker_visit_state WHERE client_id=?)").run(input.id);
   await db.prepare("UPDATE ilker_visit_state SET notes='',revision=revision+1 WHERE client_id=?").run(input.id);
   await db.prepare("UPDATE ilker_clients SET name='Клиент удалён',phone='',phone_key=NULL,notes='',anonymized=1,revision=revision+1 WHERE id=?").run(input.id);
   await base.audit(actor,'anonymize','client',input.id,{contactsRemoved:true,financialHistoryPreserved:true});return {ok:true};
  });
 }
 async function finance(input={}){
  const {from,to}=range(input.from||'2000-01-01',input.to||'2099-12-31',input.from?366:40000),masterId=clean(input.masterId,80,true),args=[from,to,masterId,masterId];
  const where="f.visit_date>=? AND f.visit_date<=? AND (?='' OR f.master_id=?)";
  const total=(await db.prepare(`SELECT COALESCE(SUM(f.amount),0) AS total FROM ilker_finance_entries f WHERE ${where}`).get(...args)).total;
  const masters=await db.prepare(`SELECT f.master_id,MAX(f.master_name) AS master_name,COALESCE(SUM(f.amount),0) AS total FROM ilker_finance_entries f WHERE ${where} GROUP BY f.master_id`).all(...args);
  const services=await db.prepare(`SELECT i.service_id,MAX(i.service_name) AS service_name,COALESCE(SUM(i.amount),0) AS total FROM ilker_finance_items i JOIN ilker_finance_entries f ON f.id=i.entry_id WHERE ${where} GROUP BY i.service_id`).all(...args);
  const rooms=await db.prepare(`SELECT f.category AS room,COALESCE(SUM(f.amount),0) AS total FROM ilker_finance_entries f WHERE ${where} GROUP BY f.category`).all(...args);
  const counts=await db.prepare(`SELECT b.status,COUNT(*) AS n FROM ilker_appointments b LEFT JOIN ilker_booking_assignment a ON a.booking_id=b.id WHERE b.kind='booking' AND b.date>=? AND b.date<=? AND (?='' OR a.master_id=?) GROUP BY b.status`).all(...args);
  const unpriced=(await db.prepare(`SELECT COUNT(*) AS n FROM ilker_appointments b LEFT JOIN ilker_booking_assignment a ON a.booking_id=b.id WHERE b.kind='booking' AND b.status='completed' AND NOT EXISTS(SELECT 1 FROM ilker_finance_entries e WHERE e.booking_id=b.id) AND b.date>=? AND b.date<=? AND (?='' OR a.master_id=?)`).get(...args)).n;
  return {from,to,totalMinor:total,total:(total/100).toFixed(2),visits:counts.find(r=>r.status==='completed')?.n||0,cancellations:counts.find(r=>r.status==='cancelled')?.n||0,noShows:counts.find(r=>r.status==='no_show')?.n||0,unpriced,masters,services,rooms};
 }
 async function ledgerHistory(id){await getBooking(id);return db.prepare('SELECT id,amount,reason,actor,created_at FROM ilker_finance_entries WHERE booking_id=? ORDER BY created_at,id').all(id);}
 async function dashboard(value=today()){
  if(!dateValid(value))throw failure(400,'Invalid date');
  const rows=await db.prepare(`SELECT ${columns} ${joins} WHERE b.kind='booking' AND b.date=? ORDER BY b.time,b.id LIMIT 500`).all(value);
  const count=(await db.prepare("SELECT COUNT(*) AS n FROM ilker_appointments WHERE kind='booking' AND date=?").get(value)).n;
  const activeRows=await db.prepare("SELECT b.time,b.duration_minutes,a.master_id,a.room_id FROM ilker_appointments b LEFT JOIN ilker_booking_assignment a ON a.booking_id=b.id WHERE b.date=? AND b.status IN ('active','arrived')").all(value);
  const customers=(await db.prepare("SELECT COUNT(DISTINCT v.client_id) AS n FROM ilker_visit_state v JOIN ilker_appointments b ON b.id=v.booking_id WHERE b.date=?").get(value)).n;
  const rooms=await base.rooms();
  const counts=await db.prepare("SELECT status,COUNT(*) AS n FROM ilker_appointments WHERE kind='booking' AND date=? GROUP BY status").all(value);
  const currentMinute=value===today()?Number(new Date(now()+14400000).toISOString().slice(11,13))*60+Number(new Date(now()+14400000).toISOString().slice(14,16)):null;
  const all=await base.masters(),exceptions=await db.prepare('SELECT master_id,day_json FROM ilker_master_days WHERE date=?').all(value),blocks=await db.prepare('SELECT master_id,start_minute,end_minute FROM ilker_time_blocks WHERE date=?').all(value);
  const closed=await db.prepare('SELECT 1 FROM ilker_closed_days WHERE date=?').get(value);
  const masterStates=all.map(m=>{const day=dayFor(value,m.schedule,exceptions.find(e=>e.master_id===m.id)?JSON.parse(exceptions.find(e=>e.master_id===m.id).day_json):null);
   let status='off';if(currentMinute!==null&&!closed&&!day.closed){const span=windowOf(day);if(currentMinute>=span.start&&currentMinute<span.end){const point={start:currentMinute,end:currentMinute+1};status='free';if(day.breaks.some(b=>overlaps(point,windowOf(b)))||blocks.some(b=>b.master_id===m.id&&overlaps(point,{start:b.start_minute,end:b.end_minute})))status='blocked';
    if(activeRows.some(b=>(!b.master_id||b.master_id===m.id)&&overlaps(point,{start:minute(b.time),end:minute(b.time)+b.duration_minutes})))status='busy';
    if(status==='free'&&m.room_id){const room=rooms.find(r=>r.id===m.room_id);if(!room||room.archived||activeRows.filter(b=>b.room_id===m.room_id&&overlaps(point,{start:minute(b.time),end:minute(b.time)+b.duration_minutes})).length>=room.capacity)status='blocked';}}}
   return {id:m.id,name:m.name||`Мастер ${m.position}`,status};});
  const next=rows.find(b=>['active','arrived'].includes(b.status)&&Date.parse(`${value}T${b.time}:00+04:00`)+b.duration_minutes*60000>now());
  const summary=await finance({from:value,to:value});
  return {date:value,count,customers,counts,masterStates,next:next?(await hydrate([next]))[0]:null,rows:await hydrate(rows),truncated:count>500,revenueMinor:summary.totalMinor};
 }
 async function history(masterId,offset=0){const list=await listBookings({masterId,offset});const revenue=await finance({masterId});return {rows:list.rows,count:list.count,revenue:{total:revenue.totalMinor,completed:revenue.visits}};}
 return {...base,linkCreated,book,publicResult,getBooking,adminAvailability,reschedule,setStatus,cancel:(id,actor)=>legacyStatus(id,'cancelled',actor),complete:(id,actor)=>legacyStatus(id,'completed',actor),setActualPrice,adjustFinance,comment,remove,listBookings,clients,saveClient,anonymizeClient,finance,revenue:()=>finance(),ledgerHistory,dashboard,history};
}
module.exports={createReceptionStore};

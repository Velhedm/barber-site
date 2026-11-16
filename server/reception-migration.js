'use strict';
const {randomUUID}=require('node:crypto');
const {phoneKey,allocate}=require('./reception-domain');
async function migrateReception(db){
 return db.transaction(async()=>{
  if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=2').get())return {alreadyApplied:true};
  await db.exec(`
   CREATE TABLE ilker_clients(id TEXT PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL,phone_key TEXT UNIQUE,
    notes TEXT NOT NULL DEFAULT '',anonymized INTEGER NOT NULL DEFAULT 0 CHECK(anonymized IN (0,1)),revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
   CREATE TABLE ilker_visit_state(booking_id TEXT PRIMARY KEY REFERENCES ilker_appointments(id),client_id TEXT REFERENCES ilker_clients(id),
    notes TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,source TEXT NOT NULL DEFAULT 'legacy');
   CREATE INDEX ilker_visits_by_client ON ilker_visit_state(client_id);
   CREATE TABLE ilker_operations(request_key TEXT PRIMARY KEY,action TEXT NOT NULL,entity_id TEXT NOT NULL,request_hash TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE TABLE ilker_finance_entries(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES ilker_appointments(id),
    amount INTEGER NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,operation_key TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,
    visit_date TEXT NOT NULL,master_id TEXT REFERENCES ilker_masters(id),master_name TEXT,category TEXT NOT NULL);
   CREATE INDEX ilker_finance_by_booking ON ilker_finance_entries(booking_id);
   CREATE INDEX ilker_finance_by_date ON ilker_finance_entries(visit_date);
   CREATE TABLE ilker_finance_items(entry_id TEXT NOT NULL REFERENCES ilker_finance_entries(id),position INTEGER NOT NULL,
    service_id TEXT NOT NULL,service_name TEXT NOT NULL,amount INTEGER NOT NULL,PRIMARY KEY(entry_id,position));
  `);
  // Add references; do not rewrite customer names, old visits or original price snapshots.
  const visits=await db.prepare("SELECT b.*,a.master_id,a.master_name FROM ilker_appointments b LEFT JOIN ilker_booking_assignment a ON a.booking_id=b.id WHERE b.kind='booking' ORDER BY b.created_at,b.id").all();
  for(const row of visits){
   let key=null;try{key=phoneKey(row.phone);}catch{/* Preserve invalid legacy contacts for manual review, never guess. */}
   let customer=key?await db.prepare('SELECT id FROM ilker_clients WHERE phone_key=?').get(key):null;
   if(!customer){customer={id:randomUUID()};await db.prepare('INSERT INTO ilker_clients(id,name,phone,phone_key,created_at) VALUES(?,?,?,?,?)').run(customer.id,row.name||'',row.phone||'',key,row.created_at);}
   await db.prepare('INSERT INTO ilker_visit_state(booking_id,client_id) VALUES(?,?)').run(row.id,customer.id);
   if(row.status==='completed'&&row.actual_price!==null){
    const id=randomUUID();await db.prepare('INSERT INTO ilker_finance_entries(id,booking_id,amount,reason,actor,operation_key,created_at,visit_date,master_id,master_name,category) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,row.id,row.actual_price,'opening_balance','migration','completion:'+row.id,new Date().toISOString(),row.date,row.master_id||null,row.master_name||null,row.room||'zal');
    let items=await db.prepare('SELECT service_id,service_name,price_min FROM ilker_booking_items WHERE booking_id=? ORDER BY position').all(row.id);
    if(!items.length)items=[{service_id:row.service_id||'legacy',service_name:row.service_name||'',price_min:row.price_min||0}];
    const allocated=allocate(row.actual_price,items);for(let i=0;i<allocated.length;i++){const item=allocated[i];await db.prepare('INSERT INTO ilker_finance_items(entry_id,position,service_id,service_name,amount) VALUES(?,?,?,?,?)').run(id,i,item.service_id,item.service_name,item.amount);}
   }
  }
  await db.prepare('INSERT INTO ilker_management_versions(version,applied_at) VALUES(2,?)').run(new Date().toISOString());return {alreadyApplied:false};
 });
}
module.exports={migrateReception};

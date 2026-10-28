'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const path=require('node:path');
const {mkdirSync}=require('node:fs');
const schema=`
 CREATE TABLE IF NOT EXISTS slots(id TEXT PRIMARY KEY,date TEXT NOT NULL,time TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('booking','block')),status TEXT NOT NULL DEFAULT 'active',name TEXT,phone TEXT,service_id TEXT,request_key TEXT UNIQUE,created_at TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS unique_active_slot ON slots(date,time) WHERE status='active';
 CREATE TABLE IF NOT EXISTS closed_days(date TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,endpoint TEXT UNIQUE NOT NULL,subscription TEXT NOT NULL,created_at BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS push_events(id EVENT_ID,booking_id TEXT NOT NULL UNIQUE REFERENCES slots(id) ON DELETE CASCADE,created_at BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS push_deliveries(id EVENT_ID,event_id BIGINT NOT NULL REFERENCES push_events(id) ON DELETE CASCADE,subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,attempts INTEGER NOT NULL DEFAULT 0,next_attempt BIGINT NOT NULL DEFAULT 0,sent_at BIGINT,last_error TEXT,UNIQUE(event_id,subscription_id));
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires BIGINT NOT NULL);
`;
async function createDatabase(options={}){
 const url=options.databaseUrl??process.env.DATABASE_URL;
 const context=new AsyncLocalStorage();
 let queue=Promise.resolve();
 function exclusive(fn){const task=queue.then(fn,fn);queue=task.catch(()=>{});return task;}
 if(!url){
  const {DatabaseSync}=require('node:sqlite');
  const filename=options.databasePath||process.env.DB_PATH||'data/bookings.sqlite';
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
  const sqlite=new DatabaseSync(filename);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  sqlite.exec(schema.replaceAll('EVENT_ID','INTEGER PRIMARY KEY')+'DROP TABLE IF EXISTS outbox;');
  const execute=fn=>context.getStore()?Promise.resolve().then(fn):exclusive(fn);
  return {
   prepare(sql){return Object.fromEntries(['get','all','run'].map(method=>[method,(...args)=>execute(()=>sqlite.prepare(sql)[method](...args))]));},
   exec:sql=>execute(()=>sqlite.exec(sql)),
   transaction:fn=>exclusive(()=>context.run(true,async()=>{sqlite.exec('BEGIN IMMEDIATE');try{const value=await fn();sqlite.exec('COMMIT');return value;}catch(e){sqlite.exec('ROLLBACK');throw e;}})),
   close:()=>exclusive(()=>sqlite.close())
  };
 }
 // Neon uses TLS WebSockets, so no persistent TCP connection is required.
 const {Pool,neonConfig,types}=require('@neondatabase/serverless');
 const WebSocket=require('ws');
 // Proxy support is opt-in for development environments. Render connects directly over WSS.
 if(options.proxyUrl){const {HttpsProxyAgent}=require('https-proxy-agent');const agent=new HttpsProxyAgent(options.proxyUrl);neonConfig.webSocketConstructor=class extends WebSocket{constructor(address,protocols){super(address,protocols,{agent});}};}
 else neonConfig.webSocketConstructor=WebSocket;
 types.setTypeParser(20,value=>Number(value));
 const pool=new Pool({connectionString:url,max:5,connectionTimeoutMillis:20000,idleTimeoutMillis:30000});
 pool.on('error',()=>console.error('Database connection interrupted'));
 try{await pool.query(schema.replaceAll('EVENT_ID','BIGSERIAL PRIMARY KEY'));}catch(e){await pool.end();throw e;}
 const query=async(sql,args=[])=>{
  let index=0;const converted=sql.replaceAll('?',()=>'$'+(++index)).replaceAll('instr(name,$4)>0',"position($4 in name)>0").replaceAll('instr(phone,$5)>0',"position($5 in phone)>0");
  return (context.getStore()||pool).query(converted,args);
 };
 return {
  prepare(sql){return {
   get:async(...args)=>(await query(sql,args)).rows[0],
   all:async(...args)=>(await query(sql,args)).rows,
   run:async(...args)=>{const result=await query(sql,args);return {changes:result.rowCount,lastInsertRowid:result.rows[0]?.id};}
  };},
  exec:sql=>query(sql),
  transaction:async fn=>{const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(7234981)');const value=await context.run(client,fn);await client.query('COMMIT');return value;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}},
  close:()=>pool.end()
 };
}
module.exports={createDatabase};

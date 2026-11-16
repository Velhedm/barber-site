'use strict';
const {randomUUID,createHmac,createHash}=require('node:crypto');
const {hashPassword}=require('./access-store');
const sha=value=>createHash('sha256').update(value).digest('hex');
const failure=(status,message)=>Object.assign(new Error(message),{status});
const address=value=>typeof value==='string'&&value.trim().length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value.trim())?value.trim().toLowerCase():null;
const credentialTag=user=>sha(user.password_hash+'\n'+user.role);
const texts={
 ru:{verify:'Подтвердите Email для восстановления доступа',reset:'Восстановление доступа',verifyBody:'Подтвердите этот адрес Email для панели İlker Sevim.',resetBody:'Установите новый пароль для панели İlker Sevim.',end:'Ссылка действует 30 минут и используется один раз. Если Вы не отправляли запрос, проигнорируйте письмо.'},
 az:{verify:'Girişi bərpa etmək üçün Email ünvanını təsdiqləyin',reset:'Girişin bərpası',verifyBody:'İlker Sevim paneli üçün bu Email ünvanını təsdiqləyin.',resetBody:'İlker Sevim paneli üçün yeni şifrə təyin edin.',end:'Keçid 30 dəqiqə ərzində bir dəfə istifadə edilə bilər. Sorğunu siz göndərməmisinizsə, məktuba məhəl qoymayın.'},
 en:{verify:'Confirm your recovery email',reset:'Account recovery',verifyBody:'Confirm this email address for your İlker Sevim dashboard.',resetBody:'Set a new password for your İlker Sevim dashboard.',end:'This link expires in 30 minutes and can be used once. If you did not request this, ignore this email.'}
};
async function createRecoveryStore(db,{now=Date.now,access,audit,provider,key,origin}){
 if(!await db.prepare('SELECT version FROM ilker_management_versions WHERE version=7').get())throw new Error('Recovery migration required');
 let base='';try{const url=new URL(origin);if(url.protocol==='https:'&&!url.username&&!url.password&&url.origin===origin)base=url.origin;}catch{}
 const enabled=Boolean(provider?.configured&&/^[a-f0-9]{64,128}$/i.test(key||'')&&base);
 const keyTag=enabled?sha(key):'';
 const token=id=>createHmac('sha256',Buffer.from(key,'hex')).update('ilker-recovery-v1:'+id).digest('hex');
 const user=id=>db.prepare('SELECT * FROM ilker_users WHERE id=? AND active=1').get(id);
 function requireEnabled(){if(!enabled)throw failure(503,'Email recovery is not configured');}
 async function throttle(email){
  const bucket='recovery:'+sha(email),existing=await db.prepare('SELECT attempts,resets_at FROM ilker_login_attempts WHERE bucket=?').get(bucket);
  if(existing&&existing.resets_at>now()&&existing.attempts>=3)return false;
  if(existing&&existing.resets_at<=now())await db.prepare('DELETE FROM ilker_login_attempts WHERE bucket=?').run(bucket);
  await db.prepare('INSERT INTO ilker_login_attempts(bucket,attempts,resets_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=ilker_login_attempts.attempts+1').run(bucket,now()+3600000);return true;
 }
 async function issue(current,email,kind){
  const id=randomUUID();
  // Replacing a verification address invalidates previously mailed verification links.
  if(kind==='verify')await db.prepare("UPDATE ilker_recovery_requests SET used_at=? WHERE user_id=? AND kind='verify' AND used_at IS NULL").run(now(),current.id);
  await db.prepare('INSERT INTO ilker_recovery_requests(id,user_id,kind,email,token_hash,key_tag,credential_tag,language,created_at,expires) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,current.id,kind,email,sha(token(id)),keyTag,credentialTag(current),current.language,now(),now()+30*60000);
  await audit(current.id,kind==='verify'?'recovery_email_requested':'recovery_requested','user',current.id,{queued:true});
 }
 async function configure(id,input){
  requireEnabled();const email=address(input.email);if(!email)throw failure(400,'Invalid email address');
  const proof=await access.verifyProof(id,input.currentPassword);
  return db.transaction(async()=>{
   await access.assertProof(proof);if(!await throttle(email))throw failure(429,'Recovery request limit reached');
   await issue(proof,email,'verify');return {ok:true,queued:true};
  });
 }
 async function request(input){
  requireEnabled();const email=address(input.email);
  // Uniform response for unknown, unverified, disabled and throttled addresses.
  if(!email)return {ok:true};
  await db.transaction(async()=>{
   if(!await throttle(email))return;
   const current=await db.prepare('SELECT u.* FROM ilker_users u JOIN ilker_recovery_addresses a ON a.user_id=u.id WHERE a.email=? AND u.active=1').get(email);
   if(current)await issue(current,email,'reset');
  });return {ok:true};
 }
 async function pending(input){
  if(typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token)||typeof input.id!=='string'||input.id.length>40)throw failure(400,'Recovery link unavailable');
  const row=await db.prepare('SELECT * FROM ilker_recovery_requests WHERE id=? AND token_hash=? AND used_at IS NULL AND expires>? AND key_tag=?').get(input.id,sha(input.token),now(),keyTag);
  const current=row&&await user(row.user_id);
  if(!row||!current||credentialTag(current)!==row.credential_tag)throw failure(400,'Recovery link unavailable');
  if(row.kind==='reset'&&!(await db.prepare('SELECT 1 FROM ilker_recovery_addresses WHERE user_id=? AND email=?').get(row.user_id,row.email)))throw failure(400,'Recovery link unavailable');
  return {row,current};
 }
 async function consume(input){
  requireEnabled();
  // Expensive password derivation happens only after verifying a valid capability,
  // then the capability is checked again under the shared transaction lock.
  const first=await pending(input);const hash=first.row.kind==='reset'?await hashPassword(input.newPassword):null;
  return db.transaction(async()=>{
   const {row,current}=await pending(input);
   if(row.kind==='verify'){
    const duplicate=await db.prepare('SELECT user_id FROM ilker_recovery_addresses WHERE email=? AND user_id<>?').get(row.email,current.id);
    if(duplicate)throw failure(409,'Recovery email unavailable');
    await db.prepare('INSERT INTO ilker_recovery_addresses(user_id,email,verified_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at').run(current.id,row.email,now());
   }else{
    await db.prepare('UPDATE ilker_users SET password_hash=?,revision=revision+1 WHERE id=?').run(hash,current.id);
    await access.revokeSessions(current.id);
   }
   await db.prepare('UPDATE ilker_recovery_requests SET used_at=? WHERE user_id=? AND used_at IS NULL').run(now(),current.id);
   await audit(current.id,row.kind==='verify'?'recovery_email_verified':'password_recovered','user',current.id,{sessionsRevoked:row.kind==='reset'});
   return {ok:true,kind:row.kind};
  });
 }
 async function settings(id){const row=await db.prepare('SELECT email,verified_at FROM ilker_recovery_addresses WHERE user_id=?').get(id);return {enabled,email:row?.email||null,verifiedAt:row?.verified_at||null};}
 async function drain(){
  if(!enabled)return;
  for(let n=0;n<10;n++){
   const job=await db.transaction(async()=>{
    // Remove expired addresses/capabilities after a short operational retention window.
    await db.prepare('DELETE FROM ilker_recovery_requests WHERE expires<?').run(now()-86400000);
    const row=await db.prepare('SELECT * FROM ilker_recovery_requests WHERE used_at IS NULL AND sent_at IS NULL AND expires>? AND attempts<5 AND next_attempt<=? AND key_tag=? AND (lease_expires IS NULL OR lease_expires<=?) ORDER BY created_at,id LIMIT 1').get(now(),now(),keyTag,now());
    if(!row)return null;
    const lease=randomUUID();await db.prepare('UPDATE ilker_recovery_requests SET lease_token=?,lease_expires=? WHERE id=?').run(lease,now()+60000,row.id);return {...row,lease};
   });if(!job)return;
   const finish=async(values)=>db.transaction(async()=>{const row=await db.prepare('SELECT lease_token FROM ilker_recovery_requests WHERE id=?').get(job.id);if(row?.lease_token!==job.lease)return;await db.prepare('UPDATE ilker_recovery_requests SET sent_at=?,attempts=?,next_attempt=?,last_error=?,lease_token=NULL,lease_expires=NULL WHERE id=?').run(values.sentAt??null,values.attempts??job.attempts,values.next??0,values.error??null,job.id);});
   try{
    // A stale verification or credential change cannot produce a usable reset link.
    const checked=await pending({id:job.id,token:token(job.id)}),t=texts[job.language];
    const link=base+'/account-recovery.html#'+job.kind+'.'+job.id+'.'+token(job.id);
    await provider.send({to:checked.row.email,subject:t[job.kind]+' · İlker Sevim',text:t[job.kind+'Body']+'\n\n'+link+'\n\n'+t.end,id:'ilker-recovery-'+job.id});
    await finish({sentAt:now()});
   }catch(error){await finish({attempts:error.permanent||error.status===400?5:job.attempts+1,next:now()+Math.min(600000,30000*2**job.attempts),error:error.status===400?'expired_or_revoked':error.permanent?'email_rejected':'email_unavailable'});}
  }
 }
 return {enabled,configure,request,consume,settings,drain};
}
module.exports={createRecoveryStore};

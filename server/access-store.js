'use strict';
const {randomUUID,randomBytes,createHash,scrypt,timingSafeEqual}=require('node:crypto');
const {promisify}=require('node:util');
const derive=promisify(scrypt);
const sha=value=>createHash('sha256').update(value).digest('hex');
const failure=(status,message)=>Object.assign(new Error(message),{status});
const hashPattern=/^[a-f0-9]{32}:[a-f0-9]{128}$/i;
const safeColumns='id,login,display_name,role,active,revision,language,push_private,created_at';
function password(value){if(typeof value!=='string'||value.length<12||value.length>200)throw failure(400,'Пароль должен содержать от 12 до 200 символов.');return value;}
async function hashPassword(value){const salt=randomBytes(16).toString('hex');return salt+':'+(await derive(password(value),salt,64)).toString('hex');}
async function checkPassword(value,hash){
  if(typeof value!=='string'||value.length>200||!hashPattern.test(hash||''))return false;
  const [salt,expected]=hash.split(':');return timingSafeEqual(Buffer.from(expected,'hex'),await derive(value,salt,64));
}
function loginName(value){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(value.trim().toLowerCase()))throw failure(400,'Логин: 3–40 латинских букв, цифр, точек или дефисов.');return value.trim().toLowerCase();}
function deviceName(ua=''){const os=/iPad/.test(ua)?'iPad':/iPhone/.test(ua)?'iPhone':/Android/.test(ua)?'Android':/Windows/.test(ua)?'Windows':/Macintosh/.test(ua)?'Mac':/Linux/.test(ua)?'Linux':'Browser';return os+' · '+(/Firefox/.test(ua)?'Firefox':/Edg/.test(ua)?'Edge':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':'Web');}

async function createAccessStore(db,{now=Date.now,bootstrapHash,audit}) {
  if(!(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=3').get()))throw new Error('Access migration required');
  // Only the first initialization imports the existing owner credential. Later environment
  // changes can never overwrite a password changed by its owner inside the application.
  await db.transaction(async()=>{
    if(await db.prepare('SELECT id FROM ilker_users LIMIT 1').get())return;
    if(!hashPattern.test(bootstrapHash||''))return; // Test tools may run without HTTP login.
    await db.prepare("INSERT INTO ilker_users(id,login,display_name,role,password_hash,created_at) VALUES('owner','owner','','owner',?,?)").run(bootstrapHash,now());
    await db.prepare("INSERT INTO ilker_account_sessions(token_hash,user_id,created_at,last_seen,device) SELECT token_hash,'owner',?,?, 'Existing device' FROM ilker_sessions WHERE expires>?").run(now(),now(),now());
    await db.prepare("INSERT INTO ilker_push_owners(subscription_id,user_id) SELECT id,'owner' FROM ilker_push_subscriptions").run();
    await audit('migration','credential_import','user','owner',{existingPasswordPreserved:true});
  });
  // A fixed random-format dummy hash makes unknown users perform the same password work.
  const dummy='0'.repeat(32)+':'+ '0'.repeat(128);
  const safeUser=id=>db.prepare('SELECT '+safeColumns+' FROM ilker_users WHERE id=?').get(id);
  async function activeUser(id){const user=await db.prepare('SELECT * FROM ilker_users WHERE id=? AND active=1').get(id);if(!user)throw failure(401,'Сессия завершена. Войдите снова.');return user;}
  async function owner(id){const user=await activeUser(id);if(user.role!=='owner')throw failure(403,'Недостаточно прав.');return user;}
  async function recentProof(id,proof){
    const user=await activeUser(id),bucket='proof:'+sha(id);
    const permitted=await db.transaction(async()=>{
      await db.prepare('DELETE FROM ilker_login_attempts WHERE bucket=? AND resets_at<=?').run(bucket,now());
      const row=await db.prepare('SELECT attempts FROM ilker_login_attempts WHERE bucket=?').get(bucket);if(row?.attempts>=5)return false;
      await db.prepare('INSERT INTO ilker_login_attempts(bucket,attempts,resets_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=ilker_login_attempts.attempts+1').run(bucket,now()+900000);return true;
    });
    if(!permitted)throw failure(429,'Слишком много попыток. Повторите через 15 минут.');
    if(!await checkPassword(proof,user.password_hash))throw failure(403,'Неверный текущий пароль.');
    await db.prepare('DELETE FROM ilker_login_attempts WHERE bucket=?').run(bucket);return user;
  }
  async function unchangedProof(user){const latest=await activeUser(user.id);if(latest.password_hash!==user.password_hash||latest.revision!==user.revision)throw failure(409,'Настройки доступа изменились. Повторите вход.');return latest;}
  async function revoke(userId){
    await db.prepare('DELETE FROM ilker_sessions WHERE token_hash IN (SELECT token_hash FROM ilker_account_sessions WHERE user_id=?)').run(userId);
    // Revoked credentials also stop future device notifications. The user can subscribe again.
    await db.prepare('DELETE FROM ilker_push_subscriptions WHERE id IN (SELECT subscription_id FROM ilker_push_owners WHERE user_id=?)').run(userId);
    if(await db.prepare('SELECT version FROM ilker_management_versions WHERE version=7').get())await db.prepare('UPDATE ilker_recovery_requests SET used_at=? WHERE user_id=? AND used_at IS NULL').run(now(),userId);
  }
  async function login(input,ip,ua){
    const login=typeof input.login==='string'?input.login.trim().toLowerCase():'owner';
    if(login.length>40||typeof input.password!=='string'||input.password.length>200)throw failure(401,'Неверный логин или пароль.');
    const buckets=[['user:'+sha(login),10],['ip:'+sha(ip||'unknown'),30]];
    // Reserve an attempt BEFORE expensive password work, across all server instances.
    const permitted=await db.transaction(async()=>{
      await db.prepare('DELETE FROM ilker_login_attempts WHERE resets_at<=?').run(now());
      for(const [key,limit] of buckets){const row=await db.prepare('SELECT attempts FROM ilker_login_attempts WHERE bucket=?').get(key);if(row&&row.attempts>=limit)return false;}
      for(const [key] of buckets)await db.prepare('INSERT INTO ilker_login_attempts(bucket,attempts,resets_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=ilker_login_attempts.attempts+1').run(key,now()+15*60000);
      return true;
    });
    if(!permitted)throw failure(429,'Слишком много попыток. Повторите через 15 минут.');
    const user=await db.prepare('SELECT * FROM ilker_users WHERE login=?').get(login);
    const valid=await checkPassword(input.password,user?.password_hash||dummy);
    if(!valid||!user?.active)throw failure(401,'Неверный логин или пароль.');
    return db.transaction(async()=>{
      const latest=await activeUser(user.id);if(latest.password_hash!==user.password_hash)throw failure(401,'Неверный логин или пароль.');
      await db.prepare('DELETE FROM ilker_sessions WHERE expires<=?').run(now());
      const raw=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex'),token=sha(raw);
      await db.prepare('INSERT INTO ilker_sessions(token_hash,csrf,expires) VALUES(?,?,?)').run(token,csrf,now()+8*3600000);
      await db.prepare('INSERT INTO ilker_account_sessions(token_hash,user_id,created_at,last_seen,device) VALUES(?,?,?,?,?)').run(token,user.id,now(),now(),deviceName(ua));
      await audit(user.id,'login','user',user.id,{device:deviceName(ua)});
      return {raw,csrf,user:await safeUser(user.id)};
    });
  }
  async function session(token){
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return null;
    const row=await db.prepare('SELECT s.*,a.user_id,a.last_seen FROM ilker_sessions s JOIN ilker_account_sessions a ON a.token_hash=s.token_hash JOIN ilker_users u ON u.id=a.user_id WHERE s.token_hash=? AND s.expires>? AND u.active=1').get(sha(token),now());
    if(!row)return null;
    if(row.last_seen<now()-60000)await db.prepare('UPDATE ilker_account_sessions SET last_seen=? WHERE token_hash=?').run(now(),row.token_hash);
    return {...row,user:await safeUser(row.user_id)};
  }
  async function changePassword(id,input){
    const verified=await recentProof(id,input.currentPassword),next=await hashPassword(input.newPassword);
    return db.transaction(async()=>{await unchangedProof(verified);await db.prepare('UPDATE ilker_users SET password_hash=?,revision=revision+1 WHERE id=?').run(next,id);await revoke(id);await audit(id,'password_changed','user',id,{sessionsRevoked:true});return {ok:true,signInRequired:true};});
  }
  async function saveUser(actor,input){
    await owner(actor);const verified=await recentProof(actor,input.currentPassword);
    const login=loginName(input.login),name=typeof input.displayName==='string'?input.displayName.trim():'';
    if(name.length>80||/[\x00-\x1f]/.test(name)||!['owner','reception'].includes(input.role)||typeof input.active!=='boolean')throw failure(400,'Проверьте данные сотрудника.');
    const newHash=input.newPassword?await hashPassword(input.newPassword):null;
    if(!input.id&&!newHash)throw failure(400,'Укажите пароль нового сотрудника.');
    return db.transaction(async()=>{
      await unchangedProof(verified);await owner(actor);
      const current=input.id?await db.prepare('SELECT * FROM ilker_users WHERE id=?').get(input.id):null;
      if(input.id&&!current)throw failure(404,'Сотрудник не найден.');
      if(current&&current.revision!==input.revision)throw failure(409,'Сотрудник уже изменён. Обновите список.');
      if(current?.id===actor&&(input.role!=='owner'||!input.active))throw failure(409,'Нельзя отключить свой доступ владельца.');
      if(current?.role==='owner'&&current.active&&(input.role!=='owner'||!input.active)){
        const count=await db.prepare("SELECT COUNT(*) AS n FROM ilker_users WHERE role='owner' AND active=1").get();if(count.n<=1)throw failure(409,'В системе должен оставаться активный владелец.');
      }
      const duplicate=await db.prepare('SELECT id FROM ilker_users WHERE login=?').get(login);if(duplicate&&duplicate.id!==current?.id)throw failure(409,'Этот логин уже занят.');
      const id=current?.id||randomUUID();
      if(current){await db.prepare('UPDATE ilker_users SET login=?,display_name=?,role=?,active=?,password_hash=?,revision=revision+1 WHERE id=?').run(login,name,input.role,Number(input.active),newHash||current.password_hash,id);if(newHash||!input.active||current.role!==input.role)await revoke(id);}
      else await db.prepare('INSERT INTO ilker_users(id,login,display_name,role,active,password_hash,created_at) VALUES(?,?,?,?,?,?,?)').run(id,login,name,input.role,Number(input.active),newHash,now());
      await audit(actor,current?'user_updated':'user_created','user',id,{role:input.role,active:input.active,passwordChanged:Boolean(newHash)});
      return safeUser(id);
    });
  }
  async function preferences(id,input){
    if((input.language!==undefined&&!['ru','az','en'].includes(input.language))||typeof input.pushPrivate!=='boolean')throw failure(400,'Проверьте настройки.');
    return db.transaction(async()=>{await activeUser(id);await db.prepare('UPDATE ilker_users SET language=COALESCE(?,language),push_private=?,revision=revision+1 WHERE id=?').run(input.language??null,Number(input.pushPrivate),id);await audit(id,'preferences','user',id,{...(input.language?{language:input.language}:{}),pushPrivate:input.pushPrivate});return safeUser(id);});
  }
  async function language(id,value){
    if(!['ru','az','en'].includes(value))throw failure(400,'Проверьте настройки.');
    return db.transaction(async()=>{const current=await activeUser(id);if(current.language!==value){await db.prepare('UPDATE ilker_users SET language=?,revision=revision+1 WHERE id=?').run(value,id);await audit(id,'language','user',id,{language:value});}return safeUser(id);});
  }
  async function devices(id,current){
    return (await db.prepare('SELECT a.token_hash,a.created_at,a.last_seen,a.device,s.expires FROM ilker_account_sessions a JOIN ilker_sessions s ON s.token_hash=a.token_hash WHERE a.user_id=? AND s.expires>? ORDER BY a.last_seen DESC').all(id,now())).map(({token_hash,...r})=>({...r,id:token_hash,current:token_hash===current}));
  }
  async function endSessions(id,input,current){
    const verified=await recentProof(id,input.currentPassword);
    return db.transaction(async()=>{
      await unchangedProof(verified);
      if(input.all===true){await revoke(id);await audit(id,'sessions_revoked','user',id,{all:true});return {ok:true,signInRequired:true};}
      if(typeof input.id!=='string')throw failure(400,'Выберите устройство.');
      await db.prepare('DELETE FROM ilker_push_subscriptions WHERE id IN (SELECT subscription_id FROM ilker_push_owners WHERE user_id=? AND session_hash=?)').run(id,input.id);
      await db.prepare('DELETE FROM ilker_sessions WHERE token_hash=? AND token_hash IN (SELECT token_hash FROM ilker_account_sessions WHERE user_id=?)').run(input.id,id);
      await audit(id,'session_revoked','user',id,{current:input.id===current});return {ok:true,signInRequired:input.id===current};
    });
  }
  async function ownsPush(id,endpoint){return db.prepare('SELECT p.* FROM ilker_push_subscriptions p JOIN ilker_push_owners o ON o.subscription_id=p.id WHERE o.user_id=? AND p.endpoint=?').get(id,endpoint);}
  async function subscribe(id,safe,sessionHash){
    return db.transaction(async()=>{
      await activeUser(id);const row=await db.prepare('SELECT p.id,o.user_id FROM ilker_push_subscriptions p LEFT JOIN ilker_push_owners o ON o.subscription_id=p.id WHERE p.endpoint=?').get(safe.endpoint);
      if(row?.user_id&&row.user_id!==id)throw failure(409,'Устройство связано с другим аккаунтом. Отключите его уведомления перед новым входом.');
      if(!row&&(await db.prepare('SELECT COUNT(*) AS n FROM ilker_push_owners WHERE user_id=?').get(id)).n>=10)throw failure(409,'Достигнут лимит устройств.');
      const subId=row?.id||randomUUID();await db.prepare('INSERT INTO ilker_push_subscriptions(id,endpoint,subscription,created_at) VALUES(?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET subscription=excluded.subscription').run(subId,safe.endpoint,JSON.stringify(safe),now());
      await db.prepare('INSERT INTO ilker_push_owners(subscription_id,user_id,session_hash) VALUES(?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET user_id=excluded.user_id,session_hash=excluded.session_hash').run(subId,id,sessionHash||null);return {ok:true};
    });
  }
  async function unsubscribe(id,endpoint){const row=await ownsPush(id,endpoint);if(row)await db.prepare('DELETE FROM ilker_push_subscriptions WHERE id=?').run(row.id);return {ok:true};}
  async function logout(id,token,endpoint){
    return db.transaction(async()=>{
      await db.prepare('DELETE FROM ilker_push_subscriptions WHERE id IN (SELECT subscription_id FROM ilker_push_owners WHERE user_id=? AND session_hash=?)').run(id,token);
      if(typeof endpoint==='string')await unsubscribe(id,endpoint);
      await db.prepare('DELETE FROM ilker_sessions WHERE token_hash=?').run(token);
      await audit(id,'logout','user',id,{devicePushDisabled:true});return {ok:true};
    });
  }
  return {login,session,changePassword,saveUser,preferences,language,devices,endSessions,ownsPush,subscribe,unsubscribe,
    verifyProof:recentProof,assertProof:unchangedProof,revokeSessions:revoke,
    logout,
    users:async actor=>{await owner(actor);return db.prepare('SELECT '+safeColumns+' FROM ilker_users ORDER BY created_at,id').all();},
    events:async(actor,offset=0)=>{await owner(actor);return db.prepare('SELECT id,actor,action,entity_type,entity_id,details_json,created_at FROM ilker_audit ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?').all(Math.max(0,Math.min(100000,Math.trunc(Number(offset)||0))));},
    deviceCount:async id=>(await db.prepare('SELECT COUNT(*) AS n FROM ilker_push_owners WHERE user_id=?').get(id)).n
  };
}
module.exports={createAccessStore,hashPassword,checkPassword};

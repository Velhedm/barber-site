'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createApp}=require('../server/app'),{hashPassword}=require('../server/access-store');
const password='synthetic-owner-password';
async function setup(t,enabled=true){let clock=Date.parse('2030-01-01T00:00:00Z');const sent=[];let reject=false;
 const runtime=await createApp({databaseUrl:'',databasePath:':memory:',management:true,migrateManagement:true,production:false,vapid:{},adminHash:await hashPassword(password),origin:'https://synthetic.invalid',now:()=>clock,recoveryKey:'a'.repeat(64),emailProvider:{configured:enabled,send:async m=>{if(reject)throw new Error('temporary');sent.push(m);}}});
 t.after(()=>runtime.close());return {runtime,sent,advance:ms=>clock+=ms,fail:value=>reject=value};}
function capability(message){const link=message.text.match(/https:\/\/synthetic.invalid\/account-recovery.html#[^\s]+/)[0];const [kind,id,token]=new URL(link).hash.slice(1).split('.');return {kind,id,token};}
test('verified email, one-time reset, session revocation, private storage and uniform response',async t=>{
 const {runtime:r,sent}=await setup(t);const session=await r.access.login({password},'synthetic','');
 await r.recovery.configure('owner',{email:'owner@example.invalid',currentPassword:password});await Promise.all([r.drainEmail(),r.drainEmail()]);assert.equal(sent.length,1);
 const verify=capability(sent[0]);assert.ok(!JSON.stringify(await r.db.prepare('SELECT * FROM ilker_recovery_requests').all()).includes(verify.token));
 assert.deepEqual(await r.recovery.consume(verify),{ok:true,kind:'verify'});await assert.rejects(r.recovery.consume(verify),{status:400});
 assert.equal((await r.recovery.settings('owner')).email,'owner@example.invalid');
 assert.deepEqual(await r.recovery.request({email:'missing@example.invalid'}),await r.recovery.request({email:'owner@example.invalid'}));
 await r.drainEmail();assert.equal(sent.length,2);const reset=capability(sent[1]);
 const results=await Promise.allSettled([r.recovery.consume({...reset,newPassword:'new-synthetic-password'}),r.recovery.consume({...reset,newPassword:'new-synthetic-password'})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(await r.access.session(session.raw),null);await assert.rejects(r.access.login({password},'synthetic',''),{status:401});assert.equal((await r.access.login({password:'new-synthetic-password'},'synthetic','')).user.id,'owner');
 assert.ok(!JSON.stringify(await r.access.events('owner')).includes('owner@example.invalid'));
});
test('expiry, configuration disabled, password proof, retries and account revocation',async t=>{
 const disabled=await setup(t,false);await assert.rejects(disabled.runtime.recovery.request({email:'a@example.invalid'}),{status:503});
 const {runtime:r,sent,advance,fail}=await setup(t);
 await assert.rejects(r.recovery.configure('owner',{email:'owner@example.invalid',currentPassword:'wrong'}),{status:403});
 await r.recovery.configure('owner',{email:'owner@example.invalid',currentPassword:password});fail(true);await r.drainEmail();assert.equal(sent.length,0);assert.equal((await r.db.prepare('SELECT attempts,last_error FROM ilker_recovery_requests').get()).attempts,1);
 fail(false);advance(60001);await r.drainEmail();assert.equal(sent.length,1);advance(1800001);await assert.rejects(r.recovery.consume(capability(sent[0])),{status:400});
 await r.recovery.configure('owner',{email:'owner@example.invalid',currentPassword:password});await r.drainEmail();const link=capability(sent[1]);await r.access.changePassword('owner',{currentPassword:password,newPassword:'changed-synthetic-password'});await assert.rejects(r.recovery.consume(link),{status:400});
});
test('provider uses fixed HTTPS endpoint and stable idempotency; never exposes provider errors',async()=>{
 const {createEmailProvider}=require('../server/email-provider');let call;
 const provider=createEmailProvider({key:'synthetic-provider-key',from:'sender@example.invalid',fetcher:async(...args)=>{call=args;return {ok:true};}});
 await provider.send({to:'client@example.invalid',subject:'Test',text:'Synthetic',id:'synthetic-id'});assert.equal(call[0],'https://api.resend.com/emails');assert.equal(call[1].headers['Idempotency-Key'],'synthetic-id');
 const denied=createEmailProvider({key:'synthetic-provider-key',from:'sender@example.invalid',fetcher:async()=>({ok:false,status:401})});await assert.rejects(denied.send({}),{message:'email_rejected',permanent:true});
});

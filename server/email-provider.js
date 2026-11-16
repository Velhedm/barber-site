'use strict';
// A fixed provider URL prevents arbitrary outbound requests / SSRF through settings.
// Credentials are server-only; provider responses are never logged or returned to clients.
function createEmailProvider({key,from,fetcher=fetch}={}){
 const configured=typeof key==='string'&&key.length>=10&&typeof from==='string'&&from.length<=254&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from);
 return {configured,async send({to,subject,text,id}){
  if(!configured)throw Object.assign(new Error('email_unconfigured'),{permanent:true});
  let response;
  try{response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from,to:[to],subject,text}),signal:AbortSignal.timeout(10000)});}
  catch{throw new Error('email_unavailable');}
  if(!response.ok)throw Object.assign(new Error('email_rejected'),{permanent:response.status>=400&&response.status<500&&![408,429].includes(response.status)});
  // HTTP acceptance is not a guarantee of inbox delivery.
  await response.body?.cancel().catch(()=>{});
 }};
}
module.exports={createEmailProvider};

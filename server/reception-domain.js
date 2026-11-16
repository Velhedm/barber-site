'use strict';
const {failure,dateValid}=require('./scheduling');
function phoneKey(value){
 if(typeof value!=='string'||!/^\+?[0-9() .-]+$/.test(value))throw failure(400,'Invalid phone');
 let digits=value.replace(/\D/g,'');if(digits.startsWith('00'))digits=digits.slice(2);
 if(digits.length<7||digits.length>15)throw failure(400,'Invalid phone');
 if(/^0\d{9}$/.test(digits))digits='994'+digits.slice(1);
 else if(/^\d{9}$/.test(digits))digits='994'+digits;
 return digits;
}
function clean(value,max=100,optional=false){
 if(optional&&(value===undefined||value===null||value===''))return '';
 if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f]/.test(value))throw failure(400,'Invalid details');return value.trim();
}
function range(from,to,max=366){if(!dateValid(from)||!dateValid(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>=max)throw failure(400,'Invalid date range');return {from,to};}
function allocate(total,items){
 // Integer qəpik allocation: stable largest remainders; shares add to the exact total.
 if(!Number.isSafeInteger(total))throw failure(400,'Invalid actual price');
 if(!items.length)return [];
 const sign=total<0?-1:1,amount=Math.abs(total),weights=items.map(i=>Math.max(0,i.price_min)),sum=weights.reduce((a,b)=>a+b,0);
 const denominator=sum||items.length,entries=weights.map((weight,index)=>{const numerator=BigInt(amount)*BigInt(sum?weight:1),divisor=BigInt(denominator);return {index,value:Number(numerator/divisor),remainder:numerator%divisor};});
 let left=amount-entries.reduce((s,e)=>s+e.value,0);
 for(const entry of [...entries].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(!left)break;entry.value++;left--;}
 return entries.map(e=>({...items[e.index],amount:e.value*sign}));
}
module.exports={phoneKey,clean,range,allocate};

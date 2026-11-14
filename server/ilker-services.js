'use strict';
// Prepared catalog helpers. The live booking API is not wired to this file yet.
const catalog=require('./ilker-catalog.json');
const services=new Map(catalog.categories.flatMap(category=>category.services.map(service=>[service.id,{...service,group:category.id}])));
const ROOMS=Object.freeze({zal:'ZAL',vip:'VIP OTAQ'});
function quote(serviceId,room){
 const service=services.get(serviceId);
 if(!service||!Object.hasOwn(ROOMS,room))throw new RangeError('Unknown service or room');
 const price=service[room];
 return Object.freeze({serviceId,room,roomLabel:ROOMS[room],name:service.name,translations:{...service.translations},currency:catalog.currency,
  priceMin:typeof price==='number'?price:price.min,priceMax:typeof price==='number'?price:price.max,
  // Ranges remain unresolved until an owner enters the actual amount.
  actualPrice:typeof price==='number'?price:null,durationMinutes:service.duration_minutes??null,
  ageNote:room==='zal'&&service.zal_note?service.zal_note:null,sessions:service.sessions??1});
}
module.exports={catalog,quote,ROOMS};

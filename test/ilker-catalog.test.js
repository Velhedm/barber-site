'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {catalog,quote}=require('../server/ilker-services');
test('catalog preserves category prices, unresolved range, and single package price',()=>{
 assert.equal(catalog.categories.flatMap(group=>group.services).length,21);
 assert.equal(quote('haircut','zal').actualPrice,35);assert.equal(quote('haircut','vip').actualPrice,60);
 assert.equal(quote('kids_haircut','zal').ageNote,'12 yaşadək');assert.equal(quote('kids_haircut','vip').ageNote,null);
 for(const room of ['zal','vip']){const range=quote('keratin_botox',room);assert.equal(range.priceMin,150);assert.equal(range.priceMax,200);assert.equal(range.actualPrice,null);}
 const packageQuote=quote('rf_microcurrent_cavitation','vip');assert.equal(packageQuote.sessions,8);assert.equal(packageQuote.actualPrice,400);
 assert.equal(quote('massage_20','zal').durationMinutes,20);assert.equal(quote('massage_30','zal').durationMinutes,30);assert.equal(quote('haircut','zal').durationMinutes,null);
 assert.throws(()=>quote('haircut','unknown'),RangeError);assert.throws(()=>quote('old_haircut','zal'),RangeError);
});
test('official service and room price list is exact',()=>{
 const expected={haircut:[35,60],kids_haircut:[30,50],beard_cut:[20,35],traditional_shave:[30,40],wash_style:[20,35],hair_treatment:[35,60],hair_color:[60,90],beard_color:[35,60],hair_toning:[80,100],keratin_botox:[[150,200],[150,200]],facial:[35,60],eyebrows:[15,20],massage_20:[25,30],massage_30:[35,40],hand_nails:[15,15],foot_nails:[25,25],manicure:[30,30],pedicure:[50,50],royal_groom:[200,300],groom_haircut:[70,150],rf_microcurrent_cavitation:[400,400]};
 assert.equal(Object.keys(expected).length,catalog.categories.flatMap(g=>g.services).length);
 for(const [id,prices] of Object.entries(expected))for(const [index,room] of ['zal','vip'].entries()){
  const actual=quote(id,room),expectedPrice=prices[index];
  if(Array.isArray(expectedPrice)){assert.deepEqual([actual.priceMin,actual.priceMax],expectedPrice);assert.equal(actual.actualPrice,null);}
  else{assert.equal(actual.priceMin,expectedPrice);assert.equal(actual.priceMax,expectedPrice);assert.equal(actual.actualPrice,expectedPrice);}
 }
});

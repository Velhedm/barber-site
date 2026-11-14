'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {isAvailable,interval}=require('../server/ilker-booking-rules');
test('shared capacity respects real durations, closing time, and invalid data',()=>{
 const occupied=[{time:'10:00',durationMinutes:30,room:'zal'}];
 assert.equal(isAvailable('10:20',20,occupied),false);assert.equal(isAvailable('10:30',20,occupied),true);assert.equal(isAvailable('09:40',20,occupied),true);
 assert.equal(isAvailable('09:50',20,[{...occupied[0],room:'vip'}]),false);
 assert.equal(isAvailable('20:30',30,[]),true);assert.equal(isAvailable('20:40',30,[]),false);assert.equal(isAvailable('08:30',30,[]),false);
 assert.equal(interval('10:00',null),null);assert.equal(isAvailable('10:00',0,[]),false);assert.equal(isAvailable('10:00',20,[{time:'bad',durationMinutes:30}]),false);
});

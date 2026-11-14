'use strict';
// Prepared pure rules for integration; no live booking or DB changes are made here.
const OPEN_MINUTE=9*60, CLOSE_MINUTE=21*60;
function timeInMinutes(time){
 if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
 return Number(time.slice(0,2))*60+Number(time.slice(3));
}
function interval(time,durationMinutes){
 const start=timeInMinutes(time);
 if(start===null||!Number.isInteger(durationMinutes)||durationMinutes<=0||start<OPEN_MINUTE||start+durationMinutes>CLOSE_MINUTE)return null;
 return {start,end:start+durationMinutes};
}
function overlaps(first,second){return first.start<second.end&&second.start<first.end;}
function isAvailable(time,durationMinutes,activeIntervals){
 const requested=interval(time,durationMinutes);if(!requested||!Array.isArray(activeIntervals))return false;
 // Invalid stored intervals fail closed; ZAL and VIP share the same capacity.
 return activeIntervals.every(item=>{const occupied=interval(item.time,item.durationMinutes);return occupied&&!overlaps(requested,occupied);});
}
module.exports={timeInMinutes,interval,overlaps,isAvailable};

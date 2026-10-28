'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('worker always shows a notification, restricts click destinations and never caches API',async()=>{
 const handlers={};let notification;let destination;const self={location:{origin:'https://example.com'},addEventListener:(name,fn)=>{handlers[name]=fn;},registration:{showNotification:async(title,options)=>{notification={title,options};}},clients:{matchAll:async()=>[],openWindow:async url=>{destination=url;}}};
 vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),{self,URL});
 for(const url of ['https://evil.invalid/','not a valid URL','/admin.html?booking=123']){let promise;handlers.push({data:{json:()=>({title:'New booking',body:'Date and time',url})},waitUntil:p=>{promise=p;}});await promise;assert.ok(notification.title);assert.ok(notification.options.data.url.startsWith('/admin.html'));handlers.notificationclick({notification:{data:notification.options.data,close:()=>{}},waitUntil:p=>{promise=p;}});await promise;assert.ok(destination.startsWith('https://example.com/admin.html'));}
 let promise;handlers.push({data:{json:()=>{throw new Error();}},waitUntil:p=>{promise=p;}});await promise;assert.equal(notification.title,'Ruslan True');
 let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://example.com/api/admin/bookings'},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);
});

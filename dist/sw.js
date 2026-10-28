'use strict';
const CACHE='ruslan-owner-shell-v1';
const SHELL=['/admin.html','/admin.css','/admin.js','/style.css','/offline.html','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('ruslan-owner-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Never cache API responses, credentials, booking contacts or non-GET requests.
 if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(event.request.mode==='navigate'&&url.pathname==='/admin.html'){
  event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));return;
 }
 if(SHELL.includes(url.pathname)&&url.pathname!=='/admin.html'){
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;}).catch(()=>caches.match(event.request)));return;
 }
});
self.addEventListener('push',event=>{
 let payload={};try{payload=event.data?.json()||{};}catch{}
 // Payloads deliberately omit customer contacts, including on the device lock screen.
 const raw=typeof payload.url==='string'?payload.url:'/admin.html';
 let destination='/admin.html';try{const url=new URL(raw,self.location.origin);if(url.origin===self.location.origin&&url.pathname==='/admin.html')destination=url.pathname+url.search;}catch{}
 event.waitUntil(self.registration.showNotification(typeof payload.title==='string'?payload.title:'Ruslan True',{
  body:typeof payload.body==='string'?payload.body:'Проверь новые записи в панели владельца.',
  icon:'/icons/icon-192.png',badge:'/icons/badge-96.png',tag:typeof payload.tag==='string'?payload.tag:'ruslan-new-booking',
  data:{url:destination}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const path=event.notification.data?.url||'/admin.html';let safe=self.location.origin+'/admin.html';try{const target=new URL(path,self.location.origin);if(target.origin===self.location.origin&&target.pathname==='/admin.html')safe=target.href;}catch{}
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async windows=>{
  const existing=windows.find(w=>new URL(w.url).pathname==='/admin.html');
  if(existing){await existing.navigate(safe);return existing.focus();}
  return self.clients.openWindow(safe);
 }));
});

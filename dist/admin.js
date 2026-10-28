'use strict';
(()=>{
 let csrf='',current=null,availability=null,pushConfig=null,registration=null,offset=0,tab='bookings',polling=false,installPrompt=null;
 const status=document.querySelector('#admin-status');
 const highlight=new URL(location.href).searchParams.get('booking');
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const pushSupported=()=>window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 const day=()=>new Date(Date.now()+4*3600000).toISOString().slice(0,10);
 function clearPrivate(){current=null;availability=null;document.querySelector('#booking-search').value='';document.querySelector('#all-bookings').replaceChildren();document.querySelector('#appointments').replaceChildren();document.querySelector('#admin-hours').replaceChildren();document.querySelector('#booking-count').textContent='';}
 function showLogin(){csrf='';clearPrivate();document.querySelector('#dashboard').hidden=true;document.querySelector('#login').hidden=false;document.querySelector('#enable-push').disabled=true;}
 function connection(online){const el=document.querySelector('#connection');el.textContent=online?'На связи':'Нет соединения';el.dataset.online=String(online);}
 async function api(url,body){
  const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error||'Ошибка запроса'),{status:r.status});return data;
 }
 function showError(error){status.textContent=error.status?error.message:'Не удалось связаться с сервером. Изменения не подтверждены — обнови список перед повтором.';if(error.status===401)showLogin();if(!error.status)connection(false);}
 async function action(url,body){try{status.textContent='';await api(url,body);await load();return true;}catch(e){showError(e);return false;}}
 function serviceName(id){return {haircut:'Мужская стрижка',kids:'Детская стрижка',beard:'Коррекция бороды',combo:'Стрижка + борода',peeling:'Пилинг кожи головы',styling:'Укладка'}[id]||id;}
 function appointment(row){
  const box=document.createElement('article');box.className='appointment';if(row.id===highlight)box.classList.add('highlight');
  const heading=document.createElement('strong');heading.textContent=`${row.date} · ${row.time} ${row.kind==='block'?'· личная блокировка':row.status==='cancelled'?'· отменена':'· запись'}`;box.append(heading);
  if(row.kind==='block')return box;
  const name=document.createElement('p');name.textContent=row.name;box.append(name);
  const phone=document.createElement('a');phone.textContent=row.phone;phone.href='tel:'+row.phone.replace(/[^+\d]/g,'');box.append(phone);
  const service=document.createElement('p');service.textContent=serviceName(row.service_id);box.append(service);
  const actions=document.createElement('div');actions.className='action-row';const button=document.createElement('button');button.className='text-button danger';
  if(row.status==='active'){
   button.textContent='Отменить и освободить час';button.addEventListener('click',async()=>{if(!confirm('Отменить запись и освободить час? Клиента нужно предупредить отдельно.'))return;button.disabled=true;await action('/api/admin/cancel',{id:row.id});button.disabled=false;});
  }else{
   button.textContent='Удалить данные записи';button.addEventListener('click',async()=>{if(!confirm('Безвозвратно удалить отмененную запись и контакты клиента?'))return;button.disabled=true;await action('/api/admin/delete',{id:row.id});button.disabled=false;});
  }
  actions.append(button);box.append(actions);return box;
 }
 async function loadBookings(){
  const filter=document.querySelector('#booking-filter').value;const q=document.querySelector('#booking-search').value.trim();
  const data=await api(`/api/admin/bookings?status=${filter}&offset=${offset}&q=${encodeURIComponent(q)}`);
  const root=document.querySelector('#all-bookings');const list=data.rows;
  if(highlight&&offset===0&&!q&&!list.some(x=>x.id===highlight)){
   try{const row=await api('/api/admin/booking/'+encodeURIComponent(highlight));list.unshift(row);}catch(e){if(e.status!==404)throw e;}
  }
  root.replaceChildren(...list.map(appointment));if(!list.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='Записей по этому фильтру нет.';root.append(empty);}
  document.querySelector('#booking-count').textContent=`Всего: ${data.count}. Обновление каждые 3 секунды.`;
  document.querySelector('#page-prev').disabled=offset===0;document.querySelector('#page-next').disabled=offset+50>=data.count;
 }
 async function loadSchedule(){
  const date=document.querySelector('#admin-date').value;if(!date)return;
  const result=await Promise.all([api('/api/admin/day?date='+date),api('/api/availability?date='+date)]);
  if(date!==document.querySelector('#admin-date').value)return;[current,availability]=result;
  document.querySelector('#close-day').disabled=false;document.querySelector('#close-day').textContent=current.closed?'Открыть день':'Закрыть весь день';
  const root=document.querySelector('#admin-hours');root.replaceChildren();
  for(const slot of availability.slots){const row=current.slots.find(s=>s.time===slot.time);const button=document.createElement('button');button.type='button';button.textContent=slot.time+(row?.kind==='booking'?' · запись':row?' · закрыто':current.closed?' · день закрыт':'');button.disabled=slot.status==='past'||row?.kind==='booking';button.setAttribute('aria-pressed',String(Boolean(row)||current.closed));button.title=row?.kind==='booking'?'Отмени запись отдельно':row?'Открыть этот час':'Закрыть этот час';button.addEventListener('click',async()=>{button.disabled=true;await action('/api/admin/slot',{date,time:slot.time,blocked:!row});});root.append(button);}
  const list=document.querySelector('#appointments');list.replaceChildren(...current.slots.map(appointment));
 }
 async function load(){if(!csrf||polling||document.hidden)return;polling=true;try{if(tab==='bookings')await loadBookings();else await loadSchedule();connection(true);}catch(e){showError(e);}finally{polling=false;}}
 function switchTab(next){tab=next;document.querySelector('#bookings-view').hidden=tab!=='bookings';document.querySelector('#schedule-view').hidden=tab!=='schedule';document.querySelector('#tab-bookings').setAttribute('aria-pressed',String(tab==='bookings'));document.querySelector('#tab-schedule').setAttribute('aria-pressed',String(tab==='schedule'));load();}
 document.querySelector('#tab-bookings').addEventListener('click',()=>switchTab('bookings'));document.querySelector('#tab-schedule').addEventListener('click',()=>switchTab('schedule'));
 document.querySelector('#admin-date').value=day();document.querySelector('#admin-date').min=day();document.querySelector('#admin-date').addEventListener('change',()=>{document.querySelector('#close-day').disabled=true;load();});
 document.querySelector('#close-day').addEventListener('click',async()=>{if(!current)return;const button=document.querySelector('#close-day');button.disabled=true;await action('/api/admin/day',{date:current.date,closed:!current.closed});});
 document.querySelector('#booking-filter').addEventListener('change',()=>{offset=0;load();});
 let debounce;document.querySelector('#booking-search').addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{offset=0;load();},350);});
 document.querySelector('#page-prev').addEventListener('click',()=>{offset=Math.max(0,offset-50);load();});document.querySelector('#page-next').addEventListener('click',()=>{offset+=50;load();});document.querySelector('#refresh').addEventListener('click',load);
 async function getRegistration(){if(!registration)registration=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});await navigator.serviceWorker.ready;return registration;}
 async function localSubscription(){if(!pushSupported())return null;return(await getRegistration()).pushManager.getSubscription();}
 function keyBytes(value){const padded=(value+'='.repeat((4-value.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/');return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));}
 async function updatePush(){
  const info=document.querySelector('#push-status');const enable=document.querySelector('#enable-push');const disable=document.querySelector('#disable-push');const test=document.querySelector('#test-push');enable.disabled=true;disable.disabled=true;test.disabled=true;
  if(!pushSupported()){info.textContent='Push недоступен в этом браузере или соединение не защищено. Для телефона нужен HTTPS.';return;}
  try{
   pushConfig=await api('/api/admin/push/config');
   if(ios&&!standalone()){info.textContent='На iPhone сначала добавь админку на экран «Домой», открой ее с иконки и нажми «Включить Push».';return;}
   if(!pushConfig.enabled){info.textContent='Серверные VAPID-ключи еще не настроены. Список записей работает без Push.';return;}
   if(Notification.permission==='denied'){info.textContent='Уведомления запрещены. Разреши их в настройках браузера или iPhone, затем открой приложение снова.';return;}
   const subscription=await localSubscription();
   if(subscription){await api('/api/admin/push/subscribe',{subscription:subscription.toJSON()});disable.disabled=false;test.disabled=false;info.textContent='Push включен на этом устройстве. Сервер отправит уведомление о новой записи.';}
   else{enable.disabled=false;info.textContent='Нажми кнопку и разреши уведомления. Запрос появится только после твоего действия.';}
  }catch(e){info.textContent='Не удалось проверить Push. Обнови страницу или войди заново.';if(e.status===401)showLogin();}
 }
 document.querySelector('#enable-push').addEventListener('click',async()=>{
  const button=document.querySelector('#enable-push');if(!csrf||!pushSupported()||!pushConfig?.enabled||(ios&&!standalone()))return;
  // Keep the permission request directly inside the click gesture for iOS.
  const permissionPromise=Notification.requestPermission();button.disabled=true;let success=false;
  try{const permission=await permissionPromise;if(permission!=='granted'){document.querySelector('#push-status').textContent='Разрешение не получено. Можно продолжить работу без уведомлений.';return;}
   const reg=await getRegistration();let subscription=await reg.pushManager.getSubscription();
   if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(pushConfig.publicKey)});
   try{await api('/api/admin/push/subscribe',{subscription:subscription.toJSON()});}catch(e){await subscription.unsubscribe();throw e;}
   success=true;await updatePush();
  }catch(e){document.querySelector('#push-status').textContent='Не удалось включить Push. Проверь HTTPS, разрешение уведомлений и сеть.';}finally{if(!success)button.disabled=false;}
 });
 document.querySelector('#disable-push').addEventListener('click',async()=>{try{const subscription=await localSubscription();if(subscription){await api('/api/admin/push/unsubscribe',{endpoint:subscription.endpoint});await subscription.unsubscribe();}await updatePush();}catch(e){showError(e);}});
 document.querySelector('#test-push').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const subscription=await localSubscription();if(!subscription)throw new Error('No subscription');await api('/api/admin/push/test',{endpoint:subscription.endpoint});status.textContent='Push-сервис принял тестовое сообщение. Проверь уведомления устройства.';}catch(e){status.textContent=e.status?e.message:'Не удалось проверить Push.';}finally{button.disabled=false;}});
 async function signedIn(){document.querySelector('#login').hidden=true;document.querySelector('#dashboard').hidden=false;status.textContent='';await load();updatePush();}
 document.querySelector('#login').addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{csrf=(await api('/api/admin/login',{password:event.target.elements.password.value})).csrf;event.target.reset();await signedIn();}catch(e){showError(e);}finally{button.disabled=false;}});
 document.querySelector('#logout').addEventListener('click',async()=>{try{const subscription=await localSubscription().catch(()=>null);await api('/api/admin/logout',{endpoint:subscription?.endpoint});if(subscription)await subscription.unsubscribe().catch(()=>{});showLogin();status.textContent='Выход выполнен. Это устройство больше не получает новые Push.';}catch(e){showError(e);}});
 async function restore(){try{csrf=(await api('/api/admin/session')).csrf;await signedIn();}catch(e){showLogin();if(e.status===401){connection(true);status.textContent='Войди, чтобы открыть записи.';}else showError(e);}}
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.querySelector('#install-app').hidden=false;});
 document.querySelector('#install-app').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;document.querySelector('#install-app').hidden=true;});
 if(standalone())document.querySelector('#install-help').textContent='Приложение уже открыто с главного экрана. После входа можно включить Push.';
 addEventListener('offline',()=>{connection(false);clearPrivate();document.querySelector('#dashboard').hidden=true;document.querySelector('#login').hidden=false;status.textContent='Нет интернета. Изменение расписания временно недоступно.';});
 addEventListener('online',restore);document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(csrf)load();else restore();}});
 if(window.isSecureContext&&'serviceWorker'in navigator)getRegistration().catch(()=>{});
 setInterval(load,3000);restore();
})();

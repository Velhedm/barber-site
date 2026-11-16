'use strict';
(()=>{
 let managementMode=false,serverOffset=0,viewEpoch=0;
 let csrf='',current=null,availability=null,pushConfig=null,registration=null,offset=0,tab='bookings',polling=false,installPrompt=null,bookingsSignature='',scheduleSignature='';
 const status=document.querySelector('#admin-status');
 const tr=(key,params)=>window.IlkerAdminI18n.t(key,params);
 const bind=(node,render)=>window.IlkerAdminI18n.bind(node,render);
 const message=(node,key)=>bind(node,()=>tr(key));
 const highlight=new URL(location.href).searchParams.get('booking');
 const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 if(ios&&standalone()){const hint=document.createElement('p');hint.className='client-link-hint';message(hint,'Если сайт откроется здесь, нажмите «Вернуться в панель» вверху страницы.');document.querySelector('.header-tools').append(hint);}
 const pushSupported=()=>window.isSecureContext&&'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
 const day=()=>new Date(Date.now()+serverOffset+4*3600000).toISOString().slice(0,10);
 function clearPrivate(){window.IlkerAccess?.clear();window.IlkerManagement?.clear();window.IlkerReception?.clear();current=null;availability=null;bookingsSignature='';scheduleSignature='';document.querySelector('#booking-search').value='';document.querySelector('#all-bookings').replaceChildren();document.querySelector('#appointments').replaceChildren();document.querySelector('#admin-hours').replaceChildren();message(document.querySelector('#booking-count'),'');}
 function showLogin(){viewEpoch++;csrf='';clearPrivate();document.querySelector('#dashboard').hidden=true;document.querySelector('#login').hidden=false;document.querySelector('#enable-push').disabled=true;}
 function connection(online){const el=document.querySelector('#connection');message(el,online?'На связи':'Нет соединения');el.dataset.online=String(online);}
 async function api(url,body){
  const epoch=viewEpoch;
  const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const data=await r.json();if(epoch!==viewEpoch&&url!=='/api/admin/login')throw Object.assign(new Error('Нужен вход владельца'),{status:401});if(!r.ok)throw Object.assign(new Error(data.error||'Ошибка запроса'),{status:r.status});return data;
 }
 const errorMessages={'Visit has not finished':'Визит ещё не завершился.','Active booking not found':'Активная запись не найдена.','Booking not found':'Запись не найдена.','Invalid actual price':'Укажите корректную сумму.','Price must be within quoted range':'Сумма должна быть в указанном диапазоне.','Invalid duration':'Укажите длительность от 1 до 720 минут.','Invalid day':'Проверьте дату.','Invalid slot':'Выберите доступный час.','Existing booking overlaps this hour':'Сначала отмените запись, которая пересекается с этим часом.','Cancel the overlapping booking first':'Сначала отмените запись, которая пересекается с этим часом.','Cancel the booking first':'Сначала отмените запись.'};
 function showError(error){const message=error.status?(errorMessages[error.message]||error.message):'Не удалось связаться с сервером. Изменения не подтверждены — обнови список перед повтором.';bind(status,()=>tr(message));if(error.status===401)showLogin();if(!error.status)connection(false);}
 async function action(url,body){try{message(status,'');await api(url,body);await load();return true;}catch(e){showError(e);return false;}}
 function formatMinor(value){return value===null||value===undefined?'—':(Number(value)/100).toFixed(2)+' AZN';}
 function appointment(row){
  const box=document.createElement('article');box.className='appointment';if(row.id===highlight)box.classList.add('highlight');
  const heading=document.createElement('strong');bind(heading,()=>`${row.date} · ${row.time} · ${tr(row.kind==='block'?'личная блокировка':row.status==='cancelled'?'отменена':row.status==='completed'?'завершена':'запись')}`);box.append(heading);if(row.archived){const badge=document.createElement('span');message(badge,'В архиве');badge.className='small-note';box.append(badge);}
  if(row.kind==='block')return box;
  if(managementMode){bind(heading,()=>`${row.date} · ${row.time} · ${window.IlkerReception.statusLabel(row.status)}`);box.dataset.status=row.status;}
  const name=document.createElement('p');name.textContent=row.name;box.append(name);
  const phone=document.createElement('a');phone.textContent=row.phone;phone.href='tel:'+row.phone.replace(/[^+\d]/g,'');box.append(phone);
  const service=document.createElement('p');const area=row.room==='vip'?'VIP OTAQ':'ZAL';
  const listed=row.price_min===row.price_max?formatMinor(row.price_min):`${formatMinor(row.price_min)} – ${formatMinor(row.price_max)}`;
  const cost=row.actual_price===null?`${listed} · итоговая цена не указана`:formatMinor(row.actual_price);
  service.className='appointment-service';const serviceName=document.createElement('span');serviceName.className='appointment-service-name';serviceName.textContent=row.service_name;service.append(serviceName);
  if(row.items?.length>1)for(const item of row.items){const detail=document.createElement('span');detail.className='appointment-service-details';detail.textContent=`${item.service_name} · ${item.price_min===item.price_max?formatMinor(item.price_min):`${formatMinor(item.price_min)} – ${formatMinor(item.price_max)}`}`;service.append(detail);}
  const serviceDetails=document.createElement('span');serviceDetails.className='appointment-service-details';bind(serviceDetails,()=>`${area} · ${row.duration_minutes} ${tr('мин')} · ${row.actual_price===null?listed+' · '+tr('итоговая цена не указана'):formatMinor(row.actual_price)}`);service.append(serviceDetails);box.append(service);if(row.master_name){const master=document.createElement('p');master.className='appointment-service-name';bind(master,()=>window.IlkerReception.bookingMaster(row));box.append(master);}
  const actions=document.createElement('div');actions.className='action-row';
  function addAction(label,handler,danger=false){const button=document.createElement('button');button.type='button';button.className='text-button'+(danger?' danger':'');message(button,label);button.addEventListener('click',async()=>{button.disabled=true;try{await handler();}finally{button.disabled=false;}});actions.append(button);}
  if(managementMode){if(['completed','cancelled'].includes(row.status)||row.paid_minor>0){const paid=document.createElement('p');paid.className='appointment-service-details';bind(paid,()=>tr('Учтённая оплата: {amount}',{amount:formatMinor(row.paid_minor)}));box.append(paid);}window.IlkerReception.actions(row,actions);if(row.notes){const note=document.createElement('p');note.className='small-note';note.textContent=row.notes;box.append(note);}box.append(actions);return box;}
  if(row.status==='active'){
   addAction('Завершить визит',async()=>{if(!confirm(tr('Отметить визит завершённым?')))return;await action('/api/admin/complete',{id:row.id});});
   addAction('Отменить и освободить время',async()=>{if(!confirm(tr('Отменить запись и освободить время? Клиента нужно предупредить отдельно.')))return;await action('/api/admin/cancel',{id:row.id});},true);
  }
  if(row.status==='active'||row.status==='completed')if(row.price_min!==row.price_max)addAction('Указать итоговую цену',async()=>{const raw=prompt(tr('Итоговая стоимость в AZN ({min} – {max})',{min:formatMinor(row.price_min),max:formatMinor(row.price_max)}),row.actual_price===null?'':(row.actual_price/100).toFixed(2));if(raw===null)return;await action('/api/admin/price',{id:row.id,price:raw.trim().replace(',','.')});});
  if(row.status==='cancelled'&&!row.archived)addAction(managementMode?'Архивировать запись':'Удалить данные записи',async()=>{if(!confirm(tr(managementMode?'Архивировать отменённую запись? История сохранится.':'Безвозвратно удалить отменённую запись и контакты клиента?')))return;await action('/api/admin/delete',{id:row.id});},true);
  addAction('История клиента',async()=>{offset=0;document.querySelector('#booking-filter').value='all';document.querySelector('#booking-search').value=row.phone;if(tab!=='bookings')switchTab('bookings');else await load();});
  box.append(actions);return box;
 }
 async function loadBookings(){
  const filter=document.querySelector('#booking-filter').value;const q=document.querySelector('#booking-search').value.trim();
  const data=await api(`/api/admin/bookings?status=${filter}&offset=${offset}&q=${encodeURIComponent(q)}`);
  const root=document.querySelector('#all-bookings');const list=data.rows;
  if(highlight&&offset===0&&!q&&!list.some(x=>x.id===highlight)){
   try{const row=await api('/api/admin/booking/'+encodeURIComponent(highlight));list.unshift(row);}catch(e){if(e.status!==404)throw e;}
  }
  const signature=JSON.stringify(list);if(signature!==bookingsSignature){bookingsSignature=signature;root.replaceChildren(...list.map(appointment));if(!list.length){const empty=document.createElement('p');empty.className='empty';message(empty,'Записей по этому фильтру нет.');root.append(empty);}}
  bind(document.querySelector('#booking-count'),()=>tr('Всего: {count}. Обновление каждые 3 секунды.',{count:data.count}));
  document.querySelector('#page-prev').disabled=offset===0;document.querySelector('#page-next').disabled=offset+50>=data.count;
 }
 async function loadSchedule(){
  const date=document.querySelector('#admin-date').value;if(!date)return;
  if(managementMode){
   await window.IlkerManagement.schedule();const fresh=await api('/api/admin/day?date='+date);if(date!==document.querySelector('#admin-date').value)return;current=fresh;
   document.querySelector('#close-day').disabled=false;message(document.querySelector('#close-day'),current.closed?'Открыть весь салон':'Закрыть весь салон');
   const list=current.slots.filter(row=>!row.master_id||row.master_id===window.IlkerManagement.masterId);document.querySelector('#appointments').replaceChildren(...list.map(appointment));return;
  }
  const result=await Promise.all([api('/api/admin/day?date='+date),api('/api/availability?date='+date)]);
  if(date!==document.querySelector('#admin-date').value)return;[current,availability]=result;
  document.querySelector('#close-day').disabled=false;message(document.querySelector('#close-day'),current.closed?'Открыть день':'Закрыть весь день');
  const signature=JSON.stringify({date,closed:current.closed,slots:current.slots,availability:availability.slots});if(signature===scheduleSignature)return;scheduleSignature=signature;
  const root=document.querySelector('#admin-hours');root.replaceChildren();
  for(const slot of availability.slots){const row=current.slots.find(s=>s.time===slot.time);const button=document.createElement('button');button.type='button';bind(button,()=>slot.time+(row?.kind==='booking'?' · '+tr('запись'):row?' · '+tr('закрыто'):slot.status==='booked'?' · '+tr('запись'):current.closed?' · '+tr('день закрыт'):''));button.disabled=slot.status==='past'||slot.status==='booked'||(current.closed&&!row);button.setAttribute('aria-pressed',String(Boolean(row)||current.closed));window.IlkerAdminI18n.bind(button,()=>tr(row?.kind==='booking'?'Отмени запись отдельно':row?'Открыть этот час':'Закрыть этот час'),'title');button.addEventListener('click',async()=>{button.disabled=true;await action('/api/admin/slot',{date,time:slot.time,blocked:!row});});root.append(button);}
  const list=document.querySelector('#appointments');list.replaceChildren(...current.slots.map(appointment));
 }
 async function loadServices(){if(managementMode)return window.IlkerManagement.services();
  const root=document.querySelector('#service-settings');root.replaceChildren();
  const [meta,settings]=await Promise.all([api('/api/meta'),api('/api/admin/services')]);const room=document.querySelector('#duration-room').value;const values=new Map(settings.services.map(item=>[item.id,item.duration_minutes]));
  let groupId='';for(const item of meta.services){if(item.group!==groupId){groupId=item.group;const heading=document.createElement('h3');heading.className='service-group-heading';bind(heading,(_,lang)=>item.groupTranslations?.[lang]||item.groupName);root.append(heading);}
   const card=document.createElement('article');card.className='duration-card';card.dataset.serviceId=item.id;const detail=document.createElement('div');const name=document.createElement('strong');bind(name,(_,lang)=>item.translations?.[lang]||item.name);const price=document.createElement('p');const p=item.prices[room];price.textContent=(typeof p==='number'?p:`${p.min}–${p.max}`)+' AZN · '+(room==='vip'?'VIP OTAQ':'ZAL');detail.append(name,price);
   const label=document.createElement('label');message(label,'Длительность, минут');const input=document.createElement('input');input.type='number';input.inputMode='numeric';input.min='1';input.max='720';window.IlkerAdminI18n.bind(input,'Не задано','placeholder');const value=values.get(item.id+':'+room);input.value=value===null||value===undefined?'':String(value);label.append(input);
   const button=document.createElement('button');button.type='button';button.className='button primary';message(button,'Сохранить');button.addEventListener('click',async()=>{const text=input.value.trim(),minutes=text===''?null:Number(text);if(minutes!==null&&(!Number.isInteger(minutes)||minutes<1||minutes>720)){message(status,'Укажите длительность от 1 до 720 минут.');input.focus();return;}button.disabled=true;try{await api('/api/admin/duration',{serviceId:item.id,room,minutes});bind(status,(_,lang)=>tr('Длительность сохранена: {name} · {category}.',{name:item.translations?.[lang]||item.name,category:room==='vip'?'VIP OTAQ':'ZAL'}));connection(true);}catch(e){showError(e);}finally{button.disabled=false;}});card.append(detail,label,button);root.append(card);
  }
 }
 async function loadRevenue(){if(managementMode)return window.IlkerReception.finance();const data=await api('/api/admin/revenue');document.querySelector('#revenue-total').textContent=data.total+' AZN';bind(document.querySelector('#revenue-count'),()=>tr('Завершённых оплаченных визитов: {count}',{count:data.visits}));document.querySelector('#revenue-unpriced').textContent=String(data.unpriced);const root=document.querySelector('#revenue-rooms');root.replaceChildren();for(const room of ['zal','vip']){const row=data.rooms.find(item=>item.room===room);const line=document.createElement('p');line.textContent=(room==='zal'?'ZAL':'VIP OTAQ')+' · '+formatMinor(row?.total??0);root.append(line);}}
 async function load(){if(!csrf||polling||document.hidden||document.querySelector('.reception-dialog[open]')||['services','masters','rooms','settings'].includes(tab))return;polling=true;try{if(tab==='home')await window.IlkerReception.home();else if(tab==='calendar')await window.IlkerReception.calendar();else if(tab==='clients')await window.IlkerReception.clients();else if(tab==='bookings')await loadBookings();else if(tab==='schedule'&&(!managementMode||!document.querySelector('#management-schedule').contains(document.activeElement)))await loadSchedule();else if(tab==='revenue')await loadRevenue();connection(true);}catch(e){showError(e);}finally{polling=false;}}
 function switchTab(next){tab=next;for(const name of ['home','calendar','clients','bookings','schedule','services','revenue','masters','rooms','settings']){document.querySelector('#'+name+'-view').hidden=tab!==name;document.querySelector('#tab-'+name).setAttribute('aria-pressed',String(tab===name));}if(tab==='settings')window.IlkerAccess.render().catch(showError);else if(tab==='masters')window.IlkerManagement.masters().catch(showError);else if(tab==='rooms')window.IlkerManagement.rooms().catch(showError);else if(tab==='services')loadServices().catch(showError);else load();}
 for(const name of ['home','calendar','clients','bookings','schedule','services','revenue','masters','rooms','settings'])document.querySelector('#tab-'+name).addEventListener('click',()=>switchTab(name));
 document.querySelector('#manual-booking').addEventListener('click',()=>window.IlkerReception.editor().catch(showError));
 document.querySelector('#duration-room').addEventListener('change',()=>loadServices().catch(showError));
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
  if(!pushSupported()){message(info,'Push недоступен в этом браузере или соединение не защищено. Для телефона нужен HTTPS.');return;}
  try{
   pushConfig=await api('/api/admin/push/config');
   if(ios&&!standalone()){message(info,'На iPhone сначала добавь админку на экран «Домой», открой ее с иконки и нажми «Включить Push».');return;}
   if(!pushConfig.enabled){message(info,'Серверные VAPID-ключи еще не настроены. Список записей работает без Push.');return;}
   if(Notification.permission==='denied'){message(info,'Уведомления запрещены. Разреши их в настройках браузера или iPhone, затем открой приложение снова.');return;}
   const subscription=await localSubscription();
   if(subscription){await api('/api/admin/push/subscribe',{subscription:subscription.toJSON()});disable.disabled=false;test.disabled=false;message(info,'Push включен на этом устройстве. Сервер отправит уведомление о новой записи.');}
   else{enable.disabled=false;message(info,'Нажми кнопку и разреши уведомления. Запрос появится только после твоего действия.');}
  }catch(e){message(info,'Не удалось проверить Push. Обнови страницу или войди заново.');if(e.status===401)showLogin();}
 }
 document.querySelector('#enable-push').addEventListener('click',async()=>{
  const button=document.querySelector('#enable-push');if(!csrf||!pushSupported()||!pushConfig?.enabled||(ios&&!standalone()))return;
  // Keep the permission request directly inside the click gesture for iOS.
  const permissionPromise=Notification.requestPermission();button.disabled=true;let success=false;
  try{const permission=await permissionPromise;if(permission!=='granted'){message(document.querySelector('#push-status'),'Разрешение не получено. Можно продолжить работу без уведомлений.');return;}
   const reg=await getRegistration();let subscription=await reg.pushManager.getSubscription();
   if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(pushConfig.publicKey)});
   try{await api('/api/admin/push/subscribe',{subscription:subscription.toJSON()});}catch(e){await subscription.unsubscribe();throw e;}
   success=true;await updatePush();
  }catch(e){message(document.querySelector('#push-status'),'Не удалось включить Push. Проверь HTTPS, разрешение уведомлений и сеть.');}finally{if(!success)button.disabled=false;}
 });
 document.querySelector('#disable-push').addEventListener('click',async()=>{try{const subscription=await localSubscription();if(subscription){await api('/api/admin/push/unsubscribe',{endpoint:subscription.endpoint});await subscription.unsubscribe();}await updatePush();}catch(e){showError(e);}});
 document.querySelector('#test-push').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const subscription=await localSubscription();if(!subscription)throw new Error('No subscription');await api('/api/admin/push/test',{endpoint:subscription.endpoint});message(status,'Push-сервис принял тестовое сообщение. Проверь уведомления устройства.');}catch(e){message(status,e.status?e.message:'Не удалось проверить Push.');}finally{button.disabled=false;}});
 async function signedIn(){const meta=await api('/api/meta');managementMode=Boolean(meta.management);serverOffset=meta.serverTime-Date.now();if(managementMode){await window.IlkerManagement.init(api,showError);await window.IlkerReception.init(api,showError,appointment,load,serverOffset);await window.IlkerAccess.init(api,showError,showLogin);document.querySelector('#admin-date').min=day();document.querySelector('#admin-date').value=day();}document.querySelector('#login').hidden=true;document.querySelector('#dashboard').hidden=false;message(status,'');if(managementMode)switchTab('home');else await load();updatePush();}
 document.querySelector('#login').addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{csrf=(await api('/api/admin/login',{login:event.target.elements.login.value,password:event.target.elements.password.value})).csrf;viewEpoch++;event.target.reset();await signedIn();}catch(e){showError(e);}finally{button.disabled=false;}});
 document.querySelector('#logout').addEventListener('click',async()=>{try{const subscription=await localSubscription().catch(()=>null);await api('/api/admin/logout',{endpoint:subscription?.endpoint});if(subscription)await subscription.unsubscribe().catch(()=>{});showLogin();message(status,'Выход выполнен. Это устройство больше не получает новые Push.');}catch(e){showError(e);}});
 async function restore(){try{csrf=(await api('/api/admin/session')).csrf;await signedIn();}catch(e){showLogin();if(e.status===401){connection(true);message(status,'Войди, чтобы открыть записи.');}else showError(e);}}
 addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;document.querySelector('#install-app').hidden=false;});
 document.querySelector('#install-app').addEventListener('click',async()=>{if(!installPrompt)return;await installPrompt.prompt();installPrompt=null;document.querySelector('#install-app').hidden=true;});
 if(standalone())message(document.querySelector('#install-help'),'Приложение уже открыто с главного экрана. После входа можно включить Push.');
 addEventListener('offline',()=>{viewEpoch++;connection(false);clearPrivate();document.querySelector('#dashboard').hidden=true;document.querySelector('#login').hidden=false;message(status,'Нет интернета. Изменение расписания временно недоступно.');});
 addEventListener('online',restore);document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(csrf)load();else restore();}});
 document.addEventListener('adminlanguagechange',()=>{bookingsSignature='';scheduleSignature='';if(csrf&&!document.querySelector('.reception-dialog[open]'))load();});
 if(window.isSecureContext&&'serviceWorker'in navigator)getRegistration().catch(()=>{});
 setInterval(load,3000);restore();
})();

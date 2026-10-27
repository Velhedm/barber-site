'use strict';
(()=>{
 let csrf='';let current;let availability;const status=document.querySelector('#admin-status');
 async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body?JSON.stringify(body):undefined,cache:'no-store'});const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error),{status:r.status});return d;}
 function showError(e){status.textContent=e.message;if(e.status===401){document.querySelector('#dashboard').hidden=true;document.querySelector('#login').hidden=false;}}
 async function action(url,body){try{status.textContent='';await api(url,body);await load();}catch(e){showError(e);}}
 async function load(){
  const date=document.querySelector('#admin-date').value;if(!date)return;
  try{[current,availability]=await Promise.all([api('/api/admin/day?date='+date),api('/api/availability?date='+date)]);
   document.querySelector('#close-day').textContent=current.closed?'Открыть день':'Закрыть весь день';document.querySelector('#delivery').textContent=current.notificationsEnabled?'Telegram настроен. Ниже показано состояние доставки каждой записи.':'Telegram не настроен: укажи TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID на сервере.';
   const root=document.querySelector('#admin-hours');root.replaceChildren();
   for(const slot of availability.slots){const button=document.createElement('button');button.type='button';const row=current.slots.find(s=>s.time===slot.time);button.textContent=slot.time+(row?.kind==='booking'?' · запись':row?' · закрыто':'');button.disabled=slot.status==='past'||row?.kind==='booking';button.setAttribute('aria-pressed',String(Boolean(row)));button.title=row?.kind==='booking'?'Для освобождения отмени запись отдельно':row?'Открыть час':'Закрыть час';button.addEventListener('click',()=>action('/api/admin/slot',{date,time:slot.time,blocked:!row}));root.append(button);}
   const list=document.querySelector('#appointments');list.replaceChildren();for(const row of current.slots){const box=document.createElement('article');box.className='appointment';const heading=document.createElement('strong');heading.textContent=row.time+(row.kind==='booking'?' · запись клиента':' · личная блокировка');box.append(heading);
    if(row.kind==='booking'){for(const value of [row.name,row.phone,'Услуга: '+row.service_id,'Telegram: '+(row.sent_at?'отправлено':row.last_error?'повторная попытка доставки':'в очереди')]){const p=document.createElement('p');p.textContent=value;box.append(p);}const button=document.createElement('button');button.className='text-button';button.textContent='Отменить запись и освободить час';button.addEventListener('click',()=>{if(confirm('Отменить эту запись? Клиента необходимо предупредить отдельно.'))action('/api/admin/cancel',{id:row.id});});box.append(button);}list.append(box);}
  }catch(e){showError(e);}
 }
 document.querySelector('#login').addEventListener('submit',async e=>{e.preventDefault();try{csrf=(await api('/api/admin/login',{password:e.target.elements.password.value})).csrf;e.target.reset();document.querySelector('#login').hidden=true;document.querySelector('#dashboard').hidden=false;status.textContent='';await load();}catch(e){showError(e);}});
 document.querySelector('#admin-date').value=new Date(Date.now()+4*3600000).toISOString().slice(0,10);document.querySelector('#admin-date').addEventListener('change',load);
 document.querySelector('#close-day').addEventListener('click',()=>action('/api/admin/day',{date:document.querySelector('#admin-date').value,closed:!current.closed}));
 document.querySelector('#logout').addEventListener('click',async()=>{await action('/api/admin/logout',{});csrf='';document.querySelector('#dashboard').hidden=true;document.querySelector('#login').hidden=false;});
 api('/api/admin/session').then(async session=>{csrf=session.csrf;document.querySelector('#login').hidden=true;document.querySelector('#dashboard').hidden=false;await load();}).catch(()=>{});
 setInterval(()=>{if(csrf&&!document.hidden)load();},10000);
})();

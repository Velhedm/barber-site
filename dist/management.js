'use strict';
// UI extension of the existing owner panel. API, cookies and CSRF stay in admin.js.
window.IlkerManagement = (() => {
  let api, fail, model, selected = '', busy = false;
  const $ = selector => document.querySelector(selector);
  const tr=(key,params)=>window.IlkerAdminI18n.t(key,params);
  const name = master => master.name || tr('Мастер {number}',{number:master.position});
  const bind=(el,fn)=>window.IlkerAdminI18n.bind(el,fn);
  function text(tag,key,cls){return bind(node(tag,key,cls),key);}
  function masterText(el,m){return bind(el,()=>name(m));}
  function serviceText(el,s){return bind(el,(_,lang)=>lang==='az'?s.name:(s.translations?.[lang]||s.name));}
  const actionLabels=new Set(['+ Добавить мастера','Убрать','+ Перерыв','Сохранить мастера','Архивировать мастера','Клиенты и доход мастера','История','Восстановить','Назад','Следующие 50','Сохранить','Добавить комнату','+ Добавить услугу','Сохранить услугу','Закрыть','Редактировать','Вернуть обычный график','Выходной для мастера','Закрыть время','Открыть время']);
  function node(tag, content, className) {const el = document.createElement(tag); if(content !== undefined) el.textContent = content; if(className) el.className = className; return el;}
  function button(label, fn, primary = false) {
    const el = node('button', label, primary ? 'button primary' : 'text-button');if(actionLabels.has(label))window.IlkerAdminI18n?.bind(el,label); el.type = 'button';
    el.addEventListener('click', async () => {if(busy)return;busy=true;el.disabled=true;try{await fn();}catch(error){fail(error);}finally{busy=false;el.disabled=false;}}); return el;
  }
  function field(title, type = 'text', value = '', translate = true) {
    const label = node('label', title), input = node('input');input.type=type;input.value=value??'';
    if(type === 'text') input.maxLength=100;label.append(input);if(translate){window.IlkerAdminI18n?.bind(label,title);input.setAttribute('aria-label',title);window.IlkerAdminI18n?.bind(input,title,'aria-label');}return {label,input};
  }
  function check(title, checked, translate=true) {const pair=field(title,'checkbox','',translate);pair.label.className='management-check';pair.input.checked=checked;return pair;}
  function select(title, options, value) {const label=node('label',title),input=node('select');for(const [id,name] of options){const option=new Option(name,id);if(title==='Комната / ресурс'&&id==='')window.IlkerAdminI18n?.bind(option,name);input.append(option);}input.value=value||'';label.append(input);window.IlkerAdminI18n?.bind(label,title);input.setAttribute('aria-label',title);window.IlkerAdminI18n?.bind(input,title,'aria-label');return {label,input};}
  function note(key) {return text('p',key,'small-note');}
  async function refresh(){model=await api('/api/admin/management');}
  function saved(){ bind($('#admin-status'),'Изменения сохранены.'); }
  function validate(form){if(!form.reportValidity())throw Object.assign(new Error('Проверьте заполненные поля.'),{status:400});}
  function masterPayload(master){return {id:master.id,revision:master.revision,name:master.name,online:master.online,archived:master.archived,stepMinutes:master.step_minutes,schedule:master.schedule,serviceIds:master.serviceIds,roomId:master.room_id};}
  async function masters(){
    await refresh();const root=$('#masters-view');root.replaceChildren();
    const toolbar=node('div',undefined,'management-master-tabs');
    const visible=model.masters.filter(m=>!m.archived);if(!visible.some(m=>m.id===selected))selected=visible[0]?.id||'';
    for(const m of visible){const tab=masterText(button(name(m),async()=>{selected=m.id;await masters();}),m);tab.setAttribute('aria-pressed',String(m.id===selected));toolbar.append(tab);}
    toolbar.append(button('+ Добавить мастера',async()=>{const m=await api('/api/admin/masters',{name:'',online:false,archived:false,stepMinutes:60,schedule:Array.from({length:7},()=>({closed:true})),serviceIds:[]});selected=m.id;await masters();},true));root.append(toolbar);
    const master=model.masters.find(m=>m.id===selected);if(!master)return;
    const form=node('form',undefined,'management-form');form.addEventListener('submit',event=>event.preventDefault());
    const title=masterText(node('h2'),master),grid=node('div',undefined,'management-grid');
    const displayName=field('Имя мастера','text',master.name),online=check('Принимать онлайн-записи',master.online);
    const step=select('Шаг начала записи, минут',[10,15,20,30,60].map(n=>[String(n),String(n)]),String(master.step_minutes));
    const room=select('Комната / ресурс',[['','Без ограничения комнаты'],...model.rooms.filter(r=>!r.archived).map(r=>[r.id,r.name])],master.room_id);
    grid.append(displayName.label,step.label,room.label,online.label);form.append(title,grid,note('Новые мастера отключены до настройки. Изменения графика не отменяют ранее созданные визиты. ZAL/VIP — категория цены, комната — отдельный ресурс.'));
    const serviceDetails=node('details',undefined,'management-disclosure'),services=node('fieldset',undefined,'management-services');serviceDetails.append(bind(node('summary'),()=>tr('Услуги мастера · {count}',{count:master.serviceIds.length})),services);services.append(text('legend','Выберите услуги'));
    const choices=model.services.filter(s=>!s.archived).map(s=>{const control=check(s.translations.ru||s.name,master.serviceIds.includes(s.id),false);serviceText(control.label,s);services.append(control.label);return {id:s.id,...control};});form.append(serviceDetails);
    form.append(text('h3','Рабочая неделя'));
    const days=['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
    const rows=master.schedule.map((day,i)=>{
      const row=node('details',undefined,'management-day'),open=check('Рабочий день',!day.closed),start=field('Начало','time',day.start||''),end=field('Конец','time',day.end||'');
      const summary=bind(node('summary'),()=>`${tr(days[i])} · ${day.closed?tr('Выходной'):day.start+'–'+day.end}`);row.append(summary);start.input.step=end.input.step='60';
      const controls=node('div',undefined,'management-grid');controls.append(open.label,start.label,end.label);row.append(controls);
      const list=node('div',undefined,'management-breaks'),breaks=[];
      function addBreak(item={}){const line=node('div',undefined,'management-break'),a=field('Перерыв с','time',item.start),b=field('До','time',item.end),entry={a,b};line.append(a.label,b.label,button('Убрать',()=>{breaks.splice(breaks.indexOf(entry),1);line.remove();}));breaks.push(entry);list.append(line);}
      (day.breaks||[]).forEach(addBreak);row.append(list,button('+ Перерыв',()=>{if(breaks.length<12)addBreak();}));form.append(row);
      return {open,start,end,breaks};
    });
    const actions=node('div',undefined,'action-row management-save-actions');
    actions.append(button('Сохранить мастера',async()=>{
      validate(form);const schedule=rows.map(row=>!row.open.input.checked?{closed:true}:{closed:false,start:row.start.input.value,end:row.end.input.value,breaks:row.breaks.map(b=>({start:b.a.input.value,end:b.b.input.value}))});
      await api('/api/admin/masters',{...masterPayload(master),name:displayName.input.value,online:online.input.checked,stepMinutes:Number(step.input.value),roomId:room.input.value||null,schedule,serviceIds:choices.filter(c=>c.input.checked).map(c=>c.id)});saved();await masters();
    },true));
    actions.append(button('Архивировать мастера',async()=>{if(!confirm(tr('Отключить мастера? История и существующие визиты сохранятся.')))return;await api('/api/admin/masters',{...masterPayload(master),online:false,archived:true});saved();await masters();}));
    actions.append(button('Клиенты и доход мастера',()=>history(master.id)));form.append(actions);root.append(form);
    const historyRoot=node('div');historyRoot.id='master-history';root.append(historyRoot);
    const archived=model.masters.filter(m=>m.archived);if(archived.length){root.append(text('h3','Архив мастеров'));for(const m of archived){const card=node('article',undefined,'appointment');card.append(masterText(node('strong'),m),button('История',()=>history(m.id)),button('Восстановить',async()=>{await api('/api/admin/masters',{...masterPayload(m),archived:false,online:false});await masters();}));root.append(card);}}
  }
  async function history(id,offset=0){const data=await api('/api/admin/master-history?'+new URLSearchParams({masterId:id,offset})),root=$('#master-history');root.replaceChildren(text('h3','История мастера'),bind(note(''),()=>tr('Завершено: {count} · Доход: {amount} AZN',{count:data.revenue.completed,amount:(data.revenue.total/100).toFixed(2)})));
    for(const row of data.rows){const card=node('article',undefined,'appointment');card.append(bind(node('strong'),()=>`${row.date} · ${row.time} · ${window.IlkerReception.statusLabel(row.status)}`),node('p',row.name),node('p',row.service_name,'appointment-service-name'),node('p',row.phone));root.append(card);}
    const pager=node('div',undefined,'action-row');if(offset)pager.append(button('Назад',()=>history(id,Math.max(0,offset-50))));if(data.rows.length===50)pager.append(button('Следующие 50',()=>history(id,offset+50)));root.append(pager);root.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  async function rooms(){await refresh();const root=$('#rooms-view');root.replaceChildren(text('h2','Комнаты и ресурсы'),note('Добавляйте только реальные комнаты. Вместимость ограничивает число одновременных визитов назначенных мастеров.'));
    function editor(item={name:'',capacity:1,archived:0}){const form=node('form',undefined,'management-form');form.addEventListener('submit',e=>e.preventDefault());const title=field('Название','text',item.name),capacity=field('Одновременных клиентов','number',item.capacity),archived=check('В архиве',Boolean(item.archived));title.input.required=true;capacity.input.min='1';capacity.input.max='99';capacity.input.required=true;form.append(title.label,capacity.label,archived.label,button(item.id?'Сохранить':'Добавить комнату',async()=>{validate(form);await api('/api/admin/rooms',{...item,name:title.input.value,capacity:Number(capacity.input.value),archived:archived.input.checked});saved();await rooms();},true));return form;}
    root.append(editor());for(const room of model.rooms)root.append(editor(room));
  }
  async function services(){await refresh();const root=$('#services-view');root.replaceChildren(text('h2','Услуги'),note('Цены в AZN. Изменения применяются к новым записям; история сохраняет прежнюю стоимость. Назначить услуги мастеру можно в разделе «Мастера».'));
    root.append(button('+ Добавить услугу',()=>editor()));
    const editorRoot=node('div');editorRoot.id='catalog-editor';root.append(editorRoot);
    function editor(service){
      const item=service||{name:'',translations:{ru:'',en:''},active:true,archived:false,position:model.services.length,prices:{zal:0,vip:0},durations:{zal:null,vip:null}};
      const form=node('form',undefined,'management-form');form.addEventListener('submit',e=>e.preventDefault());
      const az=field('Название · AZ','text',item.name),ru=field('Название · RU','text',item.translations.ru),en=field('Название · EN','text',item.translations.en);for(const p of [az,ru,en]){p.input.required=true;form.append(p.label);}
      const options={};for(const category of ['zal','vip']){const p=item.prices[category],min=field('Цена от · AZN','number',typeof p==='number'?p:p.min),max=field('Цена до · AZN','number',typeof p==='number'?p:p.max),duration=field('Длительность, минут','number',item.durations[category]);
        for(const c of [min,max]){c.input.min='0';c.input.max='9999999.99';c.input.step='0.01';c.input.required=true;}duration.input.min='1';duration.input.max='720';duration.input.step='1';
        const block=node('fieldset',undefined,'management-grid');block.append(node('legend',category.toUpperCase()),min.label,max.label,duration.label);form.append(block);options[category]={min,max,duration};}
      const active=check('Доступна клиентам',item.active),archived=check('В архиве',item.archived),order=field('Порядок отображения','number',item.position);order.input.min='0';order.input.max='10000';form.append(active.label,archived.label,order.label);
      form.append(button('Сохранить услугу',async()=>{validate(form);const priceOptions={};for(const [category,controls]of Object.entries(options))priceOptions[category]={priceMin:Math.round(Number(controls.min.input.value)*100),priceMax:Math.round(Number(controls.max.input.value)*100),durationMinutes:controls.duration.input.value===''?null:Number(controls.duration.input.value)};
        await api('/api/admin/catalog',{id:item.id,revision:item.revision,name:az.input.value,translations:{ru:ru.input.value,en:en.input.value},active:active.input.checked,archived:archived.input.checked,position:Number(order.input.value),options:priceOptions});saved();await services();},true),button('Закрыть',()=>editorRoot.replaceChildren()));editorRoot.replaceChildren(form);az.input.focus();
    }
    for(const item of model.services){const card=node('article',undefined,'duration-card');card.append(serviceText(node('strong'),item),bind(note(''),()=>`${tr(item.archived?'Архив':item.active?'Активна':'Скрыта')} · ${item.durations.zal??'—'} / ${item.durations.vip??'—'} ${tr('мин')}`),button('Редактировать',()=>editor(item)));root.append(card);}
  }
  async function schedule(){
    if(!model)await refresh();const root=$('#management-schedule');if(!root)return;
    const date=$('#admin-date').value;if(!date)return;
    if(!root.firstChild){const choose=select('Мастер',model.masters.filter(m=>!m.archived).map(m=>[m.id,name(m)]),selected||model.masters[0]?.id);choose.input.id='schedule-master';for(const option of choose.input.options){const m=model.masters.find(m=>m.id===option.value);if(m)masterText(option,m);}choose.input.addEventListener('change',()=>{selected=choose.input.value;schedule().catch(fail);});root.append(choose.label,node('div'));root.lastChild.id='master-day-controls';}
    const masterId=$('#schedule-master').value;if(!masterId)return;selected=masterId;
    const details=await api('/api/admin/master-day?'+new URLSearchParams({masterId,date}));
    if(date!==$('#admin-date').value||masterId!==$('#schedule-master').value)return;
    const target=$('#master-day-controls'),signature=JSON.stringify({date,masterId,details});if(target.dataset.signature===signature)return;target.dataset.signature=signature;target.replaceChildren();const closed=details.exception?.closed===true;
    target.append(button(closed?'Вернуть обычный график':'Выходной для мастера',async()=>{await api('/api/admin/master-exception',{masterId,date,day:closed?null:{closed:true}});saved();await schedule();}));
    const from=field('Закрыть с','time'),to=field('До','time'),range=node('div',undefined,'management-break');range.append(from.label,to.label,button('Закрыть время',async()=>{await api('/api/admin/master-block',{masterId,date,start:from.input.value,end:to.input.value,blocked:true});saved();await schedule();}));target.append(range);
    for(const block of details.blocks){const start=clock(block.start_minute),end=clock(block.end_minute);const line=node('div',undefined,'action-row');line.append(note(`${start}–${end}`),button('Открыть время',async()=>{await api('/api/admin/master-block',{masterId,date,start,end,blocked:false});saved();await schedule();}));target.append(line);}
  }
  function clock(m){return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
  async function init(request,onError){api=request;fail=onError;await refresh();document.querySelectorAll('[data-management-only]').forEach(el=>el.hidden=false);$('#duration-room').closest('.admin-toolbar').hidden=true;$('#admin-hours').hidden=true;}
  function clear(){model=null;selected='';for(const id of ['masters-view','rooms-view','master-day-controls'])$('#'+id)?.replaceChildren();}
  return {init,masters,rooms,services,schedule,clear,get masterId(){return selected;}};
})();

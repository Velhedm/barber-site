'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const state = {ready:false, submitting:false, confirmed:false, uncertain:false, online:navigator.onLine, offset:0, maxDays:365, hours:[], services:[], date:'', time:'', month:'', availability:null, loading:false, requestKey:crypto.randomUUID(), payload:''};
  let availabilityRequest = null;
  let loadSequence = 0;
  const details = {haircut:'Мытьё до и после стрижки, укладка стайлингом.', kids:'До 11 лет. Мытьё до и после стрижки, укладка стайлингом.', beard:'Мытьё бороды, кондиционер-бальзам.', combo:'Мужская стрижка и оформление бороды.', peeling:'Уход и очищение кожи головы.', styling:'Мытьё головы и укладка стайлингом.'};
  function localDay(offset=0) {return new Date(Date.now()+state.offset+4*3600000+offset*86400000).toISOString().slice(0,10);}
  function validDate(date) {return date>=localDay()&&date<=localDay(state.maxDays);}
  function dateObject(date) {return new Date(date+'T12:00:00+04:00');}
  function label(date,options={day:'numeric',month:'long'}) {return new Intl.DateTimeFormat('ru',{timeZone:'Asia/Baku',...options}).format(dateObject(date));}
  function endTime(time) {return String(Number(time.slice(0,2))+1).padStart(2,'0')+':00';}
  function future(time) {return Date.parse(`${state.date}T${time}:00+04:00`)>Date.now()+state.offset;}
  function free(time) {return state.availability?.date===state.date&&state.availability.slots.some(slot=>slot.time===time&&slot.status==='available')&&future(time);}
  function service() {return state.services.find(item=>item.id===$('#service').value);}
  function showError(message='') {$('#form-error').hidden=!message;$('#form-error').textContent=message;}
  async function api(url,options={}) {
    const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers},cache:'no-store',signal:options.signal||AbortSignal.timeout(15000)});
    let body;try{body=await response.json();}catch{throw new Error('Не удалось получить ответ. Проверь соединение и попробуй ещё раз.');}
    if(!response.ok)throw Object.assign(new Error(body.error||'Не удалось выполнить запрос.'),{status:response.status});
    return body;
  }
  function updateSummary() {
    const item=service();
    $('#summary-service').textContent=item?.name||'—';
    $('#summary-price').textContent=item?`${item.price} AZN`:'—';
    $('#summary-date').textContent=state.date?label(state.date):'Не выбрана';
    $('#summary-time').textContent=state.time?`${state.time}–${endTime(state.time)}`:'Не выбрано';
    $('#service-description').textContent=details[item?.id]||'';
    $('#confirm-booking').disabled=!state.ready||!state.online||state.submitting||!state.time||(!state.uncertain&&!free(state.time));
    $('#submit-label').textContent=state.submitting?'Подтверждаем…':state.uncertain?'Проверить запись':'Подтвердить запись';
    $('#submit-hint').textContent=state.uncertain?'Нажми, чтобы получить результат отправленной записи':!state.online?'Нет соединения с интернетом':!state.ready?'Загружаем расписание…':!state.date?'Выбери дату визита':!state.time?'Выбери свободное время':`${label(state.date)} · ${state.time}–${endTime(state.time)} · Баку`;
  }
  function renderCalendar(focusDate) {
    const [year,month]=state.month.split('-').map(Number);
    const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
    const count=new Date(Date.UTC(year,month,0)).getUTCDate();
    $('#month-title').textContent=label(state.month+'-01',{month:'long',year:'numeric'}).replace(' г.','');
    $('#month-prev').disabled=state.month<=localDay().slice(0,7);
    $('#month-next').disabled=state.month>=localDay(state.maxDays).slice(0,7);
    const nodes=[];
    for(let i=0;i<offset;i++){const spacer=document.createElement('span');spacer.setAttribute('aria-hidden','true');nodes.push(spacer);}
    for(let day=1;day<=count;day++){
      const date=state.month+'-'+String(day).padStart(2,'0');const button=document.createElement('button');
      button.type='button';button.textContent=day;button.dataset.date=date;button.disabled=!validDate(date)||!state.ready||state.submitting||state.uncertain;
      button.setAttribute('aria-label',label(date,{day:'numeric',month:'long',year:'numeric',weekday:'long'}));
      button.setAttribute('aria-pressed',String(date===state.date));
      if(date===localDay())button.setAttribute('aria-current','date');
      button.addEventListener('click',()=>selectDate(date));nodes.push(button);
    }
    $('#calendar-days').replaceChildren(...nodes);
    if(focusDate)$('#calendar-days').querySelector(`[data-date="${focusDate}"]`)?.focus();
  }
  function shiftMonth(delta){const [year,month]=state.month.split('-').map(Number);const next=new Date(Date.UTC(year,month-1+delta,1)).toISOString().slice(0,7);if(next<localDay().slice(0,7)||next>localDay(state.maxDays).slice(0,7))return;state.month=next;renderCalendar();}
  function selectDate(date){if(!validDate(date)||state.submitting||state.uncertain)return;state.date=date;state.time='';state.availability=null;showError();renderCalendar();updateSummary();refreshSlots(true);}
  function renderSlots() {
    const focusTime=$('#booking-slots').contains(document.activeElement)?document.activeElement.dataset.time:null;
    const nodes=state.hours.map(time=>{const button=document.createElement('button');const slot=state.availability?.slots.find(item=>item.time===time);
      button.type='button';button.dataset.time=time;button.textContent=time;button.disabled=!free(time)||state.submitting||state.uncertain;
      button.setAttribute('aria-pressed',String(state.time===time));
      const status=!future(time)||slot?.status==='past'?'Время прошло':slot?.status==='booked'?'Занято':slot?.status==='blocked'?'Недоступно':free(time)?'Свободно':'Недоступно';
      button.setAttribute('aria-label',`${time}–${endTime(time)}. ${status}`);button.title=status;
      button.addEventListener('click',()=>{if(!free(time))return;state.time=time;showError();renderSlots();updateSummary();});return button;
    });
    $('#booking-slots').replaceChildren(...nodes);
    if(focusTime)$('#booking-slots').querySelector(`[data-time="${focusTime}"]`)?.focus({preventScroll:true});
  }
  async function refreshSlots(showLoading=false) {
    if(!state.ready||!state.date||state.confirmed||state.submitting||state.uncertain)return;
    if(state.loading&&!showLoading)return;
    const sequence=++loadSequence,date=state.date;
    availabilityRequest?.abort();availabilityRequest=new AbortController();const controller=availabilityRequest;
    const timeout=setTimeout(()=>controller.abort(),15000);state.loading=true;
    $('#chosen-date').textContent=label(date,{weekday:'short',day:'numeric',month:'long'});
    $('#retry-slots').hidden=true;
    if(showLoading){$('#slots-status').textContent='Ищем свободное время…';$('#booking-slots').setAttribute('aria-busy','true');$('#booking-slots').replaceChildren(...Array.from({length:8},()=>{const node=document.createElement('span');node.className='skeleton';node.setAttribute('aria-hidden','true');return node;}));}
    try{
      const data=await api('/api/availability?date='+encodeURIComponent(date),{signal:controller.signal});
      if(sequence!==loadSequence||date!==state.date)return;
      state.offset=data.serverTime-Date.now();state.availability=data;
      if(state.time&&!free(state.time)){state.time='';showError('Выбранное время уже недоступно. Пожалуйста, выбери другой час.');}
      renderSlots();
      const count=state.hours.filter(free).length;
      $('#slots-status').textContent=data.dayClosed?'В этот день записи нет. Выбери другую дату.':count?'Выбери удобный час.':'Свободного времени нет. Выбери другую дату.';
    }catch{
      if(sequence!==loadSequence)return;
      state.availability=null;renderSlots();$('#slots-status').textContent=navigator.onLine?'Не удалось обновить время. Попробуй ещё раз.':'Нет интернета. Проверь соединение.';$('#retry-slots').hidden=false;
    }finally{
      clearTimeout(timeout);
      if(sequence===loadSequence){state.loading=false;$('#booking-slots').setAttribute('aria-busy','false');updateSummary();}
    }
  }
  async function initialize(){
    $('#retry-load').disabled=true;
    try{
      const meta=await api('/api/meta');state.offset=meta.serverTime-Date.now();state.hours=meta.hours;state.services=meta.services;state.maxDays=meta.maxDaysAhead;state.ready=true;
      $('#service').replaceChildren(...meta.services.map(item=>new Option(`${item.name} — ${item.price} AZN`,item.id)));$('#service').disabled=false;
      $('#load-error').hidden=true;state.month=localDay().slice(0,7);selectDate(localDay());
    }catch{
      $('#load-error').hidden=false;$('#load-error-text').textContent='Не удалось загрузить расписание. Попробуй ещё раз или позвони Руслану: +994 51 351 39 55.';
    }finally{$('#retry-load').disabled=false;updateSummary();}
  }
  $('#booking-form').addEventListener('submit',async event=>{
    event.preventDefault();if(state.submitting)return;showError();
    const name=$('#customer-name').value.trim(),phone=$('#customer-phone').value.trim();
    if(name.length<2||/[\u0000-\u001f]/.test(name)){showError('Укажи имя — минимум 2 символа.');$('#customer-name').focus();return;}
    const digits=phone.replace(/\D/g,'');if(!/^\+?[0-9() .-]+$/.test(phone)||digits.length<7||digits.length>15){showError('Проверь номер телефона, например +994 51 351 39 55.');$('#customer-phone').focus();return;}
    if(!state.ready||!state.online||!state.date||!state.time||(!state.uncertain&&!free(state.time))){showError('Выбери доступную дату и свободное время.');return;}
    const payload={name,phone,date:state.date,time:state.time,serviceId:service().id};const serialized=JSON.stringify(payload);
    if(serialized!==state.payload){state.payload=serialized;state.requestKey=crypto.randomUUID();}
    const bookedService={...service()};state.submitting=true;loadSequence++;availabilityRequest?.abort();state.loading=false;
    $('#booking-form').setAttribute('aria-busy','true');$('#confirm-booking').classList.add('is-loading');$('#submit-label').textContent='Подтверждаем…';$('#service').disabled=true;$('#customer-name').readOnly=true;$('#customer-phone').readOnly=true;renderSlots();renderCalendar();updateSummary();
    try{
      const result=await api('/api/bookings',{method:'POST',body:JSON.stringify({...payload,requestKey:state.requestKey})});
      state.confirmed=true;state.uncertain=false;$('#booking-layout').hidden=true;$('#booking-success').hidden=false;
      $('#success-date').textContent=label(result.date,{day:'numeric',month:'long',year:'numeric'});$('#success-time').textContent=`${result.time}–${endTime(result.time)}`;$('#success-service').textContent=bookedService.name;$('#success-price').textContent=bookedService.price+' AZN';$('#success-reference').textContent='Номер записи: '+result.id;
      $('#booking-success').focus({preventScroll:true});$('#booking').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
    }catch(error){
      state.uncertain=!error.status||error.status>=500;
      if(error.status===409){state.time='';state.availability=null;showError(error.message);}
      else showError(error.status?error.message:'Не удалось получить подтверждение. Нажми ещё раз с теми же данными — повторная отправка не создаст вторую запись.');
    }finally{
      state.submitting=false;$('#booking-form').setAttribute('aria-busy','false');$('#confirm-booking').classList.remove('is-loading');$('#submit-label').textContent='Подтвердить запись';$('#service').disabled=!state.ready||state.uncertain;$('#customer-name').readOnly=state.uncertain;$('#customer-phone').readOnly=state.uncertain;
      if(!state.confirmed){renderCalendar();updateSummary();refreshSlots();}
    }
  });
  $('#service').addEventListener('change',()=>{showError();updateSummary();});
  $('#month-prev').addEventListener('click',()=>shiftMonth(-1));$('#month-next').addEventListener('click',()=>shiftMonth(1));
  $('#calendar-days').addEventListener('keydown',event=>{const date=event.target.dataset.date,delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(!date||delta===undefined)return;event.preventDefault();const d=dateObject(date);d.setUTCDate(d.getUTCDate()+delta);const target=d.toISOString().slice(0,10);if(!validDate(target))return;state.month=target.slice(0,7);renderCalendar(target);});
  $('#retry-load').addEventListener('click',initialize);$('#retry-slots').addEventListener('click',()=>refreshSlots(true));
  $('#another-booking').addEventListener('click',()=>{state.confirmed=false;state.uncertain=false;state.requestKey=crypto.randomUUID();state.payload='';$('#booking-form').reset();showError();$('#booking-success').hidden=true;$('#booking-layout').hidden=false;state.month=localDay().slice(0,7);selectDate(localDay());$('#service').focus({preventScroll:true});});
  addEventListener('offline',()=>{state.online=false;updateSummary();});
  addEventListener('online',()=>{state.online=true;if(!state.ready)initialize();else refreshSlots(true);updateSummary();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.ready){renderCalendar();refreshSlots();}});
  addEventListener('focus',()=>{if(state.ready)refreshSlots();});
  setInterval(()=>{if(!document.hidden&&state.online&&state.ready)refreshSlots();},3000);
  if(/^#slide-[1-5]$/.test(location.hash))history.replaceState(null,'',location.pathname+location.search+'#booking');
  $('#copyright-year').textContent=new Date().getFullYear();state.month=localDay().slice(0,7);renderCalendar();initialize();
})();

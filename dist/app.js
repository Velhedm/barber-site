'use strict';
(() => {
  const slides = [...document.querySelectorAll('.slide')];
  let currentSlide = 1;
  const previous = document.querySelector('#previous-slide');
  const next = document.querySelector('#next-slide');
  function showSlide(number, focus = false) {
    currentSlide = Math.max(1, Math.min(5, number));
    slides.forEach((slide, index) => {slide.hidden = index !== currentSlide - 1;});
    document.querySelector('#slide-count').textContent = `0${currentSlide} / 05`;
    document.querySelector('#deck-progress').style.width = `${currentSlide * 20}%`;
    document.querySelectorAll('.slide-dots button').forEach(button => {
      if (Number(button.dataset.slide) === currentSlide) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    previous.disabled = currentSlide === 1;
    next.disabled = currentSlide === 5;
    if (location.hash !== `#slide-${currentSlide}`) history.pushState(null, '', `#slide-${currentSlide}`);
    window.scrollTo({top:0, behavior:'instant'});
    if (focus) {const heading = slides[currentSlide - 1].querySelector('h1,h2');heading.tabIndex = -1;heading.focus({preventScroll:true});}
  }
  function readHash() {const match = location.hash.match(/^#slide-([1-5])$/);showSlide(match ? Number(match[1]) : 1);}
  document.querySelectorAll('[data-slide]').forEach(button => button.addEventListener('click', () => showSlide(Number(button.dataset.slide), true)));
  previous.addEventListener('click', () => showSlide(currentSlide - 1, true));
  next.addEventListener('click', () => showSlide(currentSlide + 1, true));
  addEventListener('hashchange', readHash);
  addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input,textarea,select,[contenteditable=true],.days')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {event.preventDefault();showSlide(currentSlide + (event.key === 'ArrowRight' ? 1 : -1), true);}
  });
  document.querySelector('#fullscreen').addEventListener('click', async () => {
    try {if (document.fullscreenElement) await document.exitFullscreen();else await document.documentElement.requestFullscreen();} catch { /* The deck also works without fullscreen permission. */ }
  });
  const image = document.querySelector('#device-preview');
  function setDevice(mobile) {
    image.src = mobile ? 'assets/mobile.png' : 'assets/desktop.png';
    image.alt = `${mobile ? 'Мобильный' : 'Десктопный'} макет интерфейса Ruslan True`;
    image.classList.toggle('mobile-view', mobile);
    document.querySelector('#desktop-toggle').setAttribute('aria-pressed', String(!mobile));
    document.querySelector('#mobile-toggle').setAttribute('aria-pressed', String(mobile));
  }
  document.querySelector('#desktop-toggle').addEventListener('click', () => setDevice(false));
  document.querySelector('#mobile-toggle').addEventListener('click', () => setDevice(true));

  const availability = new Map();
  const pending = new Map();
  let serverOffset=0;
  let requestKey=crypto.randomUUID();
  let lastPayload='';
  async function api(url, options={}) {
    const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers},cache:'no-store',signal:AbortSignal.timeout(15000)});
    const body=await response.json();if(!response.ok)throw Object.assign(new Error(body.error||'Ошибка запроса'),{status:response.status});return body;
  }
  async function loadAvailability(date) {
    if(pending.has(date))return pending.get(date);
    const task=api('/api/availability?date='+encodeURIComponent(date)).then(data=>{serverOffset=data.serverTime-Date.now();availability.set(date,data);return data;}).finally(()=>pending.delete(date));
    pending.set(date,task);return task;
  }
  const form = document.querySelector('#demo-form');
  const slotsRoot = document.querySelector('#booking-slots');
  const daysRoot = document.querySelector('#calendar-days');
  let selectedDate = '';
  let selectedTime = '';
  let journeyStep = 1;
  let lastBooking = null;
  let animationId = 0;

  let hours = Array.from({length:10}, (_, index) => `${String(index + 10).padStart(2, '0')}:00`);
  const today = () => {
    const parts = new Intl.DateTimeFormat('en', {timeZone:'Asia/Baku',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(Date.now()+serverOffset));
    const part = key => parts.find(x => x.type === key).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  };
  let viewMonth = today().slice(0, 7);
  function dateObject(date) {return new Date(`${date}T12:00:00+04:00`);}
  function dateLabel(date, options = {day:'numeric',month:'long',year:'numeric'}) {return new Intl.DateTimeFormat('ru', {timeZone:'Asia/Baku',...options}).format(dateObject(date));}
  function endTime(time) {return `${String(Number(time.slice(0,2)) + 1).padStart(2,'0')}:00`;}
  function isBooked(date,time) {return availability.get(date)?.slots.find(s=>s.time===time)?.status!=='available';}
  function isPast(date, time) {return Date.parse(`${date}T${time}:00+04:00`) <= Date.now()+serverOffset;}
  function available(date,time) {return hours.includes(time)&&availability.get(date)?.slots.find(s=>s.time===time)?.status==='available'&&!isPast(date,time);}
  function tomorrow() {const d = dateObject(today());d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
  function summary() {
    document.querySelector('#selection-summary').textContent = selectedDate ? `${dateLabel(selectedDate)}${selectedTime ? ` · ${selectedTime}–${endTime(selectedTime)}` : ''} · Баку` : 'Выбери дату, чтобы начать';
  }
  function setStep(step) {
    journeyStep = step;
    document.querySelectorAll('.demo-step').forEach((panel,index) => {panel.hidden = index + 1 !== step;});
    document.querySelectorAll('#journey-list li').forEach((item,index) => {item.classList.toggle('current',index + 1 === step);item.classList.toggle('completed',index + 1 < step);});
    summary();
  }
  function renderCalendar(focusDate) {
    const [year, month] = viewMonth.split('-').map(Number);
    const first = new Date(Date.UTC(year,month-1,1));
    const length = new Date(Date.UTC(year,month,0)).getUTCDate();
    document.querySelector('#month-title').textContent = dateLabel(`${viewMonth}-01`,{month:'long',year:'numeric'});
    document.querySelector('#month-prev').disabled = viewMonth <= today().slice(0,7);
    daysRoot.replaceChildren();
    const offset = (first.getUTCDay()+6)%7;
    for(let i=0;i<offset;i++) {const blank=document.createElement('span');blank.setAttribute('aria-hidden','true');daysRoot.append(blank);}
    for(let day=1;day<=length;day++) {
      const date = `${viewMonth}-${String(day).padStart(2,'0')}`;
      const button = document.createElement('button');button.type='button';button.textContent=day;button.dataset.date=date;
      button.disabled=date<today();button.setAttribute('aria-pressed',String(date===selectedDate));button.setAttribute('aria-label',dateLabel(date,{day:'numeric',month:'long',year:'numeric',weekday:'long'}));
      if(date===today())button.setAttribute('aria-current','date');
      button.addEventListener('click', () => {selectedDate=date;selectedTime='';setStep(2);renderSlots();});
      daysRoot.append(button);
    }
    if(focusDate) daysRoot.querySelector(`[data-date="${focusDate}"]`)?.focus();
  }
  function shiftMonth(delta) {
    const [y,m] = viewMonth.split('-').map(Number);const nextMonth=new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);
    if(nextMonth>=today().slice(0,7)) {viewMonth=nextMonth;renderCalendar();}
  }
  document.querySelector('#month-prev').addEventListener('click', () => shiftMonth(-1));
  document.querySelector('#month-next').addEventListener('click', () => shiftMonth(1));
  daysRoot.addEventListener('keydown', event => {
    const date=event.target.dataset.date;const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
    if(!date || delta===undefined)return;event.preventDefault();const d=dateObject(date);d.setUTCDate(d.getUTCDate()+delta);const target=d.toISOString().slice(0,10);
    if(target<today())return;viewMonth=target.slice(0,7);renderCalendar(target);
  });
  function slotButton(date,time,preview=false) {
    const button=document.createElement('button');button.type='button';button.dataset.time=time;
    button.disabled=!available(date,time);button.setAttribute('aria-pressed',String(!preview&&selectedTime===time));
    const state=isPast(date,time)?'прошло':isBooked(date,time)?'занято':'свободно';
    button.setAttribute('aria-label',`${time}–${endTime(time)}, ${state}`);button.title=state;
    button.textContent=time;
    const small=document.createElement('small');small.textContent=preview?(button.disabled?'закрыто':'свободно'):`до ${endTime(time)}`;button.append(small);
    button.addEventListener('click', () => {
      if(preview){document.querySelector('#event-log').textContent=`${time}–${endTime(time)} свободен по данным сервера.`;return;}
      if(!available(date,time)){renderSlots();return;}
      selectedTime=time;setStep(3);document.querySelector('#demo-name').focus({preventScroll:true});
    });
    return button;
  }
  async function renderSlots() {
    if(!selectedDate)return;
    const date=selectedDate;const intro=document.querySelector('#demo-step-2 .step-intro');
    if(!availability.has(date)){slotsRoot.replaceChildren();intro.textContent='Загружаем свободные часы…';}
    try{await loadAvailability(date);}catch{if(date===selectedDate){slotsRoot.replaceChildren();intro.textContent='Не удалось получить доступность. Проверь соединение, повторная попытка через 3 секунды.';}return;}
    if(date!==selectedDate)return;
    slotsRoot.replaceChildren(...hours.map(time => slotButton(date,time)));
    document.querySelector('#chosen-date').textContent=dateLabel(selectedDate,{day:'numeric',month:'long'});
    intro.textContent=hours.some(time=>available(selectedDate,time))?'Каждая кнопка — визит длительностью 1 час. Серые слоты недоступны.':'На этот день свободных слотов нет. Выбери другую дату.';
  }
  document.querySelector('#change-date').addEventListener('click', () => {setStep(1);renderCalendar();});
  document.querySelector('#change-time').addEventListener('click', () => {renderSlots();setStep(2);});
  document.querySelector('#another-booking').addEventListener('click', () => {requestKey=crypto.randomUUID();lastPayload='';selectedDate='';selectedTime='';setStep(1);renderCalendar();});
  async function updateBackend() {
    const date=lastBooking?.date || selectedDate || tomorrow();
    try{await loadAvailability(date);}catch{return;}
    document.querySelector('#visitor-date').textContent=`${dateLabel(date)} · Баку`;
    document.querySelector('#visitor-slots').replaceChildren(...hours.map(time=>slotButton(date,time,true)));
    document.querySelector('#notification-idle').hidden=Boolean(lastBooking);
    document.querySelector('#notification-content').hidden=!lastBooking;
    if(lastBooking) {
      document.querySelector('#notify-name').textContent=lastBooking.name;
      document.querySelector('#notify-date').textContent=dateLabel(lastBooking.date);
      document.querySelector('#notify-time').textContent=`${lastBooking.time} – ${endTime(lastBooking.time)}`;
      document.querySelector('#notify-phone').textContent=lastBooking.phone;
      document.querySelector('#event-log').textContent=`Запись: ${lastBooking.time}–${endTime(lastBooking.time)} занят. Другие посетители больше не могут выбрать этот час.`;
    }
  }
  async function animatePipeline() {
    const token=++animationId;document.querySelectorAll('.pipeline-node').forEach(node=>node.classList.remove('done'));
    const delay=matchMedia('(prefers-reduced-motion:reduce)').matches?0:260;
    for(let i=1;i<=4;i++) {await new Promise(resolve=>setTimeout(resolve,delay));if(token!==animationId)return;document.querySelector(`#pipe-${i}`).classList.add('done');}
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();const error=document.querySelector('#form-error');error.textContent='';
    const name=document.querySelector('#demo-name').value.trim();const phone=document.querySelector('#demo-phone').value.trim();
    const digits=phone.replace(/\D/g,'');if(name.length<2||digits.length<7||digits.length>15){error.textContent='Проверь имя и телефон.';return;}
    const payload={name,phone,date:selectedDate,time:selectedTime,serviceId:document.querySelector('#demo-service').value};
    if(lastPayload!==JSON.stringify(payload)){requestKey=crypto.randomUUID();lastPayload=JSON.stringify(payload);}
    const button=form.querySelector('[type=submit]');button.disabled=true;
    try {
      const result=await api('/api/bookings',{method:'POST',body:JSON.stringify({...payload,requestKey})});
      lastBooking={...payload,id:result.id,service:document.querySelector('#demo-service').selectedOptions[0].textContent};
      availability.delete(payload.date);await updateBackend();
      document.querySelector('#confirmation-detail').textContent=`${dateLabel(result.date)}\n${result.time}–${endTime(result.time)} · Баку\n${lastBooking.service}\n№ ${result.id}`;
      setStep(4);animatePipeline();
    } catch(e) {
      if(e.status===409){availability.delete(selectedDate);setStep(2);await renderSlots();document.querySelector('#demo-step-2 .step-intro').textContent=e.message;}
      else error.textContent=e.message||'Не удалось отправить заявку. Повтори запрос: повторная отправка не создаст дубликат.';
    } finally {button.disabled=false;}
  });
  document.querySelector('.auto-actions').hidden=true;
  async function initialize(){
    try{const meta=await api('/api/meta');serverOffset=meta.serverTime-Date.now();hours=meta.hours;
      const select=document.querySelector('#demo-service');select.replaceChildren(...meta.services.map(s=>new Option(`${s.name} · ${s.price} AZN`,s.id)));
      document.querySelector('#demo-form [type=submit]').disabled=false;
      viewMonth=today().slice(0,7);renderCalendar();updateBackend();
    }catch{document.querySelector('#form-error').textContent='Сервер недоступен. Обнови страницу позже.';}
  }
  document.querySelector('#demo-form [type=submit]').disabled=true;
  setInterval(()=>{if(!document.hidden){if(journeyStep===2)renderSlots();updateBackend();}},3000);
  addEventListener('focus', () => {if(journeyStep===2)renderSlots();updateBackend();});
  readHash();renderCalendar();setStep(1);initialize();
})();

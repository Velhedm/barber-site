'use strict';
// Availability is maintained by the barber; a WhatsApp request does not reserve a slot.
window.BookingCalendar = class {
  constructor({dateInput, timeInput, busySlots, onChange}) {
    this.dateInput = dateInput;
    this.timeInput = timeInput;
    this.busySlots = busySlots;
    this.onChange = onChange;
    this.lang = 'ru';
    this.view = this.today().slice(0,7);
    this.root = document.querySelector('#date-calendar');
    this.slots = document.querySelector('#time-slots');
    this.message = document.querySelector('#slot-message');
    this.title = document.querySelector('#calendar-month');
    this.days = document.querySelector('#calendar-days');
    this.weekdays = document.querySelector('#calendar-weekdays');
    this.previous = document.querySelector('#calendar-prev');
    this.next = document.querySelector('#calendar-next');
    this.previous.addEventListener('click', () => this.changeMonth(-1));
    this.next.addEventListener('click', () => this.changeMonth(1));
    this.days.addEventListener('keydown', event => this.navigate(event));
    this.refresh = this.refresh.bind(this);
    window.addEventListener('focus', this.refresh);
    document.addEventListener('visibilitychange', () => {if (!document.hidden) this.refresh();});
    setInterval(() => {if (!document.hidden) this.refresh();}, 30000);
    this.render();
  }
  text(key) {
    return {
      ru: {previous:'Предыдущий месяц',next:'Следующий месяц',choose:'Сначала выбери дату в календаре.',available:'Выбери свободный час. Время Баку · UTC+4.',none:'На эту дату свободных часов нет. Выбери другой день.',busy:'Занято',past:'Время прошло',free:'Доступно',pickDate:'Выбери дату в календаре.',pickTime:'Выбери доступный часовой слот.',calendar:'Календарь записи',legend:'Серые часы — заняты или уже прошли.',selected:'Выбрано'},
      az: {previous:'Əvvəlki ay',next:'Növbəti ay',choose:'Əvvəlcə təqvimdən tarix seç.',available:'Boş saat seç. Bakı vaxtı · UTC+4.',none:'Bu tarixdə boş saat yoxdur. Başqa gün seç.',busy:'Məşğuldur',past:'Vaxt keçib',free:'Boşdur',pickDate:'Təqvimdən tarix seç.',pickTime:'Boş saat seç.',calendar:'Rezervasiya təqvimi',legend:'Boz saatlar məşğuldur və ya artıq keçib.',selected:'Seçilib'},
      en: {previous:'Previous month',next:'Next month',choose:'Choose a date in the calendar first.',available:'Choose an available hour. Baku time · UTC+4.',none:'No hours available on this date. Choose another day.',busy:'Booked',past:'Past time',free:'Available',pickDate:'Choose a date in the calendar.',pickTime:'Choose an available hourly slot.',calendar:'Appointment calendar',legend:'Grey hours are booked or in the past.',selected:'Selected'}
    }[this.lang][key];
  }
  today() {
    const parts = new Intl.DateTimeFormat('en',{timeZone:'Asia/Baku',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const part = type => parts.find(p => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  dateObject(date) { return new Date(`${date}T12:00:00+04:00`); }
  formatDate(date, options) {
    return new Intl.DateTimeFormat(this.lang,{timeZone:'Asia/Baku',...options}).format(this.dateObject(date));
  }
  slotState(date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(0\d|1\d|2[0-3]):00$/.test(time)) return 'past';
    const timestamp = Date.parse(`${date}T${time}:00+04:00`);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now() || this.dateObject(date).toISOString().slice(0,10) !== date) return 'past';
    if ((this.busySlots[date] || []).includes(time)) return 'busy';
    return 'free';
  }
  setLanguage(lang) {this.lang = lang;this.render();}
  changeMonth(step) {
    const [year,month] = this.view.split('-').map(Number);
    const next = new Date(Date.UTC(year,month-1+step,1)).toISOString().slice(0,7);
    if (next < this.today().slice(0,7) || next > '9999-12') return;
    this.view = next;
    this.renderDays();
  }
  selectDate(date) {
    if (date < this.today()) return;
    const changed = date !== this.dateInput.value;
    this.dateInput.value = date;
    if (changed) this.timeInput.value = '';
    this.render();
    this.onChange();
  }
  renderDays() {
    const focusedDate = this.days.contains(document.activeElement) ? document.activeElement.dataset.date : null;
    const [year,month] = this.view.split('-').map(Number);
    const first = new Date(Date.UTC(year,month-1,1));
    const count = new Date(Date.UTC(year,month,0)).getUTCDate();
    this.title.textContent = this.formatDate(`${this.view}-01`,{month:'long',year:'numeric'});
    this.previous.disabled = this.view <= this.today().slice(0,7);
    this.next.disabled = this.view === '9999-12';
    this.days.replaceChildren();
    const offset = (first.getUTCDay()+6)%7;
    for (let i=0;i<offset;i++) {const blank=document.createElement('span');blank.setAttribute('aria-hidden','true');this.days.append(blank);}
    for (let day=1;day<=count;day++) {
      const date = `${this.view}-${String(day).padStart(2,'0')}`;
      const button = document.createElement('button');button.type='button';button.textContent=day;button.dataset.date=date;
      button.disabled = date < this.today();
      button.setAttribute('aria-label',this.formatDate(date,{weekday:'long',day:'numeric',month:'long',year:'numeric'}));
      button.setAttribute('aria-pressed',String(date===this.dateInput.value));
      if (date===this.today()) button.setAttribute('aria-current','date');
      button.addEventListener('click',()=>{this.selectDate(date);this.days.querySelector(`[data-date="${date}"]`).focus();});
      this.days.append(button);
    }
    if(focusedDate){const button=this.days.querySelector(`[data-date="${focusedDate}"]`);if(button&&!button.disabled)button.focus();}
  }
  renderSlots() {
    const previousFocus = this.slots.contains(document.activeElement) ? document.activeElement.dataset.time : null;
    this.slots.replaceChildren();
    const date = this.dateInput.value;
    document.querySelector('#slot-date').textContent = date ? this.formatDate(date,{day:'numeric',month:'long',year:'numeric'}) : '';
    if (!date) {this.message.textContent=this.text('choose');return;}
    let available = 0;
    for (let hour=0;hour<24;hour++) {
      const time = `${String(hour).padStart(2,'0')}:00`;
      const state = this.slotState(date,time);
      const button=document.createElement('button');button.type='button';button.textContent=time;button.dataset.time=time;button.dataset.state=state;
      button.disabled=state!=='free';
      if (!button.disabled) available++;
      if (this.timeInput.value===time && button.disabled) this.timeInput.value='';
      button.setAttribute('aria-pressed',String(this.timeInput.value===time));
      button.setAttribute('aria-label',`${time} · ${this.text(state)}`);
      button.title=this.text(state);
      button.addEventListener('click',()=>{
        if(this.slotState(date,time)!=='free'){this.refresh();return;}
        this.timeInput.value=time;this.renderSlots();this.slots.querySelector(`[data-time="${time}"]`).focus();this.onChange();
      });
      this.slots.append(button);
    }
    this.message.textContent=this.text(available?'available':'none');
    if(previousFocus){const button=this.slots.querySelector(`[data-time="${previousFocus}"]`);if(button&&!button.disabled)button.focus();}
  }
  render() {
    this.root.setAttribute('aria-label',this.text('calendar'));
    this.previous.setAttribute('aria-label',this.text('previous'));this.next.setAttribute('aria-label',this.text('next'));
    this.weekdays.replaceChildren();
    // 2024-01-01 was a Monday; use fixed dates to keep the week independent of the host timezone.
    for(let day=1;day<=7;day++){const label=document.createElement('span');label.textContent=this.formatDate(`2024-01-0${day}`,{weekday:'short'});this.weekdays.append(label);}
    document.querySelector('#slot-legend').textContent=this.text('legend');
    this.renderDays();this.renderSlots();
  }
  refresh() {
    const oldTime=this.timeInput.value;
    if(this.view<this.today().slice(0,7))this.view=this.today().slice(0,7);
    this.render();
    if(oldTime!==this.timeInput.value)this.onChange();
  }
  validate() {
    if(!this.dateInput.value || this.dateInput.value<this.today()){
      this.days.querySelector('button:not(:disabled)')?.focus();return this.text('pickDate');
    }
    if(this.slotState(this.dateInput.value,this.timeInput.value)!=='free'){
      this.timeInput.value='';this.renderSlots();this.onChange();
      (this.slots.querySelector('button:not(:disabled)')||this.days.querySelector('button:not(:disabled)'))?.focus();return this.text('pickTime');
    }
    return '';
  }
  navigate(event) {
    const date=event.target.dataset.date;if(!date)return;
    const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
    if(delta!==undefined){
      event.preventDefault();const next=this.dateObject(date);next.setUTCDate(next.getUTCDate()+delta);
      const target=next.toISOString().slice(0,10);if(target<this.today())return;
      this.view=target.slice(0,7);this.renderDays();this.days.querySelector(`[data-date="${target}"]`)?.focus();
    }
  }
};

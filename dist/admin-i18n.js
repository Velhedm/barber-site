'use strict';
// The first localization stage covers the login and navigation shell only.
// Detailed views still require explicit translations before release.
(()=>{
 const catalog={
  heading:{ru:'Панель владельца',az:'İdarəetmə paneli',en:'Management dashboard'},
  subtitle:{ru:'Записи и расписание · Баку, UTC+4',az:'Rezervasiyalar və cədvəl · Bakı, UTC+4',en:'Bookings and schedule · Baku, UTC+4'},
  loginTitle:{ru:'Вход в панель',az:'Panelə giriş',en:'Sign in'},
  loginCaption:{ru:'Записи, расписание и уведомления в одном месте.',az:'Rezervasiyalar, cədvəl və bildirişlər bir yerdə.',en:'Bookings, schedules and notifications in one place.'},
  login:{ru:'Логин',az:'İstifadəçi adı',en:'Username'},password:{ru:'Пароль',az:'Şifrə',en:'Password'},submit:{ru:'Войти',az:'Daxil ol',en:'Sign in'},
  home:{ru:'Главная',az:'Əsas səhifə',en:'Home'},calendar:{ru:'Календарь',az:'Təqvim',en:'Calendar'},clients:{ru:'Клиенты',az:'Müştərilər',en:'Clients'},bookings:{ru:'Все записи',az:'Bütün rezervasiyalar',en:'All bookings'},schedule:{ru:'Расписание',az:'İş cədvəli',en:'Schedule'},services:{ru:'Услуги',az:'Xidmətlər',en:'Services'},revenue:{ru:'Доход',az:'Gəlir',en:'Revenue'},masters:{ru:'Мастера',az:'Ustalar',en:'Barbers'},rooms:{ru:'Комнаты',az:'Otaqlar',en:'Rooms'},settings:{ru:'Настройки',az:'Ayarlar',en:'Settings'},
  'Новая запись':{ru:'Новая запись',az:'Yeni rezervasiya',en:'New booking'},'Изменить запись':{ru:'Изменить запись',az:'Rezervasiyanı dəyiş',en:'Edit booking'},'Имя клиента':{ru:'Имя клиента',az:'Müştərinin adı',en:'Client name'},'Телефон':{ru:'Телефон',az:'Telefon',en:'Phone'},'Категория':{ru:'Категория',az:'Kateqoriya',en:'Category'},'Дата':{ru:'Дата',az:'Tarix',en:'Date'},'Мастер':{ru:'Мастер',az:'Usta',en:'Barber'},'Время':{ru:'Время',az:'Saat',en:'Time'},'Услуги':{ru:'Услуги',az:'Xidmətlər',en:'Services'},'Закрыть':{ru:'Закрыть',az:'Bağla',en:'Close'},'Создать запись':{ru:'Создать запись',az:'Rezervasiya yarat',en:'Create booking'},'Сохранить изменения':{ru:'Сохранить изменения',az:'Dəyişiklikləri saxla',en:'Save changes'},'Проверить свободное время':{ru:'Проверить свободное время',az:'Boş vaxtları yoxla',en:'Check available times'},'Выберите услуги, мастера и дату, затем проверьте свободное время.':{ru:'Выберите услуги, мастера и дату, затем проверьте свободное время.',az:'Xidmətləri, ustanı və tarixi seçin, sonra boş vaxtları yoxlayın.',en:'Choose services, a barber and a date, then check availability.'}
 };
 Object.assign(catalog,{
  'Сохранить':{ru:'Сохранить',az:'Saxla',en:'Save'},'Повторить безопасно':{ru:'Повторить безопасно',az:'Təhlükəsiz təkrar et',en:'Retry safely'},
  'Выберите мастера':{ru:'Выберите мастера',az:'Usta seçin',en:'Choose a barber'},'только ресепшен':{ru:'только ресепшен',az:'yalnız resepsiyon',en:'reception only'},
  'Проверьте свободное время':{ru:'Проверьте свободное время',az:'Boş vaxtları yoxlayın',en:'Check available times'},'Выберите время':{ru:'Выберите время',az:'Saat seçin',en:'Choose a time'},'недоступно':{ru:'недоступно',az:'mövcud deyil',en:'unavailable'},'мин':{ru:'мин',az:'dəq',en:'min'},
  'Условия изменены. Проверьте свободное время.':{ru:'Условия изменены. Проверьте свободное время.',az:'Seçim dəyişdi. Boş vaxtları yenidən yoxlayın.',en:'The selection changed. Check availability again.'},
  'Выберите услуги, мастера и дату.':{ru:'Выберите услуги, мастера и дату.',az:'Xidmətləri, ustanı və tarixi seçin.',en:'Choose services, a barber and a date.'},
  'Это время занято. Выберите другое.':{ru:'Это время занято. Выберите другое.',az:'Bu vaxt məşğuldur. Başqa vaxt seçin.',en:'This time is unavailable. Choose another.'},
  'Цена или длительность изменились. Проверьте свободное время ещё раз.':{ru:'Цена или длительность изменились. Проверьте свободное время ещё раз.',az:'Qiymət və ya müddət dəyişdi. Boş vaxtları yenidən yoxlayın.',en:'The price or duration changed. Check availability again.'},
  'Ответ сервера не получен. Повторите тот же запрос: дубликат не создастся.':{ru:'Ответ сервера не получен. Повторите тот же запрос: дубликат не создастся.',az:'Serverdən cavab alınmadı. Sorğunu təkrar edin: ikinci rezervasiya yaradılmayacaq.',en:'No response received. Retry the same request; it will not create a duplicate.'},
  'Запись уже изменена. Закройте окно и откройте свежую запись.':{ru:'Запись уже изменена. Закройте окно и откройте свежую запись.',az:'Rezervasiya artıq dəyişib. Pəncərəni bağlayıb yenidən açın.',en:'This booking has changed. Close the window and reopen it.'},
  'Мастер не выполняет все выбранные услуги.':{ru:'Мастер не выполняет все выбранные услуги.',az:'Usta seçilmiş xidmətlərin hamısını göstərmir.',en:'The barber does not offer all selected services.'},
  'Мастер недоступен.':{ru:'Мастер недоступен.',az:'Usta mövcud deyil.',en:'The barber is unavailable.'},'Услуга недоступна.':{ru:'Услуга недоступна.',az:'Xidmət mövcud deyil.',en:'The service is unavailable.'},'Проверьте введённые данные.':{ru:'Проверьте введённые данные.',az:'Daxil edilmiş məlumatları yoxlayın.',en:'Check the information entered.'},
  'Эту запись уже нельзя переносить.':{ru:'Эту запись уже нельзя переносить.',az:'Bu rezervasiyanı artıq dəyişmək mümkün deyil.',en:'This booking can no longer be rescheduled.'}
 });
 let language='ru';try{const saved=localStorage.getItem('ilkersevim.admin.language');if(['ru','az','en'].includes(saved))language=saved;}catch{}
 const $=s=>document.querySelector(s);
 const bindings=new Set();
 function makeSwitcher(){const root=document.createElement('div');root.className='admin-language-switch';root.setAttribute('role','group');root.setAttribute('aria-label','Language');for(const lang of ['ru','az','en']){const button=document.createElement('button');button.type='button';button.textContent=lang.toUpperCase();button.dataset.adminLanguage=lang;button.setAttribute('aria-pressed',String(lang===language));button.addEventListener('click',()=>setLanguage(lang));root.append(button);}return root;}
 const switcher=makeSwitcher();
 $('.header-tools').prepend(switcher);
 function replaceText(target,value){const node=typeof target==='string'?$(target):target;if(!node)return;const text=[...node.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.nodeValue.trim());if(text)text.nodeValue=value;else node.prepend(document.createTextNode(value));}
 function apply(){document.documentElement.lang=language;const t=key=>catalog[key][language];
  $('.admin-header h1').textContent=t('heading');$('.admin-header p').textContent=t('subtitle');$('#login h2').textContent=t('loginTitle');$('#login .login-caption').textContent=t('loginCaption');
  replaceText($('#login [name=login]').closest('label'),t('login'));replaceText($('#login [name=password]').closest('label'),t('password'));$('#login button').textContent=t('submit');
  for(const id of ['home','calendar','clients','bookings','schedule','services','revenue','masters','rooms','settings'])replaceText('#tab-'+id,t(id));
  for(const button of document.querySelectorAll('[data-admin-language]'))button.setAttribute('aria-pressed',String(button.dataset.adminLanguage===language));
  for(const binding of bindings){if(!binding.node.isConnected){bindings.delete(binding);continue;}binding.update();}
 }
 function setLanguage(value){if(!catalog.home[value])return;language=value;try{localStorage.setItem('ilkersevim.admin.language',value);}catch{}apply();document.dispatchEvent(new CustomEvent('adminlanguagechange',{detail:{language}}));}
 function bind(node,key,attribute){if(!catalog[key])return node;const update=()=>{const value=catalog[key][language];if(attribute)node.setAttribute(attribute,value);else replaceText(node,value);};bindings.add({node,update});update();return node;}
 window.IlkerAdminI18n={bind,makeSwitcher,t:key=>catalog[key]?.[language]??key,get language(){return language;}};
 apply();
})();

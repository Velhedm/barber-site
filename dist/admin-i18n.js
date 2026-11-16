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
  home:{ru:'Главная',az:'Əsas səhifə',en:'Home'},calendar:{ru:'Календарь',az:'Təqvim',en:'Calendar'},clients:{ru:'Клиенты',az:'Müştərilər',en:'Clients'},bookings:{ru:'Все записи',az:'Bütün rezervasiyalar',en:'All bookings'},schedule:{ru:'Расписание',az:'İş cədvəli',en:'Schedule'},services:{ru:'Услуги',az:'Xidmətlər',en:'Services'},revenue:{ru:'Доход',az:'Gəlir',en:'Revenue'},masters:{ru:'Мастера',az:'Ustalar',en:'Barbers'},rooms:{ru:'Комнаты',az:'Otaqlar',en:'Rooms'},settings:{ru:'Настройки',az:'Ayarlar',en:'Settings'}
 };
 let language='ru';try{const saved=localStorage.getItem('ilkersevim.admin.language');if(['ru','az','en'].includes(saved))language=saved;}catch{}
 const $=s=>document.querySelector(s);
 const switcher=document.createElement('div');switcher.className='admin-language-switch';switcher.setAttribute('role','group');switcher.setAttribute('aria-label','Language');
 for(const lang of ['ru','az','en']){const button=document.createElement('button');button.type='button';button.textContent=lang.toUpperCase();button.dataset.adminLanguage=lang;button.addEventListener('click',()=>setLanguage(lang));switcher.append(button);}
 $('.header-tools').prepend(switcher);
 function replaceText(target,value){const node=typeof target==='string'?$(target):target;if(!node)return;const text=[...node.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.nodeValue.trim());if(text)text.nodeValue=value;else node.prepend(document.createTextNode(value));}
 function apply(){document.documentElement.lang=language;const t=key=>catalog[key][language];
  $('.admin-header h1').textContent=t('heading');$('.admin-header p').textContent=t('subtitle');$('#login h2').textContent=t('loginTitle');$('#login .login-caption').textContent=t('loginCaption');
  replaceText($('#login [name=login]').closest('label'),t('login'));replaceText($('#login [name=password]').closest('label'),t('password'));$('#login button').textContent=t('submit');
  for(const id of ['home','calendar','clients','bookings','schedule','services','revenue','masters','rooms','settings'])replaceText('#tab-'+id,t(id));
  for(const button of switcher.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.adminLanguage===language));
 }
 function setLanguage(value){if(!catalog.home[value])return;language=value;try{localStorage.setItem('ilkersevim.admin.language',value);}catch{}apply();document.dispatchEvent(new CustomEvent('adminlanguagechange',{detail:{language}}));}
 apply();
})();

'use strict';
(() => {
 const dictionary = {
 "Ruslan True — Онлайн-запись к барберу": {
  "az": "Ruslan True — Onlayn rezervasiya",
  "en": "Ruslan True — Book your barber"
 },
 "Запишитесь к Руслану: мужские и детские стрижки, оформление бороды и уход. Выберите удобный день и свободное время онлайн.": {
  "az": "Ruslanın qəbuluna yazılın: kişi və uşaq saç kəsimi, saqqal formalaşdırılması və qulluq. Uyğun gün və saatı onlayn seçin.",
  "en": "Book with Ruslan: men’s and children’s haircuts, beard shaping and grooming. Choose your date and time online."
 },
 "Перейти к записи": {
  "az": "Rezervasiyaya keç",
  "en": "Skip to booking"
 },
 "Ruslan True — главная": {
  "az": "Ruslan True — ana səhifə",
  "en": "Ruslan True — home"
 },
 "BARBER · BAKU": {
  "az": "BARBER · BAKI",
  "en": "BARBER · BAKU"
 },
 "ТОЧНОСТЬ. СТИЛЬ. ХАРАКТЕР.": {
  "az": "DƏQİQLİK. ÜSLUB. XARAKTER.",
  "en": "PRECISION. STYLE. CHARACTER."
 },
 "Онлайн-запись": {
  "az": "Onlayn rezervasiya",
  "en": "Online booking"
 },
 "Твоё время.": {
  "az": "Sənin vaxtın.",
  "en": "Your time."
 },
 "Твой стиль.": {
  "az": "Sənin üslubun.",
  "en": "Your style."
 },
 "Стрижка, которая подходит тебе.": {
  "az": "Sənə yaraşan saç kəsimi.",
  "en": "A haircut that suits you."
 },
 "Выбери удобное время — Руслан позаботится об остальном.": {
  "az": "Uyğun vaxtı seç — qalanını Ruslana həvalə et.",
  "en": "Choose your time — Ruslan will take care of the rest."
 },
 "Записаться": {
  "az": "Rezervasiya et",
  "en": "Book now"
 },
 "Руслан": {
  "az": "Ruslan",
  "en": "Ruslan"
 },
 "Индивидуальный": {
  "az": "Fərdi",
  "en": "Personal"
 },
 "подход к деталям": {
  "az": "yanaşma və diqqət",
  "en": "attention to detail"
 },
 "Оформление бороды в барбершопе": {
  "az": "Barberdə saqqalın formalaşdırılması",
  "en": "Beard shaping at a barbershop"
 },
 "THE ART OF GROOMING": {
  "az": "QULLUQ SƏNƏTİ",
  "en": "THE ART OF GROOMING"
 },
 "БОЛЬШЕ, ЧЕМ СТРИЖКА.": {
  "az": "SADƏCƏ SAÇ KƏSİMİ DEYİL.",
  "en": "MORE THAN A HAIRCUT."
 },
 "Внимание": {
  "az": "Hər xəttə",
  "en": "Attention"
 },
 "к каждой линии.": {
  "az": "xüsusi diqqət.",
  "en": "to every line."
 },
 "ЗАПЛАНИРУЙ СВОЙ ВИЗИТ": {
  "az": "ZİYARƏTİNİ PLANLA",
  "en": "PLAN YOUR VISIT"
 },
 "Время для себя": {
  "az": "Özünə vaxt ayır",
  "en": "Time for yourself"
 },
 "Время по Баку": {
  "az": "Bakı vaxtı",
  "en": "Baku time"
 },
 "Баку": {
  "az": "Bakı",
  "en": "Baku"
 },
 "Попробовать снова ↻": {
  "az": "Yenidən cəhd et ↻",
  "en": "Try again ↻"
 },
 "Услуга": {
  "az": "Xidmət",
  "en": "Service"
 },
 "Выбери свой уход": {
  "az": "Özünə uyğun qulluğu seç",
  "en": "Choose your grooming"
 },
 "Услуга и стоимость": {
  "az": "Xidmət və qiymət",
  "en": "Service and price"
 },
 "Загружаем услуги…": {
  "az": "Xidmətlər yüklənir…",
  "en": "Loading services…"
 },
 "Дата и время": {
  "az": "Tarix və saat",
  "en": "Date and time"
 },
 "Предыдущий месяц": {
  "az": "Əvvəlki ay",
  "en": "Previous month"
 },
 "Следующий месяц": {
  "az": "Növbəti ay",
  "en": "Next month"
 },
 "Пн": {
  "az": "B.e.",
  "en": "Mon"
 },
 "Вт": {
  "az": "Ç.a.",
  "en": "Tue"
 },
 "Ср": {
  "az": "Ç.",
  "en": "Wed"
 },
 "Чт": {
  "az": "C.a.",
  "en": "Thu"
 },
 "Пт": {
  "az": "C.",
  "en": "Fri"
 },
 "Сб": {
  "az": "Ş.",
  "en": "Sat"
 },
 "Вс": {
  "az": "B.",
  "en": "Sun"
 },
 "Дата визита": {
  "az": "Ziyarət tarixi",
  "en": "Visit date"
 },
 "Выбери дату": {
  "az": "Tarixi seç",
  "en": "Choose a date"
 },
 "Визит · 1 час": {
  "az": "Ziyarət · 1 saat",
  "en": "Visit · 1 hour"
 },
 "Свободное время появится здесь.": {
  "az": "Boş saatlar burada göstəriləcək.",
  "en": "Available times will appear here."
 },
 "Свободное время": {
  "az": "Boş saatlar",
  "en": "Available times"
 },
 "Обновить время ↻": {
  "az": "Saatları yenilə ↻",
  "en": "Refresh times ↻"
 },
 "Свободно": {
  "az": "Boşdur",
  "en": "Available"
 },
 "Недоступно": {
  "az": "Mövcud deyil",
  "en": "Unavailable"
 },
 "Твои контакты": {
  "az": "Əlaqə məlumatların",
  "en": "Your details"
 },
 "Имя": {
  "az": "Ad",
  "en": "Name"
 },
 "Как к тебе обращаться?": {
  "az": "Sənə necə müraciət edək?",
  "en": "What’s your name?"
 },
 "Телефон": {
  "az": "Telefon",
  "en": "Phone"
 },
 "ТВОЙ ВИЗИТ": {
  "az": "SƏNİN ZİYARƏTİN",
  "en": "YOUR VISIT"
 },
 "Дата": {
  "az": "Tarix",
  "en": "Date"
 },
 "Не выбрана": {
  "az": "Seçilməyib",
  "en": "Not selected"
 },
 "Время": {
  "az": "Saat",
  "en": "Time"
 },
 "Не выбрано": {
  "az": "Seçilməyib",
  "en": "Not selected"
 },
 "Итого": {
  "az": "Cəmi",
  "en": "Total"
 },
 "Подтвердить запись": {
  "az": "Rezervasiyanı təsdiqlə",
  "en": "Confirm booking"
 },
 "Выбери дату и свободное время": {
  "az": "Tarixi və boş saatı seç",
  "en": "Choose a date and available time"
 },
 "Отправляя форму, ты соглашаешься передать Руслану свои контакты и детали записи для организации визита.": {
  "az": "Formanı göndərməklə ziyarətin təşkili üçün əlaqə və rezervasiya məlumatlarının Ruslana ötürülməsinə razılıq verirsən.",
  "en": "By submitting this form, you agree to share your contact and booking details with Ruslan to arrange your visit."
 },
 "ДО ВСТРЕЧИ У РУСЛАНА": {
  "az": "RUSLANIN YANINDA GÖRÜŞƏNƏDƏK",
  "en": "SEE YOU AT RUSLAN’S"
 },
 "Ты записан": {
  "az": "Rezervasiya təsdiqləndi",
  "en": "You’re booked"
 },
 "Время закреплено за тобой. Будем рады видеть!": {
  "az": "Seçdiyin vaxt sənin üçün ayrıldı. Səni görməyə şad olarıq!",
  "en": "Your time is reserved. We look forward to seeing you!"
 },
 "Время · Баку": {
  "az": "Saat · Bakı",
  "en": "Time · Baku"
 },
 "Стоимость": {
  "az": "Qiymət",
  "en": "Price"
 },
 "Связаться с Русланом": {
  "az": "Ruslanla əlaqə saxla",
  "en": "Contact Ruslan"
 },
 "Записаться ещё": {
  "az": "Yeni rezervasiya",
  "en": "Book another visit"
 },
 "Если планы изменятся, позвони Руслану.": {
  "az": "Planların dəyişərsə, Ruslana zəng et.",
  "en": "If your plans change, call Ruslan."
 },
 "Твой стиль начинается с деталей.": {
  "az": "Üslubun detallardan başlayır.",
  "en": "Your style starts with the details."
 },
 "Позвонить": {
  "az": "Zəng et",
  "en": "Call"
 },
 "Для онлайн-записи включи JavaScript или позвони:": {
  "az": "Onlayn rezervasiya üçün JavaScript-i aktiv et və ya zəng et:",
  "en": "Enable JavaScript to book online, or call:"
 },
 "Не удалось получить ответ. Проверь соединение и попробуй ещё раз.": {
  "az": "Cavab alınmadı. İnternet bağlantını yoxla və yenidən cəhd et.",
  "en": "Could not get a response. Check your connection and try again."
 },
 "Не удалось выполнить запрос.": {
  "az": "Sorğunu yerinə yetirmək mümkün olmadı. Yenidən cəhd et.",
  "en": "Could not complete the request. Please try again."
 },
 "Подтверждаем…": {
  "az": "Təsdiqlənir…",
  "en": "Confirming…"
 },
 "Проверить запись": {
  "az": "Rezervasiyanı yoxla",
  "en": "Check booking"
 },
 "Нажми, чтобы получить результат отправленной записи": {
  "az": "Göndərilmiş rezervasiyanın nəticəsini öyrənmək üçün bas",
  "en": "Press to check the result of your submitted booking"
 },
 "Нет соединения с интернетом": {
  "az": "İnternet bağlantısı yoxdur",
  "en": "No internet connection"
 },
 "Загружаем расписание…": {
  "az": "Cədvəl yüklənir…",
  "en": "Loading schedule…"
 },
 "Выбери дату визита": {
  "az": "Ziyarət tarixini seç",
  "en": "Choose your visit date"
 },
 "Выбери свободное время": {
  "az": "Boş saatı seç",
  "en": "Choose an available time"
 },
 "Время прошло": {
  "az": "Vaxt keçib",
  "en": "Time has passed"
 },
 "Занято": {
  "az": "Rezerv edilib",
  "en": "Booked"
 },
 "Ищем свободное время…": {
  "az": "Boş saatlar axtarılır…",
  "en": "Finding available times…"
 },
 "Выбранное время уже недоступно. Пожалуйста, выбери другой час.": {
  "az": "Seçilmiş saat artıq mövcud deyil. Başqa saat seç.",
  "en": "That time is no longer available. Please choose another hour."
 },
 "В этот день записи нет. Выбери другую дату.": {
  "az": "Bu gün rezervasiya qəbul edilmir. Başqa tarix seç.",
  "en": "Bookings are closed for this day. Choose another date."
 },
 "Выбери удобный час.": {
  "az": "Sənə uyğun saatı seç.",
  "en": "Choose a time that suits you."
 },
 "Свободного времени нет. Выбери другую дату.": {
  "az": "Boş saat yoxdur. Başqa tarix seç.",
  "en": "No times available. Choose another date."
 },
 "Не удалось обновить время. Попробуй ещё раз.": {
  "az": "Saatları yeniləmək mümkün olmadı. Yenidən cəhd et.",
  "en": "Could not refresh times. Please try again."
 },
 "Нет интернета. Проверь соединение.": {
  "az": "İnternet yoxdur. Bağlantını yoxla.",
  "en": "You’re offline. Check your connection."
 },
 "Не удалось загрузить расписание. Попробуй ещё раз или позвони Руслану: +994 51 351 39 55.": {
  "az": "Cədvəli yükləmək mümkün olmadı. Yenidən cəhd et və ya Ruslana zəng et: +994 51 351 39 55.",
  "en": "Could not load the schedule. Try again or call Ruslan: +994 51 351 39 55."
 },
 "Укажи имя — минимум 2 символа.": {
  "az": "Adını daxil et — ən azı 2 simvol.",
  "en": "Enter your name — at least 2 characters."
 },
 "Проверь номер телефона, например +994 51 351 39 55.": {
  "az": "Telefon nömrəsini yoxla, məsələn +994 51 351 39 55.",
  "en": "Check your phone number, for example +994 51 351 39 55."
 },
 "Выбери доступную дату и свободное время.": {
  "az": "Uyğun tarix və boş saat seç.",
  "en": "Choose an available date and time."
 },
 "Не удалось получить подтверждение. Нажми ещё раз с теми же данными — повторная отправка не создаст вторую запись.": {
  "az": "Təsdiq alınmadı. Eyni məlumatlarla yenidən bas — təkrar göndəriş ikinci rezervasiya yaratmayacaq.",
  "en": "Confirmation was not received. Retry with the same details — resending will not create a second booking."
 },
 "Номер записи: ": {
  "az": "Rezervasiya nömrəsi: ",
  "en": "Booking reference: "
 },
 "Мужская стрижка": {
  "az": "Kişi saç kəsimi",
  "en": "Men’s haircut"
 },
 "Детская стрижка": {
  "az": "Uşaq saç kəsimi",
  "en": "Children’s haircut"
 },
 "Коррекция бороды": {
  "az": "Saqqalın formalaşdırılması",
  "en": "Beard shaping"
 },
 "Стрижка + борода": {
  "az": "Saç kəsimi + saqqal",
  "en": "Haircut + beard"
 },
 "Пилинг кожи головы": {
  "az": "Baş dərisinin pilinqi",
  "en": "Scalp exfoliation"
 },
 "Укладка": {
  "az": "Saç düzümü",
  "en": "Hair styling"
 },
 "Мытьё до и после стрижки, укладка стайлингом.": {
  "az": "Kəsimdən əvvəl və sonra yuma, staylinq vasitələri ilə saç düzümü.",
  "en": "Wash before and after the haircut, finished with styling products."
 },
 "До 11 лет. Мытьё до и после стрижки, укладка стайлингом.": {
  "az": "11 yaşadək uşaqlar üçün. Kəsimdən əvvəl və sonra yuma, staylinq vasitələri ilə saç düzümü.",
  "en": "For children under 11. Wash before and after the haircut, finished with styling products."
 },
 "Мытьё бороды, кондиционер-бальзам.": {
  "az": "Saqqalın yuyulması, kondisioner-balzam.",
  "en": "Beard wash and conditioning balm."
 },
 "Мужская стрижка и оформление бороды.": {
  "az": "Kişi saç kəsimi və saqqalın formalaşdırılması.",
  "en": "Men’s haircut and beard shaping."
 },
 "Уход и очищение кожи головы.": {
  "az": "Baş dərisinə qulluq və təmizləmə.",
  "en": "Scalp care and cleansing."
 },
 "Мытьё головы и укладка стайлингом.": {
  "az": "Saçın yuyulması və staylinq vasitələri ilə düzümü.",
  "en": "Hair wash and styling."
 },
 "Слишком много запросов. Попробуй позже.": {
  "az": "Həddindən artıq sorğu göndərilib. Bir az sonra yenidən cəhd et.",
  "en": "Too many requests. Please try again later."
 },
 "Дата должна быть в пределах ближайшего года": {
  "az": "Tarix qarşıdakı bir il ərzində olmalıdır.",
  "en": "Choose a date within the next year."
 },
 "Проверь имя, телефон и услугу": {
  "az": "Adını, telefonunu və xidməti yoxla.",
  "en": "Check your name, phone number and service."
 },
 "Повторный запрос отличается от исходной записи": {
  "az": "Təkrar sorğu əvvəlki rezervasiyadan fərqlənir. Məlumatları yoxla.",
  "en": "The retry differs from the original booking. Check your details."
 },
 "Выбери будущий часовой слот": {
  "az": "Gələcək tarixdə boş saat seç.",
  "en": "Choose a future hourly slot."
 },
 "Этот слот уже занят. Выбери другой час.": {
  "az": "Bu saat artıq rezerv edilib. Başqa saat seç.",
  "en": "This slot is already booked. Choose another hour."
 },
 "Ошибка сервера. Повтори запрос с теми же данными.": {
  "az": "Server xətası. Eyni məlumatlarla yenidən cəhd et.",
  "en": "Server error. Please retry with the same details."
 },
 "Недопустимый источник запроса": {
  "az": "Sorğu qəbul edilmədi. Səhifəni yenilə və yenidən cəhd et.",
  "en": "The request was rejected. Refresh the page and try again."
 },
 "Некорректный JSON": {
  "az": "Məlumatlar göndərilmədi. Yenidən cəhd et.",
  "en": "Your details could not be sent. Please try again."
 },
 "Ожидается JSON": {
  "az": "Məlumatlar göndərilmədi. Yenidən cəhd et.",
  "en": "Your details could not be sent. Please try again."
 },
 "Language": {
  "az": "Dil",
  "en": "Language"
 },
 "Location": {
  "az": "ÜNVANIMIZ",
  "en": "OUR LOCATION"
 },
 "Find Us": {
  "az": "Bizi harada tapa bilərsiniz?",
  "en": "Find Us"
 },
 "22 Bunyad Sardarov Street, Baku, Azerbaijan": {
  "az": "Bünyad Sərdarov küçəsi 22, Bakı, Azərbaycan",
  "en": "22 Bunyad Sardarov Street, Baku, Azerbaijan"
 },
 "Open in Google Maps": {
  "az": "Google Maps-də aç",
  "en": "Open in Google Maps"
 },
 "Open in Apple Maps": {
  "az": "Apple Maps-də aç",
  "en": "Open in Apple Maps"
 },
 "Please fill in this field.": {
  "az": "Bu xananı doldur.",
  "en": "Please fill in this field."
 }
};
 let language='az';
 try {const saved=localStorage.getItem('ruslantrue.language');if(saved==='az'||saved==='en')language=saved;}catch{/* Language still works when storage is unavailable. */}
 const t=key=>dictionary[key]?.[language]??key;
 const aliases=new Map();for(const [key,values]of Object.entries(dictionary))for(const value of [key,values.az,values.en])aliases.set(value.trim(),key);
 const texts=[],attributes=[];
 const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement?.closest('script,style'))continue;const key=aliases.get(node.nodeValue.trim());if(key)texts.push({node,key,leading:node.nodeValue.match(/^\s*/)[0],trailing:node.nodeValue.match(/\s*$/)[0]});}
 for(const node of document.querySelectorAll('[aria-label],[placeholder],[alt],meta[name=description]'))for(const attr of ['aria-label','placeholder','alt','content']){const value=node.getAttribute(attr);const key=value&&aliases.get(value.trim());if(key)attributes.push({node,attr,key});}
 function apply(){document.documentElement.lang=language;for(const item of texts)item.node.nodeValue=item.leading+t(item.key)+item.trailing;for(const item of attributes)item.node.setAttribute(item.attr,t(item.key));for(const button of document.querySelectorAll('[data-language]'))button.setAttribute('aria-pressed',String(button.dataset.language===language));}
 function setLanguage(value){if(!['az','en'].includes(value)||value===language)return;language=value;try{localStorage.setItem('ruslantrue.language',language);}catch{}apply();document.dispatchEvent(new CustomEvent('languagechange'));}
 // Explicit month/day names also support browsers with incomplete Azerbaijani locale data.
 const months={az:['yanvar','fevral','mart','aprel','may','iyun','iyul','avqust','sentyabr','oktyabr','noyabr','dekabr'],en:['January','February','March','April','May','June','July','August','September','October','November','December']};
 const weekdays={az:['bazar','bazar ertəsi','çərşənbə axşamı','çərşənbə','cümə axşamı','cümə','şənbə'],en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']};
 const shortDays={az:['B.','B.e.','Ç.a.','Ç.','C.a.','C.','Ş.'],en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat']};
 function formatDate(date,options={day:'numeric',month:'long'}){
  const [year,month,day]=date.split('-').map(Number);const parts=[];
  if(options.day)parts.push(String(day));if(options.month)parts.push(months[language][month-1]);if(options.year)parts.push(String(year));
  const value=parts.join(' ');if(!options.weekday)return value;
  const index=new Date(Date.UTC(year,month-1,day)).getUTCDay();return (options.weekday==='short'?shortDays:weekdays)[language][index]+', '+value;
 }
 window.RTI18n={t,formatDate,get language(){return language;},known:key=>Object.hasOwn(dictionary,key)};
 document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.language)));
 apply();
})();

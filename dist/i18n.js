'use strict';
(() => {
 const dictionary = {
 "Отменить запись": {"ru":"Отменить запись","az":"Rezervasiyanı ləğv et","en":"Cancel booking"},
 "Сохраните ссылку: она позволит отменить запись до начала визита.": {"ru":"Сохраните ссылку: она позволит отменить запись до начала визита.","az":"Bu keçidi saxlayın: ziyarət başlamazdan əvvəl rezervasiyanı ləğv edə bilərsiniz.","en":"Save this link to cancel your booking before your visit."},
 "Quote changed": {"ru":"Цена или длительность услуги изменилась. Проверьте итог и выберите время ещё раз.","az":"Xidmətin qiyməti və ya müddəti dəyişib. Yekunu yoxlayın və vaxtı yenidən seçin.","en":"The price or duration changed. Review the total and select a time again."},
 "Мастер": {
  "ru": "Мастер",
  "az": "Usta",
  "en": "Barber"
 },
 "Выберите мастера": {
  "ru": "Выберите мастера",
  "az": "Usta seçin",
  "en": "Choose a barber"
 },
 "Нет доступных мастеров для этих услуг": {
  "ru": "Нет доступных мастеров для этих услуг",
  "az": "Bu xidmətlər üçün mövcud usta yoxdur",
  "en": "No available barbers for these services"
 },
 "Master unavailable": {
  "ru": "Мастер сейчас недоступен для записи.",
  "az": "Usta hazırda onlayn rezervasiya qəbul etmir",
  "en": "This barber is unavailable"
 },
 "Master cannot perform selected services": {
  "ru": "Выберите мастера, который выполняет все выбранные услуги.",
  "az": "Seçilən xidmətləri göstərən başqa usta seçin",
  "en": "Choose a barber who offers all selected services"
 },
 "Service unavailable": {
  "ru": "Услуга сейчас недоступна.",
  "az": "Xidmət hazırda mövcud deyil",
  "en": "This service is currently unavailable"
 },
 "Выбранный мастер": {
  "ru": "Выбранный мастер",
  "az": "Seçilmiş usta",
  "en": "Selected barber"
 }
,
 "İlker Sevim Barber Club — Онлайн-запись к барберу": {
  "az": "İlker Sevim Barber Club — Onlayn rezervasiya",
  "en": "İlker Sevim Barber Club — Book your barber",
  "ru": "İlker Sevim Barber Club — Онлайн-запись к барберу"
 },
 "Запишитесь к İlker Sevim: мужские и детские стрижки, оформление бороды и уход. Выберите удобный день и свободное время онлайн.": {
  "az": "İlker Sevim-in qəbuluna yazılın: kişi və uşaq saç kəsimi, saqqal formalaşdırılması və qulluq. Uyğun gün və saatı onlayn seçin.",
  "en": "Book with İlker Sevim: men’s and children’s haircuts, beard shaping and grooming. Choose your date and time online.",
  "ru": "Запишитесь к İlker Sevim: мужские и детские стрижки, оформление бороды и уход. Выберите удобный день и свободное время онлайн."
 },
 "Перейти к записи": {
  "az": "Rezervasiyaya keç",
  "en": "Skip to booking",
  "ru": "Перейти к записи"
 },
 "İlker Sevim Barber Club — главная": {
  "az": "İlker Sevim Barber Club — ana səhifə",
  "en": "İlker Sevim Barber Club — home",
  "ru": "İlker Sevim Barber Club — главная"
 },
 "BARBER · BAKU": {
  "az": "BARBER · BAKI",
  "en": "BARBER · BAKU",
  "ru": "БАРБЕР · БАКУ"
 },
 "ТОЧНОСТЬ. СТИЛЬ. ХАРАКТЕР.": {
  "az": "DƏQİQLİK. ÜSLUB. XARAKTER.",
  "en": "PRECISION. STYLE. CHARACTER.",
  "ru": "ТОЧНОСТЬ. СТИЛЬ. ХАРАКТЕР."
 },
 "Онлайн-запись": {
  "az": "Onlayn rezervasiya",
  "en": "Online booking",
  "ru": "Онлайн-запись"
 },
 "Твоё время.": {
  "az": "Sənin vaxtın.",
  "en": "Your time.",
  "ru": "Твоё время."
 },
 "Твой стиль.": {
  "az": "Sənin üslubun.",
  "en": "Your style.",
  "ru": "Твой стиль."
 },
 "Стрижка, которая подходит тебе.": {
  "az": "Sənə yaraşan saç kəsimi.",
  "en": "A haircut that suits you.",
  "ru": "Стрижка, которая подходит тебе."
 },
 "Выбери удобное время — İlker Sevim позаботится об остальном.": {
  "az": "Uyğun vaxtı seç — qalanını İlker Sevim-ə həvalə et.",
  "en": "Choose your time — İlker Sevim will take care of the rest.",
  "ru": "Выбери удобное время — İlker Sevim позаботится об остальном."
 },
 "Записаться": {
  "az": "Rezervasiya et",
  "en": "Book now",
  "ru": "Записаться"
 },
 "İlker Sevim": {
  "az": "İlker Sevim",
  "en": "İlker Sevim",
  "ru": "İlker Sevim"
 },
 "Индивидуальный": {
  "az": "Fərdi",
  "en": "Personal",
  "ru": "Индивидуальный"
 },
 "подход к деталям": {
  "az": "yanaşma və diqqət",
  "en": "attention to detail",
  "ru": "подход к деталям"
 },
 "Оформление бороды в барбершопе": {
  "az": "Barberdə saqqalın formalaşdırılması",
  "en": "Beard shaping at a barbershop",
  "ru": "Оформление бороды в барбершопе"
 },
 "THE ART OF GROOMING": {
  "az": "QULLUQ SƏNƏTİ",
  "en": "THE ART OF GROOMING",
  "ru": "ИСКУССТВО УХОДА"
 },
 "БОЛЬШЕ, ЧЕМ СТРИЖКА.": {
  "az": "SADƏCƏ SAÇ KƏSİMİ DEYİL.",
  "en": "MORE THAN A HAIRCUT.",
  "ru": "БОЛЬШЕ, ЧЕМ СТРИЖКА."
 },
 "Внимание": {
  "az": "Hər xəttə",
  "en": "Attention",
  "ru": "Внимание"
 },
 "к каждой линии.": {
  "az": "xüsusi diqqət.",
  "en": "to every line.",
  "ru": "к каждой линии."
 },
 "ЗАПЛАНИРУЙ СВОЙ ВИЗИТ": {
  "az": "ZİYARƏTİNİ PLANLA",
  "en": "PLAN YOUR VISIT",
  "ru": "ЗАПЛАНИРУЙ СВОЙ ВИЗИТ"
 },
 "Время для себя": {
  "az": "Özünə vaxt ayır",
  "en": "Time for yourself",
  "ru": "Время для себя"
 },
 "Время по Баку": {
  "az": "Bakı vaxtı",
  "en": "Baku time",
  "ru": "Время по Баку"
 },
 "Баку": {
  "az": "Bakı",
  "en": "Baku",
  "ru": "Баку"
 },
 "Попробовать снова ↻": {
  "az": "Yenidən cəhd et ↻",
  "en": "Try again ↻",
  "ru": "Попробовать снова ↻"
 },
 "Услуга": {
  "az": "Xidmət",
  "en": "Service",
  "ru": "Услуга"
 },
 "Выбери свой уход": {
  "az": "Özünə uyğun qulluğu seç",
  "en": "Choose your grooming",
  "ru": "Выбери свой уход"
 },
 "Услуга и стоимость": {
  "az": "Xidmət və qiymət",
  "en": "Service and price",
  "ru": "Услуга и стоимость"
 },
 "Загружаем услуги…": {
  "az": "Xidmətlər yüklənir…",
  "en": "Loading services…",
  "ru": "Загружаем услуги…"
 },
 "Дата и время": {
  "az": "Tarix və saat",
  "en": "Date and time",
  "ru": "Дата и время"
 },
 "Предыдущий месяц": {
  "az": "Əvvəlki ay",
  "en": "Previous month",
  "ru": "Предыдущий месяц"
 },
 "Следующий месяц": {
  "az": "Növbəti ay",
  "en": "Next month",
  "ru": "Следующий месяц"
 },
 "Пн": {
  "az": "B.e.",
  "en": "Mon",
  "ru": "Пн"
 },
 "Вт": {
  "az": "Ç.a.",
  "en": "Tue",
  "ru": "Вт"
 },
 "Ср": {
  "az": "Ç.",
  "en": "Wed",
  "ru": "Ср"
 },
 "Чт": {
  "az": "C.a.",
  "en": "Thu",
  "ru": "Чт"
 },
 "Пт": {
  "az": "C.",
  "en": "Fri",
  "ru": "Пт"
 },
 "Сб": {
  "az": "Ş.",
  "en": "Sat",
  "ru": "Сб"
 },
 "Вс": {
  "az": "B.",
  "en": "Sun",
  "ru": "Вс"
 },
 "Дата визита": {
  "az": "Ziyarət tarixi",
  "en": "Visit date",
  "ru": "Дата визита"
 },
 "Выбери дату": {
  "az": "Tarixi seç",
  "en": "Choose a date",
  "ru": "Выбери дату"
 },
 "Свободное время появится здесь.": {
  "az": "Boş saatlar burada göstəriləcək.",
  "en": "Available times will appear here.",
  "ru": "Свободное время появится здесь."
 },
 "Свободное время": {
  "az": "Boş saatlar",
  "en": "Available times",
  "ru": "Свободное время"
 },
 "Обновить время ↻": {
  "az": "Saatları yenilə ↻",
  "en": "Refresh times ↻",
  "ru": "Обновить время ↻"
 },
 "Свободно": {
  "az": "Boşdur",
  "en": "Available",
  "ru": "Свободно"
 },
 "Недоступно": {
  "az": "Mövcud deyil",
  "en": "Unavailable",
  "ru": "Недоступно"
 },
 "Твои контакты": {
  "az": "Əlaqə məlumatların",
  "en": "Your details",
  "ru": "Твои контакты"
 },
 "Имя": {
  "az": "Ad",
  "en": "Name",
  "ru": "Имя"
 },
 "Как к тебе обращаться?": {
  "az": "Sənə necə müraciət edək?",
  "en": "What’s your name?",
  "ru": "Как к тебе обращаться?"
 },
 "Телефон": {
  "az": "Telefon",
  "en": "Phone",
  "ru": "Телефон"
 },
 "ТВОЙ ВИЗИТ": {
  "az": "SƏNİN ZİYARƏTİN",
  "en": "YOUR VISIT",
  "ru": "ТВОЙ ВИЗИТ"
 },
 "Дата": {
  "az": "Tarix",
  "en": "Date",
  "ru": "Дата"
 },
 "Не выбрана": {
  "az": "Seçilməyib",
  "en": "Not selected",
  "ru": "Не выбрана"
 },
 "Время": {
  "az": "Saat",
  "en": "Time",
  "ru": "Время"
 },
 "Не выбрано": {
  "az": "Seçilməyib",
  "en": "Not selected",
  "ru": "Не выбрано"
 },
 "Итого": {
  "az": "Cəmi",
  "en": "Total",
  "ru": "Итого"
 },
 "Подтвердить запись": {
  "az": "Rezervasiyanı təsdiqlə",
  "en": "Confirm booking",
  "ru": "Подтвердить запись"
 },
 "Выбери дату и свободное время": {
  "az": "Tarixi və boş saatı seç",
  "en": "Choose a date and available time",
  "ru": "Выбери дату и свободное время"
 },
 "Отправляя форму, ты соглашаешься передать İlker Sevim свои контакты и детали записи для организации визита.": {
  "az": "Formanı göndərməklə ziyarətin təşkili üçün əlaqə və rezervasiya məlumatlarının İlker Sevim-ə ötürülməsinə razılıq verirsən.",
  "en": "By submitting this form, you agree to share your contact and booking details with İlker Sevim to arrange your visit.",
  "ru": "Отправляя форму, ты соглашаешься передать İlker Sevim свои контакты и детали записи для организации визита."
 },
 "ДО ВСТРЕЧИ В İLKER SEVİM": {
  "az": "İLKER SEVİM-DƏ GÖRÜŞƏNƏDƏK",
  "en": "SEE YOU AT İLKER SEVİM",
  "ru": "ДО ВСТРЕЧИ В İLKER SEVİM"
 },
 "Ты записан": {
  "az": "Rezervasiya təsdiqləndi",
  "en": "You’re booked",
  "ru": "Ты записан"
 },
 "Время закреплено за тобой. Будем рады видеть!": {
  "az": "Seçdiyin vaxt sənin üçün ayrıldı. Səni görməyə şad olarıq!",
  "en": "Your time is reserved. We look forward to seeing you!",
  "ru": "Время закреплено за тобой. Будем рады видеть!"
 },
 "Время · Баку": {
  "az": "Saat · Bakı",
  "en": "Time · Baku",
  "ru": "Время · Баку"
 },
 "Стоимость": {
  "az": "Qiymət",
  "en": "Price",
  "ru": "Стоимость"
 },
 "Связаться с командой İlker Sevim": {
  "az": "İlker Sevim ilə əlaqə saxla",
  "en": "Contact İlker Sevim",
  "ru": "Связаться с командой İlker Sevim"
 },
 "Записаться ещё": {
  "az": "Yeni rezervasiya",
  "en": "Book another visit",
  "ru": "Записаться ещё"
 },
 "Если планы изменятся, позвони İlker Sevim.": {
  "az": "Planların dəyişərsə, İlker Sevim-ə zəng et.",
  "en": "If your plans change, call İlker Sevim.",
  "ru": "Если планы изменятся, позвони İlker Sevim."
 },
 "Твой стиль начинается с деталей.": {
  "az": "Üslubun detallardan başlayır.",
  "en": "Your style starts with the details.",
  "ru": "Твой стиль начинается с деталей."
 },
 "Позвонить": {
  "az": "Zəng et",
  "en": "Call",
  "ru": "Позвонить"
 },
 "Для онлайн-записи включи JavaScript или позвони:": {
  "az": "Onlayn rezervasiya üçün JavaScript-i aktiv et və ya zəng et:",
  "en": "Enable JavaScript to book online, or call:",
  "ru": "Для онлайн-записи включи JavaScript или позвони:"
 },
 "Не удалось получить ответ. Проверь соединение и попробуй ещё раз.": {
  "az": "Cavab alınmadı. İnternet bağlantını yoxla və yenidən cəhd et.",
  "en": "Could not get a response. Check your connection and try again.",
  "ru": "Не удалось получить ответ. Проверь соединение и попробуй ещё раз."
 },
 "Не удалось выполнить запрос.": {
  "az": "Sorğunu yerinə yetirmək mümkün olmadı. Yenidən cəhd et.",
  "en": "Could not complete the request. Please try again.",
  "ru": "Не удалось выполнить запрос."
 },
 "Подтверждаем…": {
  "az": "Təsdiqlənir…",
  "en": "Confirming…",
  "ru": "Подтверждаем…"
 },
 "Проверить запись": {
  "az": "Rezervasiyanı yoxla",
  "en": "Check booking",
  "ru": "Проверить запись"
 },
 "Нажми, чтобы получить результат отправленной записи": {
  "az": "Göndərilmiş rezervasiyanın nəticəsini öyrənmək üçün bas",
  "en": "Press to check the result of your submitted booking",
  "ru": "Нажми, чтобы получить результат отправленной записи"
 },
 "Нет соединения с интернетом": {
  "az": "İnternet bağlantısı yoxdur",
  "en": "No internet connection",
  "ru": "Нет соединения с интернетом"
 },
 "Загружаем расписание…": {
  "az": "Cədvəl yüklənir…",
  "en": "Loading schedule…",
  "ru": "Загружаем расписание…"
 },
 "Выбери дату визита": {
  "az": "Ziyarət tarixini seç",
  "en": "Choose your visit date",
  "ru": "Выбери дату визита"
 },
 "Выбери свободное время": {
  "az": "Boş saatı seç",
  "en": "Choose an available time",
  "ru": "Выбери свободное время"
 },
 "Время прошло": {
  "az": "Vaxt keçib",
  "en": "Time has passed",
  "ru": "Время прошло"
 },
 "Занято": {
  "az": "Rezerv edilib",
  "en": "Booked",
  "ru": "Занято"
 },
 "Ищем свободное время…": {
  "az": "Boş saatlar axtarılır…",
  "en": "Finding available times…",
  "ru": "Ищем свободное время…"
 },
 "Выбранное время уже недоступно. Пожалуйста, выбери другой час.": {
  "az": "Seçilmiş saat artıq mövcud deyil. Başqa saat seç.",
  "en": "That time is no longer available. Please choose another hour.",
  "ru": "Выбранное время уже недоступно. Пожалуйста, выбери другой час."
 },
 "В этот день записи нет. Выбери другую дату.": {
  "az": "Bu gün rezervasiya qəbul edilmir. Başqa tarix seç.",
  "en": "Bookings are closed for this day. Choose another date.",
  "ru": "В этот день записи нет. Выбери другую дату."
 },
 "Выбери удобный час.": {
  "az": "Sənə uyğun saatı seç.",
  "en": "Choose a time that suits you.",
  "ru": "Выбери удобный час."
 },
 "Свободного времени нет. Выбери другую дату.": {
  "az": "Boş saat yoxdur. Başqa tarix seç.",
  "en": "No times available. Choose another date.",
  "ru": "Свободного времени нет. Выбери другую дату."
 },
 "Не удалось обновить время. Попробуй ещё раз.": {
  "az": "Saatları yeniləmək mümkün olmadı. Yenidən cəhd et.",
  "en": "Could not refresh times. Please try again.",
  "ru": "Не удалось обновить время. Попробуй ещё раз."
 },
 "Нет интернета. Проверь соединение.": {
  "az": "İnternet yoxdur. Bağlantını yoxla.",
  "en": "You’re offline. Check your connection.",
  "ru": "Нет интернета. Проверь соединение."
 },
 "Не удалось загрузить расписание. Попробуй ещё раз или позвони İlker Sevim: +994 10 321 51 51.": {
  "az": "Cədvəli yükləmək mümkün olmadı. Yenidən cəhd et və ya İlker Sevim-ə zəng et: +994 10 321 51 51.",
  "en": "Could not load the schedule. Try again or call İlker Sevim: +994 10 321 51 51.",
  "ru": "Не удалось загрузить расписание. Попробуй ещё раз или позвони İlker Sevim: +994 10 321 51 51."
 },
 "Укажи имя — минимум 2 символа.": {
  "az": "Adını daxil et — ən azı 2 simvol.",
  "en": "Enter your name — at least 2 characters.",
  "ru": "Укажи имя — минимум 2 символа."
 },
 "Проверь номер телефона, например +994 10 321 51 51.": {
  "az": "Telefon nömrəsini yoxla, məsələn +994 10 321 51 51.",
  "en": "Check your phone number, for example +994 10 321 51 51.",
  "ru": "Проверь номер телефона, например +994 10 321 51 51."
 },
 "Выбери доступную дату и свободное время.": {
  "az": "Uyğun tarix və boş saat seç.",
  "en": "Choose an available date and time.",
  "ru": "Выбери доступную дату и свободное время."
 },
 "Не удалось получить подтверждение. Нажми ещё раз с теми же данными — повторная отправка не создаст вторую запись.": {
  "az": "Təsdiq alınmadı. Eyni məlumatlarla yenidən bas — təkrar göndəriş ikinci rezervasiya yaratmayacaq.",
  "en": "Confirmation was not received. Retry with the same details — resending will not create a second booking.",
  "ru": "Не удалось получить подтверждение. Нажми ещё раз с теми же данными — повторная отправка не создаст вторую запись."
 },
 "Номер записи: ": {
  "az": "Rezervasiya nömrəsi: ",
  "en": "Booking reference: ",
  "ru": "Номер записи: "
 },
 "Мужская стрижка": {
  "az": "Kişi saç kəsimi",
  "en": "Men’s haircut",
  "ru": "Мужская стрижка"
 },
 "Детская стрижка": {
  "az": "Uşaq saç kəsimi",
  "en": "Children’s haircut",
  "ru": "Детская стрижка"
 },
 "Коррекция бороды": {
  "az": "Saqqalın formalaşdırılması",
  "en": "Beard shaping",
  "ru": "Коррекция бороды"
 },
 "Стрижка + борода": {
  "az": "Saç kəsimi + saqqal",
  "en": "Haircut + beard",
  "ru": "Стрижка + борода"
 },
 "Пилинг кожи головы": {
  "az": "Baş dərisinin pilinqi",
  "en": "Scalp exfoliation",
  "ru": "Пилинг кожи головы"
 },
 "Укладка": {
  "az": "Saç düzümü",
  "en": "Hair styling",
  "ru": "Укладка"
 },
 "Мытьё до и после стрижки, укладка стайлингом.": {
  "az": "Kəsimdən əvvəl və sonra yuma, staylinq vasitələri ilə saç düzümü.",
  "en": "Wash before and after the haircut, finished with styling products.",
  "ru": "Мытьё до и после стрижки, укладка стайлингом."
 },
 "До 11 лет. Мытьё до и после стрижки, укладка стайлингом.": {
  "az": "11 yaşadək uşaqlar üçün. Kəsimdən əvvəl və sonra yuma, staylinq vasitələri ilə saç düzümü.",
  "en": "For children under 11. Wash before and after the haircut, finished with styling products.",
  "ru": "До 11 лет. Мытьё до и после стрижки, укладка стайлингом."
 },
 "Мытьё бороды, кондиционер-бальзам.": {
  "az": "Saqqalın yuyulması, kondisioner-balzam.",
  "en": "Beard wash and conditioning balm.",
  "ru": "Мытьё бороды, кондиционер-бальзам."
 },
 "Мужская стрижка и оформление бороды.": {
  "az": "Kişi saç kəsimi və saqqalın formalaşdırılması.",
  "en": "Men’s haircut and beard shaping.",
  "ru": "Мужская стрижка и оформление бороды."
 },
 "Уход и очищение кожи головы.": {
  "az": "Baş dərisinə qulluq və təmizləmə.",
  "en": "Scalp care and cleansing.",
  "ru": "Уход и очищение кожи головы."
 },
 "Мытьё головы и укладка стайлингом.": {
  "az": "Saçın yuyulması və staylinq vasitələri ilə düzümü.",
  "en": "Hair wash and styling.",
  "ru": "Мытьё головы и укладка стайлингом."
 },
 "Слишком много запросов. Попробуй позже.": {
  "az": "Həddindən artıq sorğu göndərilib. Bir az sonra yenidən cəhd et.",
  "en": "Too many requests. Please try again later.",
  "ru": "Слишком много запросов. Попробуй позже."
 },
 "Дата должна быть в пределах ближайшего года": {
  "az": "Tarix qarşıdakı bir il ərzində olmalıdır.",
  "en": "Choose a date within the next year.",
  "ru": "Дата должна быть в пределах ближайшего года"
 },
 "Проверь имя, телефон и услугу": {
  "az": "Adını, telefonunu və xidməti yoxla.",
  "en": "Check your name, phone number and service.",
  "ru": "Проверь имя, телефон и услугу"
 },
 "Повторный запрос отличается от исходной записи": {
  "az": "Təkrar sorğu əvvəlki rezervasiyadan fərqlənir. Məlumatları yoxla.",
  "en": "The retry differs from the original booking. Check your details.",
  "ru": "Повторный запрос отличается от исходной записи"
 },
 "Выбери будущий часовой слот": {
  "az": "Gələcək tarixdə boş saat seç.",
  "en": "Choose a future hourly slot.",
  "ru": "Выбери будущий часовой слот"
 },
 "Этот слот уже занят. Выбери другой час.": {
  "az": "Bu saat artıq rezerv edilib. Başqa saat seç.",
  "en": "This slot is already booked. Choose another hour.",
  "ru": "Этот слот уже занят. Выбери другой час."
 },
 "Ошибка сервера. Повтори запрос с теми же данными.": {
  "az": "Server xətası. Eyni məlumatlarla yenidən cəhd et.",
  "en": "Server error. Please retry with the same details.",
  "ru": "Ошибка сервера. Повтори запрос с теми же данными."
 },
 "Недопустимый источник запроса": {
  "az": "Sorğu qəbul edilmədi. Səhifəni yenilə və yenidən cəhd et.",
  "en": "The request was rejected. Refresh the page and try again.",
  "ru": "Недопустимый источник запроса"
 },
 "Некорректный JSON": {
  "az": "Məlumatlar göndərilmədi. Yenidən cəhd et.",
  "en": "Your details could not be sent. Please try again.",
  "ru": "Некорректный JSON"
 },
 "Ожидается JSON": {
  "az": "Məlumatlar göndərilmədi. Yenidən cəhd et.",
  "en": "Your details could not be sent. Please try again.",
  "ru": "Ожидается JSON"
 },
 "Language": {
  "az": "Dil",
  "en": "Language",
  "ru": "Язык"
 },
 "Location": {
  "az": "ÜNVANIMIZ",
  "en": "OUR LOCATION",
  "ru": "НАШ АДРЕС"
 },
 "Find Us": {
  "az": "Bizi harada tapa bilərsiniz?",
  "en": "Find Us",
  "ru": "Как нас найти"
 },
 "Open in Google Maps": {
  "az": "Google Maps-də aç",
  "en": "Open in Google Maps",
  "ru": "Открыть Google Maps"
 },
 "Open in Apple Maps": {
  "az": "Apple Maps-də aç",
  "en": "Open in Apple Maps",
  "ru": "Открыть Apple Maps"
 },
 "Please fill in this field.": {
  "az": "Bu xananı doldur.",
  "en": "Please fill in this field.",
  "ru": "Заполните это поле."
 },
 "Parlament küçəsi, Bakı, Azərbaycan": {
  "az": "Parlament küçəsi, Bakı, Azərbaycan",
  "ru": "улица Парламента, Баку, Азербайджан",
  "en": "Parlament Street, Baku, Azerbaijan"
 },
 "Opening hours": {
  "az": "İş saatları",
  "ru": "Часы работы",
  "en": "Opening hours"
 },
 "Design detail in every style": {
  "az": "Üslub hər detala diqqətdir.",
  "ru": "Стиль — это внимание к каждой детали.",
  "en": "Style is attention to every detail."
 },
 "Illustrative interior": {
  "az": "İNTERYER İLLÜSTRASİYASI",
  "ru": "ИЛЛЮСТРАЦИЯ ИНТЕРЬЕРА",
  "en": "ILLUSTRATIVE INTERIOR"
 },
 "Barber interior illustration": {
  "az": "Barber interyerinin illüstrasiyası",
  "ru": "Иллюстрация интерьера барбершопа",
  "en": "Illustration of a barbershop interior"
 },
 "Duration to be confirmed": {
  "az": "Müddət · dəqiqləşdirilir",
  "ru": "Длительность уточняется",
  "en": "Duration to be confirmed"
 },
 "Категория обслуживания": {
  "az": "Xidmət məkanı",
  "ru": "Категория обслуживания",
  "en": "Service area"
 },
 "Выберите зал": {
  "az": "Zalı seçin",
  "ru": "Выберите зал",
  "en": "Choose an area"
 },
 "Зал": {
  "az": "ZAL",
  "ru": "ZAL",
  "en": "ZAL"
 },
 "VIP-комната": {
  "az": "VIP OTAQ",
  "ru": "VIP OTAQ",
  "en": "VIP OTAQ"
 },
 "До 12 лет — только для обычного зала.": {
  "az": "ZAL üçün 12 yaşadək.",
  "ru": "В обычном зале — до 12 лет.",
  "en": "In ZAL, for children under 12."
 },
 "Итоговая стоимость определяется отдельно.": {
  "az": "Yekun qiymət ayrıca dəqiqləşdirilir.",
  "ru": "Итоговая стоимость уточняется отдельно.",
  "en": "The final price is confirmed separately."
 },
 "Длительность услуги ещё не установлена. Свяжитесь с нами.": {
  "az": "Xidmətin müddəti hələ təyin edilməyib. Bizimlə əlaqə saxlayın.",
  "ru": "Длительность услуги ещё не установлена. Свяжитесь с нами.",
  "en": "The service duration has not been set yet. Please contact us."
 },
 "Длительность": {
  "az": "Müddət",
  "ru": "Длительность",
  "en": "Duration"
 },
 "мин": {
  "az": "dəq",
  "ru": "мин",
  "en": "min"
 },
 "Место": {
  "az": "Məkan",
  "ru": "Зал",
  "en": "Area"
 },
 "Время недоступно": {
  "az": "Vaxt mövcud deyil",
  "ru": "Время недоступно",
  "en": "Time unavailable"
 },
 "Invalid booking details": {
  "az": "Rezervasiya məlumatlarını yoxlayın.",
  "ru": "Проверьте данные записи.",
  "en": "Check your booking details."
 },
 "Unknown service or room": {
  "az": "Xidməti və zalı yoxlayın.",
  "ru": "Проверьте услугу и зал.",
  "en": "Check the service and area."
 },
 "Service duration must be configured": {
  "az": "Xidmətin müddəti hələ təyin edilməyib. Bizimlə əlaqə saxlayın.",
  "ru": "Длительность услуги ещё не установлена. Свяжитесь с нами.",
  "en": "The service duration has not been set yet. Please contact us."
 },
 "Time unavailable": {
  "az": "Bu vaxt artıq mövcud deyil. Başqa saat seçin.",
  "ru": "Это время уже недоступно. Выберите другой час.",
  "en": "This time is no longer available. Choose another hour."
 },
 "Booking must be in the future": {
  "az": "Gələcək tarix və saat seçin.",
  "ru": "Выберите время в будущем.",
  "en": "Choose a future time."
 },
 "Booking retry differs": {
  "az": "Təkrar sorğu əvvəlki rezervasiyadan fərqlənir.",
  "ru": "Повторный запрос отличается от исходной записи.",
  "en": "The retry differs from the original booking."
 },
 "Phone contact": {
  "az": "Telefon",
  "ru": "Телефон",
  "en": "Phone"
 },
 "Social links": {
  "az": "Sosial şəbəkələr",
  "ru": "Социальные сети",
  "en": "Social links"
 }
};
 let language='az';
 try {const saved=localStorage.getItem('ilkersevim.language');if(['ru','az','en'].includes(saved))language=saved;else if(saved!==null)localStorage.setItem('ilkersevim.language','az');}catch{/* Language still works when storage is unavailable. */}
 const t=key=>dictionary[key]?.[language]??key;
 const aliases=new Map();for(const [key,values]of Object.entries(dictionary))for(const value of [key,values.ru,values.az,values.en])aliases.set(value.trim(),key);
 const texts=[],attributes=[];
 const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement?.closest('script,style'))continue;const key=aliases.get(node.nodeValue.trim());if(key)texts.push({node,key,leading:node.nodeValue.match(/^\s*/)[0],trailing:node.nodeValue.match(/\s*$/)[0]});}
 for(const node of document.querySelectorAll('[aria-label],[placeholder],[alt],meta[name=description]'))for(const attr of ['aria-label','placeholder','alt','content']){const value=node.getAttribute(attr);const key=value&&aliases.get(value.trim());if(key)attributes.push({node,attr,key});}
 function apply(){document.documentElement.lang=language;for(const item of texts)item.node.nodeValue=item.leading+t(item.key)+item.trailing;for(const item of attributes)item.node.setAttribute(item.attr,t(item.key));for(const button of document.querySelectorAll('[data-language]'))button.setAttribute('aria-pressed',String(button.dataset.language===language));}
 function setLanguage(value){if(!['ru','az','en'].includes(value)||value===language)return;language=value;try{localStorage.setItem('ilkersevim.language',language);}catch{}apply();document.dispatchEvent(new CustomEvent('languagechange'));}
 // Explicit month/day names also support browsers with incomplete Azerbaijani locale data.
 const months={ru:['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'],az:['yanvar','fevral','mart','aprel','may','iyun','iyul','avqust','sentyabr','oktyabr','noyabr','dekabr'],en:['January','February','March','April','May','June','July','August','September','October','November','December']};
 const weekdays={ru:['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'],az:['bazar','bazar ertəsi','çərşənbə axşamı','çərşənbə','cümə axşamı','cümə','şənbə'],en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']};
 const shortDays={ru:['вс','пн','вт','ср','чт','пт','сб'],az:['B.','B.e.','Ç.a.','Ç.','C.a.','C.','Ş.'],en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat']};
 function formatDate(date,options={day:'numeric',month:'long'}){
  const [year,month,day]=date.split('-').map(Number);const parts=[];
  if(options.day)parts.push(String(day));if(options.month)parts.push(language==='ru'&&options.day?['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'][month-1]:months[language][month-1]);if(options.year)parts.push(String(year));
  const value=parts.join(' ');if(!options.weekday)return value;
  const index=new Date(Date.UTC(year,month-1,day)).getUTCDay();return (options.weekday==='short'?shortDays:weekdays)[language][index]+', '+value;
 }
 window.RTI18n={t,formatDate,get language(){return language;},known:key=>Object.hasOwn(dictionary,key)};
 document.querySelectorAll('[data-language]').forEach(button=>button.addEventListener('click',()=>setLanguage(button.dataset.language)));
 apply();
})();

"""Generate the factual Turkish stage-one owner report (developer utility, not runtime)."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit

root = Path(__file__).resolve().parents[1]
output = root / 'docs/reports/OWNER-TR-STAGE1.pdf'
pdfmetrics.registerFont(TTFont('Body', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
c = canvas.Canvas(str(output), pagesize=(595, 842))
c.setTitle('Ilker Sevim | Aşama 1 Teknik Doğrulama')
c.setAuthor('Ilker Sevim Barbers Club')
gold, ink, muted = HexColor('#ad8b46'), HexColor('#171916'), HexColor('#5a5e57')

def header(page, title):
    c.setFillColor(ink); c.rect(0, 704, 595, 138, fill=1, stroke=0)
    c.setFillColor(gold); c.setFont('Bold', 12); c.drawString(42, 793, 'İLKER SEVİM / BARBERS CLUB')
    c.setFillColor(HexColor('#ffffff')); c.setFont('Bold', 23); c.drawString(42, 750, title)
    c.setFillColor(muted); c.setFont('Body', 9)
    c.drawString(42, 32, '16 Kasım 2026 · Aşama 1 · Üretime alınmamış test sürümü')
    c.drawRightString(553, 32, str(page))

def section(y, number, title, paragraphs):
    c.setFillColor(gold); c.setFont('Bold', 12); c.drawString(42, y, number)
    c.setFillColor(ink); c.setFont('Bold', 14); c.drawString(72, y, title)
    y -= 24
    for text in paragraphs:
        c.setFillColor(muted); c.setFont('Body', 10.5)
        for line in simpleSplit(text, 'Body', 10.5, 480):
            c.drawString(42, y, line); y -= 16
        y -= 10
    return y - 10

header(1, 'Güvenlik ve randevu kontrolü')
y=665
y=section(y, '01', 'Müşteri bilgileri nasıl korunuyor?', [
    'Herkese açık saat listesi müşterinin adını veya telefonunu göstermez. Yönetim API’si oturum gerektirir. Yeni işlemlerde CSRF ve kaynak kontrolü korunur; veritabanı sorguları parametrelidir.',
    'Uygulamanın Neon rolünün eski markaya ait tablolara erişemediği doğrulandı. Test ortamındaki yeni işlem günlüğüne uygulama kayıt ekleyebilir; mevcut kayıtları değiştiremez veya silemez.'
])
y=section(y, '02', 'Çakışan randevular nasıl önleniyor?', [
    'Seçilen hizmetlerin süreleri toplanır. Örneğin 11:00’da başlayan 90 dakikalık ziyaret aynı ustayı 12:30’a kadar meşgul eder. Başka bir usta, kendi programı uygunsa 11:00’da müşteri kabul edebilir.',
    'Sunucu, kayıttan hemen önce programı, molaları ve oda kapasitesini yeniden kontrol eder. Kontrol ve kayıt aynı veritabanı işlemi içinde yapılır. İptal edilen randevu ilgili zamanı serbest bırakır.'
])
y=section(y, '03', 'Gerçekte hangi testler yapıldı?', [
    'İki uygulama örneğinden PostgreSQL’e gönderilen 20 çakışan istekte yalnızca bir randevu kaydedildi; diğer 19 istek reddedildi. Tekrarlanan aynı istek ikinci bir randevu oluşturmadı.',
    '30, 60, 90 ve 120 dakikalık hizmetler, çoklu hizmetler, molalar, izin günleri ve oda sınırları test edildi. Test veritabanındaki mevcut ziyaretler korunarak geçiş denendi.'
])
c.showPage()
header(2, 'İşletme sahibinin kontrolü')
y=665
y=section(y, '04', 'Kod değiştirmeden yönetim', [
    'Test sürümünde ustalar, hizmetler, fiyatlar, süreler, çalışma günleri, molalar ve odalar panelden yönetilir. Her usta için 10, 15, 20, 30 veya 60 dakikalık başlangıç aralığı seçilebilir.',
    'Yedi usta kartı boş isimlerle hazırlanmıştır. Gerçek bilgiler ve çalışma saatleri doğrulanmadan çevrimiçi rezervasyon açılmaz. Arşivleme, eski ziyaretleri ve fiyat geçmişini silmez.'
])
y=section(y, '05', 'Doğrulanmış sınırlar', [
    'Hiçbir sistem için mutlak güvenlik garantisi verilmez. Test sonucu yalnızca incelenen sürüm ve senaryolar için geçerlidir. Bu çalışma bağımsız bir sızma testi değildir.',
    'Telefon ve masaüstü boyutlarında tarayıcı testleri yapıldı. Gerçek iPhone üzerinde yeni PWA davranışı ve yeni Push olayları henüz test edilmedi. Ücretsiz sunucu uyuyabildiği için tam zamanında hatırlatma henüz garanti edilemez.'
])
y=section(y, '06', 'Tam ticari sürümden önce', [
    'Resepsiyon ve işletme sahibi için ayrı roller; CRM, randevu taşıma, ayrıntılı finans kayıtları, e-posta ile şifre sıfırlama, gerçek müşteri hatırlatmaları ve yönetim panelinin üç dilde tamamlanması sonraki aşamalardadır.',
    'Neon projesinin mevcut geri dönüş penceresi 6 saattir. Test dalı bağımsız yedeğin yerini tutmaz. Canlıya geçmeden önce şifreli yedek ve geri yükleme denemesi yapılmalıdır.',
    'Sonuç: İlk modül teknik gösterime uygundur. Tüm ticari sistem henüz tamamlanmamıştır. Mevcut canlı site ve gerçek müşteri kayıtları bu aşamada değiştirilmedi.'
])
c.save()
print(output)

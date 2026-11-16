"""Generate a truthful Turkish owner report for the staged, not deployed build."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit

root=Path(__file__).resolve().parents[1]
output=root/'docs/reports/OWNER-TR-STAGED.pdf'
pdfmetrics.registerFont(TTFont('Body','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Bold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
c=canvas.Canvas(str(output),pagesize=(595,842));c.setTitle('İlker Sevim | Güvenlik ve rezervasyon raporu');c.setAuthor('İlker Sevim Barber Club')
ink,gold,muted=HexColor('#171916'),HexColor('#ad8b46'),HexColor('#555a53')
def page(number,title):
 c.setFillColor(ink);c.rect(0,704,595,138,fill=1,stroke=0);c.setFillColor(gold);c.setFont('Bold',12);c.drawString(42,793,'İLKER SEVİM / BARBER CLUB')
 c.setFillColor(HexColor('#ffffff'));c.setFont('Bold',21);c.drawString(42,750,title)
 c.setFillColor(muted);c.setFont('Body',9);c.drawString(42,32,'Test sürümü · Canlı sistem güncellenmedi · 16 Kasım 2026');c.drawRightString(553,32,str(number))
def section(y,title,paragraphs):
 c.setFillColor(ink);c.setFont('Bold',13);c.drawString(42,y,title);y-=23
 for text in paragraphs:
  c.setFillColor(muted);c.setFont('Body',10)
  for line in simpleSplit(text,'Body',10,508):c.drawString(42,y,line);y-=15
  y-=10
 return y-9
page(1,'Güvenlik ve randevu kontrolü');y=665
y=section(y,'Müşteri bilgileri',[
 'Herkese açık saatlerde başka müşterilerin adı ve telefonu gösterilmez. Yönetim paneli oturum gerektirir; işletme sahibi ve resepsiyon için ayrı yetkiler bulunur. Veritabanı sorguları parametre kullanır.',
 'Şifreler açık olarak saklanmaz. Hassas işlemlerde ek doğrulama, oturum iptali ve işlem günlüğü vardır. Bildirimler müşteri telefonunu ve adını kilit ekranında göstermez.'
])
y=section(y,'Çakışmaların önlenmesi',[
 'Seçilen hizmetlerin süreleri toplanır. Sistem, ustanın çalışma saatini, molasını, diğer randevuları ve varsa oda kapasitesini kontrol eder. Örneğin 90 dakikalık bir ziyaret ilgili ustanın süresini 90 dakika kapatır.',
 'Kontrol ve kayıt sunucu ve veritabanı işlemi içinde yapılır. PostgreSQL testlerinde eş zamanlı çakışan taleplerden yalnızca uygun olanı kaydedildi. Farklı ustalar uygun olduklarında aynı saatte çalışabilir.'
])
y=section(y,'İşletme sahibinin kontrolü',[
 'Test sürümünde ustalar, hizmetler, fiyatlar, süreler, odalar, çalışma saatleri, molalar ve bloklamalar panelden yönetilir. Resepsiyon randevu oluşturabilir, taşıyabilir, iptal edebilir ve müşteri geçmişini inceleyebilir.',
 'Usta arşivlendiğinde geçmiş silinmez. Ödeme düzeltmeleri ayrı kaydedilir. Panelde çevrimiçi rezervasyonun açılması ve iptal süresi de ayarlanabilir.'
])
c.showPage();page(2,'Test edilenler ve sınırlar');y=665
y=section(y,'Yapılan kontroller',[
 'Otomatik testlerde çoklu hizmet, farklı süreler, aynı anda yapılan rezervasyonlar, taşıma, iptal, rol yetkileri ve veri koruma senaryoları denendi. Test Neon veritabanında geçiş ve mevcut kayıtların korunması kontrol edildi.',
 'Parola sıfırlama bağlantısı tek kullanımlıktır ve süresi dolabilir. E-posta hatırlatmaları yalnızca müşteri onayıyla planlanır. Gerçek e-posta hizmeti henüz bağlanmadığından gerçek teslimat testi yapılmadı.'
])
y=section(y,'Açık kalan noktalar',[
 'Bu rapor test ortamındaki sürümü anlatır. Canlı tablolardan alınan şifreli kopya yerel bir veritabanına geri yüklendi ve kayıtlar karşılaştırıldı. Bağımsız yedek saklama, tam uygulama geri yükleme ve gerçek iPhone üzerinde PWA ve Push testi hâlâ gereklidir.',
 'Ücretsiz sunucu uykuya geçebilir; bildirimlerin tam zamanında gelmesi garanti edilemez. Mesaj servisleri ücret veya ek ayar gerektirebilir. Usta isimleri, çalışma saatleri ve iletişim bilgileri işletme sahibi tarafından doğrulanmalıdır.',
 'Hiçbir sistem için mutlak güvenlik garantisi verilemez. Bu kontroller bağımsız bir sızma testinin yerini tutmaz. Mevcut canlı site bu aşamada değiştirilmedi.'
])
c.save();print(output)

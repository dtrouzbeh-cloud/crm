# DentaFlow — Proje Tanımı (v0.2)

> **Durum:** Onaylandı — geliştirme başladı (F0).
> **Kararlar (5 Ekim 2026):**
> - Çok kiracılı SaaS
> - Yalnızca diş turizmi
> - MVP'de WhatsApp, online kapora, reklam lead'leri ve klinik operasyon olacak
> - Node/TypeScript + PostgreSQL, kendi VPS'imizde
>
> **Kaynaklar:**
> - DentClosers analiz dokümanları
> - Prototip: https://rouzbeh.app/crm/

---

## 0. Kesinleşen kararlar (v0.2 — 5 Ekim 2026)

| Konu | Karar |
|---|---|
| Ad | Çalışma adı **DentaFlow** (değiştirilebilir) |
| SaaS fiyatı | **Hibrit:** klinik başına sabit paket + kullanıcı (koltuk) başına ücret |
| Hasta ödemeleri | **Tüm seçenekler:** kart (Stripe, iyzico), PayPal, Apple/Google Pay (Stripe üzerinden), SEPA/banka havalesi (IBAN + referans kodu), ödeme linki, klinikte nakit/POS. Sağlayıcı katmanı eklentili (adapter) |
| WhatsApp | **WhatsApp Business Platform (Cloud API)** + **Business App coexistence** (klinik WhatsApp Business uygulamasını kullanmaya devam ederken aynı numara CRM'e bağlanır; Meta Embedded Signup). Resmî olmayan QR/Web oturumu yöntemleri numara engellenme riski nedeniyle kullanılmaz |
| Mesaj ücretleri | Klinik kendi Meta işletme hesabıyla doğrudan öder; platform aracı olmaz |
| Barındırma | Başlangıçta mevcut VPS (Türkiye). **Bölge bağımsız** tasarım: tek komutla AB/ABD sunucusuna taşınabilir (12-factor yapılandırma, S3 uyumlu depolama arayüzü, tam yedek/geri yükleme) |
| Kapsam | Analiz edilen sistemdeki **tüm özellikler** bu sürümde yer alır (fazlara bölünmüş olarak) |
| Veri akışı | **Entegrasyon merkezi:** gelen webhook alıcıları (genel JSON eşlemeli), giden webhook'lar (olay aboneliği), REST API + API anahtarları, CSV/Excel içe aktarma, Zapier/Make uyumlu olay kataloğu, hazır bağlayıcılar (Meta, TikTok, Google, GoHighLevel, Zoho, HubSpot) |
| Geliştirme | Tamamen bu ortamda yürütülür; iş GitHub (`dtrouzbeh-cloud/crm`) üzerinden fazlar halinde ilerler |
| Altyapı sadeleştirmesi | Docker kullanılmaz. Node 24 (TypeScript doğrudan çalışır, derleme adımı yok) + systemd + sunucudaki PostgreSQL 17 + mevcut nginx |
| Geçici alan adı | `crm.188-132-215-179.sslip.io` (gerçek alan adı alınınca değişecek) |

## 1. Ürün vizyonu ve ilkeler

**Tek cümle:** Diş turizmi kliniklerinin, reklamdan gelen yabancı hastayı ilk mesajdan son ödemeye kadar tek ekranda yönettiği; hekimin şema üzerinde plan çizdiği, satışın dakikalar içinde markalı teklif gönderdiği ve hastanın online onaylayıp kapora ödediği SaaS CRM.

**İlkeler**
1. **Tek hasta yolculuğu.**
   - Lead, vaka, teklif ve deal aynı hasta kaydına bağlıdır.
   - Durumlar tek bir kanonik durum makinesinden türetilir; çift kayıt yoktur.
2. **Satılan teklif dokunulmazdır.**
   - Gönderilen teklif değişmez bir snapshot'tır.
   - Klinik değişiklik yeni sürüm üretir; deal kabul edilen snapshot'a bağlıdır.
3. **Para defterle tutulur.**
   - Ödemeler yalnızca eklenir (append-only), düzeltme kaydıyla düzeltilir.
   - Ödendi bilgisi yalnızca ödeme sağlayıcının doğrulanmış webhook'undan gelir.
4. **Yetki sunucuda.**
   - Her yanıtta alan maskeleme uygulanır (fiyat, telefon, pasaport, tıbbi bilgi).
   - Tenant izolasyonu veritabanı seviyesinde, PostgreSQL RLS ile yapılır.
5. **Az araç, yüksek performans.**
   - Tek dil (TypeScript), tek veritabanı (PostgreSQL), tek sunucu.
   - Kuyruk, zamanlayıcı ve gerçek zamanlı yayın da PostgreSQL üzerinden çalışır; Redis yoktur.
6. **Kolay ve sade arayüz.**
   - Her ekranın tek bir ana işi vardır, gerisi bir tık uzaktadır.
   - Mobilde de çalışır.

## 2. Kapsam

### 2.1 MVP (v1.0) — modüller

| # | Modül | Özet |
|---|---|---|
| M1 | Platform ve abonelik | Klinik kaydı (onboarding), tenant, plan/koltuk, deneme süresi, platform admin paneli |
| M2 | Kimlik ve yetki | E-posta+şifre, MFA (TOTP), davet, roller, izin matrisi, alan maskeleme, denetim kaydı |
| M3 | Lead yönetimi | Liste/kanban, kayıtlı filtreler, mükerrer tespiti ve birleştirme, etiket, not, aktivite, CSV içe aktarma |
| M4 | Lead kaynakları | Gömülebilir web formu, Meta Lead Ads, TikTok Lead Gen, public API (header token), kaynak/kampanya takibi |
| M5 | WhatsApp gelen kutusu | Cloud API, çoklu numara, ekip inbox'ı, atama, şablon mesaj, hazır yanıt, medya, lead eşleştirme, teklif gönderme |
| M6 | Vaka ve klinik plan | Mevcut durum + tedavi planı odontogramı, çok ziyaretli plan, paketler, kural motoru, klinik notlar, vaka sohbeti, fotoğraf/röntgen |
| M7 | Katalog ve fiyat | Tedaviler, paketler, markalar, kademeli fiyat, çok para birimi + kur, oteller, transfer, uçuş katkısı |
| M8 | Teklif | 1–3 seçenek, indirim + onay akışı, değişmez sürümler, markalı hasta sayfası, PDF, WhatsApp/e-posta gönderimi, görüntülenme takibi |
| M9 | Online kapora | iyzico + Stripe, ödeme sayfası, webhook doğrulama, ödeme linki yedeği |
| M10 | Deal ve tahsilat | N ziyaretli deal, aşama makinesi, ödeme defteri, ziyaret bazlı planlanan/ödenen, iade/düzeltme |
| M11 | Seyahat ve operasyon | Pasaport, uçuş, otel, transfer planı, koordinatör panosu, randevu takvimi, resepsiyon günü, tercüman ataması |
| M12 | Görevler ve otomasyon | Görevler, takvim, iş akışı kuralları (tetikleyici → görev/mesaj), takip kadansları |
| M13 | Bildirimler | Uygulama içi, e-posta, web push; "Dikkat gerekiyor" (entegrasyon hataları) |
| M14 | Temel raporlar | Huni, kaynak/kampanya kırılımı, yanıt süresi, teklif kabul oranı, tahsilat, temsilci performansı |
| M15 | Ayarlar | Klinik kimliği, marka, diller, para birimleri, teklif sayfası içerikleri (ekip, galeri, SSS, sertifika), yasal metinler |

### 2.2 Sonraki sürümler

| Sürüm | Modüller |
|---|---|
| v1.1 | Instagram/Messenger DM, e-posta gelen kutusu, Google Ads lead'leri, özel alan adı, ödeme taksiti |
| v1.2 | AI: satış asistanı (taslak yanıt, özet, çeviri), Magic Fill (görüntü + açıklamadan plan taslağı), AI hasta botu (RAG, insana devir) |
| v1.3 | Dijital onam/anamnez (tablet imza), doküman merkezi, implant pasaportu, memnuniyet anketi + yorum linki |
| v1.4 | Komisyon ve fatura, gelişmiş analitik (kohort, ROI), özel panolar, Zoho/GHL göçü |
| v2 | Hasta portalı (PWA): mesajlaşma, doküman yükleme, seyahat takvimi, ödeme geçmişi |

**Bilerek dışarıda bırakılanlar:**
- yerel klinik randevu/seans yönetimi;
- muhasebe ve e-fatura entegrasyonu;
- stok yönetimi.

## 3. Hasta yolculuğu (kanonik durum makinesi)

```
Lead:   yeni → iletişim kuruldu → ilgileniyor → [vaka açıldı]
Vaka:   bilgi bekleniyor → teşhis havuzu → teşhis edildi → fiyatlandı → teklif gönderildi
Teklif: taslak → onay bekliyor → gönderildi → görüntülendi → {kabul | değişiklik istendi | red | süresi doldu | yeni sürümle değişti}
Deal:   kabul → kapora ödendi → seyahat planlandı → Ziyaret 1 (geldi → tedavide → tamamlandı) → … → Ziyaret N → kapandı (kazanıldı)
        yan çıkışlar: ertelendi, iptal (iade akışı)
```

- **Lead'in görünen durumu türetilmiş bir alandır:** vaka/teklif/deal durumundan hesaplanır. Manuel ilerletilebilen tek adımlar satış aşamalarıdır (yeni → iletişim → ilgileniyor) ve kapanıştır (kayıp + nedeni).
- **Bir hasta (Patient) birden fazla lead, vaka ve deal'e sahip olabilir.** Örnek: geri dönen hasta.
- **Mükerrer kontrolü** telefon (E.164), e-posta ve dış kaynak ID'si (Meta lead ID, WhatsApp wa_id) üzerinden yapılır.

## 4. Modül detayları

### M1 — Platform ve abonelik
- **Kayıt sihirbazı:** klinik adı → ülke/şehir → diller ve para birimleri → logo/renk → örnek veri (tek tıkla silinebilir).
- **URL yapısı:** `app.<alan>/<klinik-slug>/...`. Hasta sayfası `p.<alan>/<token>` veya kliniğin özel alan adı (v1.1).
- **Planlar:** koltuk başına aylık/yıllık. Kotalar: teklif/ay, WhatsApp numara sayısı, lead formu sayısı. Deneme 14 gün.
- **Platform admin paneli:**
  - klinikler ve abonelikler;
  - kullanım ve kota;
  - "klinik adına giriş" (zorunlu sebep + kayıt + ekranda bant);
  - varsayılan katalog;
  - yedekler ve sistem sağlığı.
- **Faturalandırma (SaaS):** Stripe Billing. Yerel müşteriler için havale/manuel ödeme kaydı.

### M2 — Kimlik ve yetki
- **Giriş:** e-posta + şifre (argon2id), TOTP MFA (yönetici rollerinde zorunlu), güvenilir cihaz 30 gün, oturum listesi ve uzaktan kapatma. Google OAuth v1.1'de.
- **Roller (varsayılan, klinik özelleştirebilir):** Klinik yöneticisi, Satış müdürü, Satış temsilcisi, Diş hekimi, Hasta koordinatörü, Resepsiyon, Tercüman, Muhasebe.
- **İzin modeli:** `kaynak:eylem:kapsam`.
  - Örnekler: `lead:read:own|team|all`, `quote:send`, `quote:discount:max=10`, `deal:payment:record`.
  - Rol varsayılanları + kullanıcı bazlı istisna.
  - Arayüzde "etkin yetki önizlemesi" bulunur.
- **Alan politikaları:** `price`, `phone`, `email`, `passport`, `medical`, `deal_amount`.
  - Görünür / maskeli / gizli.
  - API katmanında uygulanır; PDF ve dışa aktarma da aynı politikaya tabidir.
- **Denetim kaydı:** her yazma işlemi (kim, ne, eski→yeni, IP, cihaz), giriş geçmişi, dışa aktarma.

### M3 — Lead yönetimi
- **Liste görünümü:**
  - Sütunlar: ad, telefon, ülke, durum, kaynak/kampanya, sıcaklık, sahip, son temas, sonraki takip.
  - Kanban görünümüne geçilebilir.
  - Kayıtlı görünümler, toplu işlem.
- **Lead kartı (Hasta 360):**
  - kimlik ve iletişim, yapılandırılmış anamnez, ilgi alanı, bütçe, seyahat tarihi;
  - zaman çizelgesi (mesaj, arama, not, durum, teklif olayları);
  - görevler, dosyalar.
- **Atama:** round-robin veya kurala göre (dil, ülke, kaynak), müsaitlik durumu, ilk yanıt SLA'sı (örn. 15 dk) ve aşımda eskalasyon.
- **Kayıp nedeni zorunlu.** Soğuyan lead'ler için yeniden aktivasyon listesi.

### M4 — Lead kaynakları
- **Web formu oluşturucu:**
  - Taslak → yayınla akışı (DentClosers'taki otomatik yayın hatasına karşı).
  - Alan eşleme, spam koruması (honeypot + hız limiti).
  - Gömme kodu, UTM yakalama.
- **Meta Lead Ads ve TikTok Lead Gen:**
  - OAuth bağlantısı, form → "lead zinciri" eşlemesi.
  - Webhook + periyodik mutabakat (kaçan lead'i yakalamak için).
  - Bağlantı durumu üç ayrı aşama olarak gösterilir: Yapılandırıldı / Bağlı / Sağlıklı.
- **Public API:** `POST /v1/leads`. Kimlik `Authorization: Bearer` ile gönderilir (URL'de anahtar yok). Kapsamlı ve döndürülebilir anahtarlar, idempotency anahtarı.

### M5 — WhatsApp gelen kutusu
- **Bağlantı:** WhatsApp Business Cloud API (Meta Embedded Signup), plan başına N numara.
- **Inbox:**
  - Konuşma listesi (atanmış / benim / atanmamış / yıldızlı).
  - Mesaj alanı: metin, medya, şablon.
  - Sağ panel: lead kartı + aktif teklif.
- **Kurallar:**
  - 24 saat penceresi dışında yalnızca onaylı şablon gönderilir.
  - Gelen her mesaj lead'e bağlanır; eşleşme yoksa otomatik lead oluşur.
  - Atama ve devir; iç notlar (hastaya gitmez).
- **Teklifi WhatsApp'tan gönderme:** şablon + bağlantı. Okundu/teslim durumları zaman çizelgesine düşer.
- **Mesaj çevirisi:** v1.2'de AI ile. MVP'de çeviri servisi entegrasyonu opsiyoneldir.

### M6 — Vaka ve klinik plan (prototipteki çekirdek)
- **Vaka açılışı:**
  - Zorunlu alanlar klinik ayarından gelir (fotoğraf, röntgen, anamnez, şikâyet).
  - Eksikse "Hastadan bilgi iste" (WhatsApp şablonu) gönderilir.
- **Teşhis havuzu:** hekim "vakayı al" der, hekime atama yapılır, bekleme süresi gösterilir.
- **Adım 1 — mevcut durum:** 16 durum + bulgular. AI görüntü analizi v1.2'de.
- **Adım 2 — tedavi planı:**
  - Çok ziyaretli plan, paketler, marka/malzeme.
  - Taslak + geri al.
  - Ziyaretler arası iyileşme süresi.
- **Kural motoru (paylaşılan paket; istemci ve sunucuda aynı kod):**
  - Engelleyiciler: B1, B3, B4, B5, C1, C1b, minimum ziyaret, boş ziyaret.
  - Uyarılar: B6, köprü desteği, sinüs/implant, kemik/greft, E1, D1, paket ön koşulu (bileşenler açılarak sayılır), M1–M6 anamnezden.
  - Uyarılar onaylanınca kim onayladı ve ne zaman, vakaya kaydedilir.
- **Plan sürümleri:** klinik plan ↔ satış teklifi ayrı. Deal sonrası klinik değişiklik → "klinik plan v2", satılan teklif değişmez, fark raporu üretilir.
- **Vaka içi:** klinik notlar (düzenlenemez, yalnızca düzeltme kaydı), ekip sohbeti, dosyalar.

### M7 — Katalog ve fiyat
- **Tedaviler:**
  - Kategori, birim (diş / taraf / çene / ağız / adet), şema çizimi, izinli ziyaretler, ön koşul, uyumsuzluklar.
  - Çok dilli ad ve açıklama.
- **Fiyat:** marka/malzeme bazında, baz para birimi + kur tablosu veya para birimi bazında sabit fiyat. Kademeli paket fiyatı (örn. 16/20/24/28 kron).
- **Paketler:** All-on-4/6, sabit protez, gülüş tasarımı, snap-on. Otomatik diş seçimi, çene, bileşenler, marka katmanları.
- **Seyahat kalemleri:** oteller (gece fiyatı, oda tipi), transfer seçenekleri, uçuş katkısı (%).
- **Fiyat listesi geçerliliği:** başlangıç/bitiş tarihi. Gönderilen teklif, gönderildiği andaki fiyatları kopyalar.

### M8 — Teklif
- **Seçenekler:** 1–3 adet ("aynı tedavi, farklı malzeme" / "farklı tedavi"), önerilen işareti.
- **İndirim:** rol limiti; aşınca onay talebi. Onaylayan ve onay zamanı teklife kaydedilir.
- **Gönderim öncesi kontrol:**
  - kural ihlali yok;
  - onaylar tamam;
  - fiyatsız kalem yok;
  - yasaklı pazarlama dili yok;
  - plan ile senkron.
- **Sürümleme:** her gönderim yeni ve değişmez bir sürümdür. Eski bağlantı "yeni sürüm var" gösterir.
- **Hasta sayfası:**
  - Markalı, çok dilli, mobil öncelikli.
  - Seçenek karşılaştırma, şema, fiyat dökümü, ödeme planı, takvim, neler dahil, ekip/galeri/SSS.
  - Geri sayım.
  - Kabul / değişiklik iste / reddet.
- **Gizlilik:**
  - Tıbbi bilgi varsayılan olarak hasta sayfasında gösterilmez.
  - Bağlantı tahmin edilemez bir token'dır (hash'li saklanır).
  - Süre, uzatma ve iptal yönetilebilir.
  - İsteğe bağlı OTP doğrulaması.
- **Takip:**
  - Personel önizlemesi sayılmaz.
  - Gerçek görüntülenmede satışçıya bildirim gider.
  - Süre bitimine 3 gün kala hatırlatma görevi oluşur.

### M9 — Online kapora
- Kabulden sonra kapora adımı gelir (yüzde veya sabit tutar). Kapora ödemeden de kabul geçerlidir; klinik ayarına göre zorunlu yapılabilir.
- **Sağlayıcılar:** para birimine göre otomatik seçilir. TRY için iyzico; EUR/GBP/USD için Stripe (veya iyzico yabancı kart). Sağlayıcı yoksa ödeme linki kullanılır.
- **Doğrulama:**
  - Ödendi bilgisi yalnızca imzalı webhook ile gelir; tarayıcı dönüş URL'si kanıt sayılmaz.
  - İdempotent işlenir, mutabakat işi çalışır.
- Makbuz e-postası gider, deal'e ödeme kaydı otomatik düşer.

### M10 — Deal ve tahsilat
- **Deal:** kabul edilen teklif sürümüne bağlıdır; N ziyaretlidir (sınır yok, ayrı tablo).
- **Aşamalar:** kabul → kapora → seyahat planlandı → ziyaret aşamaları → kazanıldı. Aşama geçişleri kurala bağlıdır; örneğin "ödeme aşamasında para kaydı yok" uyarısı.
- **Ödeme defteri:**
  - Ödeme (sağlayıcı / nakit / havale / POS) → ziyaret dağıtımı (allocation).
  - İade ve düzeltme kayıtları ayrıdır.
  - Para birimi karıştırılmaz.
- **Upsell:** klinikte eklenen tedaviler "ek satış" olarak ayrı kalem tutulur ve kimin yaptığı kaydedilir.

### M11 — Seyahat ve operasyon
- **Seyahat (deal × ziyaret başına):**
  - Pasaport bilgisi (OCR v1.1), uçuş (gidiş/dönüş, bilet dosyası), otel (giriş/çıkış, oda), transfer koşuları (havalimanı → otel → klinik → havalimanı, şoför).
  - Seyahat onay PDF'i, WhatsApp/e-posta ile gönderim.
- **Koordinatör panosu:** bugün / 7 gün / sonra gelenler, eksik bilgi uyarıları (bilet yok, otel yok), transfer listesi, gün sonu devri.
- **Randevu takvimi:** hekim ve koltuk bazında; ziyaret planından randevu üretilir, çakışma kontrolü yapılır.
- **Resepsiyon günü:** gelenler, check-in, hekime yönlendirme, ziyaret tahsilatı, gün sonu özeti.
- **Tercüman:** randevuya atanır, haftalık program, hasta notları.
- **Klinik plan kalemleri:** randevuda "tamamlandı" işaretlenir. Ziyaret ilerlemesi ve deal aşaması otomatik güncellenir.

### M12 — Görevler ve otomasyon
- **Görevler:** tip, öncelik, vade, tekrar, erteleme, toplu işlem. Takvim görünümü.
- **İş akışı kuralları:**
  - Tetikleyiciler: lead oluştu, durum değişti, teklif görüntülendi/süresi yaklaşıyor, ödeme alındı, ziyaret tarihi geldi, ziyaretten N gün sonra.
  - Eylemler: görev oluştur, şablon mesaj gönder, atama, etiket.
  - Simülasyon ("bu kural geçen hafta ne yapardı") ve çalışma geçmişi bulunur.
- **Kadanslar:** yanıt vermeyen lead için 1-3-7 gün takip dizisi; insan yanıt verince durur.

### M13 — Bildirimler
- **Kanallar:** uygulama içi (gerçek zamanlı), e-posta, web push. Kullanıcı tercihleri olay bazında ayarlanır.
- **"Dikkat gerekiyor" listesi:** entegrasyon kopması, başarısız webhook, ödeme mutabakat farkı. Sorun çözülünce kendiliğinden kapanır.

### M14 — Temel raporlar
- **Gösterge kartları:** yeni lead, ilk yanıt süresi (medyan), lead→teklif, teklif→kabul, kapora tahsilatı, bekleyen tahsilat.
- **Kırılımlar:** kaynak, kampanya, ülke, dil, temsilci, tedavi. Her kırılım satırına tıklanınca listeye inilir.
- **Metrik sözlüğü:** her metriğin tanımı dokümante edilir; örneğin "ilk temas = insan tarafından giden ilk mesaj/arama".

### M15 — Ayarlar
- **Kimlik ve marka:** klinik kimliği, logo, renk (kontrast kontrolü).
- **Dil ve para:** desteklenen diller ve para birimleri, kur tablosu.
- **Teklif sayfası içerikleri:** ekip, galeri, sertifika, SSS, yasal metin, depozito politikası.
- **Kurallar ve kanallar:** kayıp nedenleri, iletişim kanalları, özel alanlar.
- **Yedekleme:** klinik bazında dışa aktarım (JSON + dosyalar).

## 5. Roller × temel yetkiler (varsayılan)

| Yetki | Yönetici | Satış müdürü | Satış | Hekim | Koordinatör | Resepsiyon | Tercüman | Muhasebe |
|---|---|---|---|---|---|---|---|---|
| Lead görme | tümü | tümü | kendi | — | atandığı | — | — | — |
| WhatsApp inbox | ✓ | ✓ | kendi | — | ✓ | — | — | — |
| Vaka görme | ✓ | ✓ | kendi | ✓ | ✓ (fiyatsız) | — | atandığı | — |
| Teşhis / plan | ✓ | — | — | ✓ | — | — | — | — |
| Fiyatlandırma / teklif | ✓ | ✓ | ✓ | — | — | — | — | — |
| İndirim limiti | ∞ | %15 | %5 | — | — | — | — | — |
| Deal / ödeme kaydı | ✓ | ✓ | kendi | — | — | ziyaret tahsilatı | — | ✓ |
| Seyahat / transfer | ✓ | ✓ | görür | — | ✓ | görür | — | — |
| Randevu takvimi | ✓ | görür | görür | kendi | ✓ | ✓ | kendi | — |
| Katalog / fiyat listesi | ✓ | ✓ | — | — | — | — | — | — |
| Ayarlar / ekip / entegrasyon | ✓ | — | — | — | — | — | — | — |
| Telefon / pasaport görünürlüğü | ✓ | ✓ | ✓ | maskeli | ✓ | ✓ | maskeli | — |

## 6. Veri modeli (çekirdek tablolar)

Tüm tenant tablolarında `clinic_id` + RLS bulunur. Ortak alanlar `id (uuid v7)`, `created_at` ve `updated_at`'tir. Para tamsayı `amount_minor` + `currency` olarak, yüzdeler `bps` olarak saklanır.

```
platform:  clinics, subscriptions, plans, usage_counters, platform_admins, impersonation_log
kimlik:    users, memberships(clinic,user,role), roles, role_permissions, user_permission_overrides, sessions, mfa_factors, audit_events
crm:       patients, contact_points, leads, lead_events, tags, tag_links, custom_fields, custom_field_values, saved_views, loss_reasons
kaynak:    lead_forms, form_submissions, integrations, integration_mappings, webhook_events(idempotency), api_keys
mesaj:     wa_numbers, conversations, conversation_members, messages, message_templates, canned_replies
klinik:    medical_profiles, cases, case_files, tooth_assessments, clinical_plans, clinical_plan_items, rule_acknowledgements, clinical_notes, case_messages
katalog:   treatment_types, treatment_rules, treatment_prices, brands, bundles, bundle_components, bundle_prices, hotels, room_rates, transfer_options, fx_rates, price_lists
teklif:    quotes, quote_versions(snapshot jsonb + hash), quote_options, quote_items, discount_approvals, share_links(token_hash), quote_events
para:      deals, deal_visits, payments, payment_allocations, refunds, adjustments, payment_providers, payment_intents
operasyon: trips, passports, flights, hotel_bookings, transfer_runs, appointments, appointment_staff, resources(chair), visit_checkins
iş:        tasks, workflow_rules, workflow_runs, cadences, notifications, notification_prefs, attention_items
sistem:    jobs (pg-boss), outbox_events, files
```

## 7. Teknik mimari

### 7.1 Yığın

Az araç, tek dil ve tek veritabanı hedeflenir.

| Katman | Seçim | Neden |
|---|---|---|
| Dil | TypeScript (her yerde) | Tek dil, paylaşılan tipler |
| Monorepo | npm workspaces | `apps/api`, `apps/web`, `packages/core` (kural motoru, fiyat hesabı, şema bileşeni, zod şemaları) |
| Backend | Node 22 + **Fastify** | Hızlı, sade, şema tabanlı doğrulama |
| SQL | **postgres.js** + düz SQL migration dosyaları | ORM yok; en hızlı sürücü, tam SQL kontrolü |
| Veritabanı | **PostgreSQL 16** | RLS, JSONB snapshot, tam metin arama (hasta arama) |
| Kuyruk / zamanlayıcı | PostgreSQL `jobs` tablosu + `SKIP LOCKED` (kendi küçük işçimiz) | Redis gerekmez; webhook işleme, hatırlatma, mutabakat, PDF |
| Gerçek zamanlı | SSE + PostgreSQL `LISTEN/NOTIFY` | Ek servis gerekmez; inbox ve bildirimler |
| Frontend | React 19 + Vite + TanStack Query + wouter (küçük router) | Prototipteki ekranlar bileşenlere taşınır |
| Stil | Prototipteki CSS token sistemi (Tailwind yok) | Az bağımlılık, küçük paket |
| Şema bileşeni | Prototipteki parametrik SVG → `packages/core` | Klinikte, teklifte, PDF'te aynı çizim |
| i18n | Sözlük + ICU mesajları | TR, EN, DE, AR (RTL), FR, ES, RU, IT, NL… |
| PDF | Headless Chromium (Playwright, worker'da) | Hasta sayfasının birebir PDF'i |
| Dosya | Sunucu diski + imzalı URL, gece offsite yedek (S3 uyumlu) | Basit; ileride R2/S3'e taşınabilir |
| E-posta | SMTP (Resend / Postmark) | Teklif, makbuz, bildirim |
| Ödeme | iyzico + Stripe | TRY + yabancı para |
| Mesajlaşma | WhatsApp Cloud API, Meta/TikTok Graph | |
| Gözlem | Yapılandırılmış log (pino) + Sentry (opsiyonel) + uptime kontrolü | |

### 7.2 Dağıtım (mevcut VPS)
- **systemd servisleri:** `dentaflow-api` (statik frontend'i de sunar) ve `dentaflow-worker`. Sunucudaki PostgreSQL 17 (ayrı veritabanı + RLS rolü), mevcut **nginx** ters vekil, SSL Let's Encrypt ile.
- **Alan adları:** `app.<alan>` (uygulama), `p.<alan>` (hasta sayfaları), `api.<alan>` (webhook'lar). Alan adı kararı bekliyor.
- **CI/CD:** GitHub Actions → typecheck + test → sunucuya SSH ile dağıtım (`git pull`, `npm ci`, migration, web build, servis yeniden başlatma).
- **Yedek:**
  - Gece `pg_dump` + dosyalar → offsite, 30 gün saklama.
  - Haftalık geri yükleme testi.
  - Klinik bazında dışa aktarım.
- **Ortamlar:** `staging` (aynı VPS, ayrı veritabanı) ve `production`.

### 7.3 Güvenlik ve uyum
- KVKK ve GDPR: açık rıza kayıtları (pazarlama ≠ tedavi), veri saklama süreleri, silme/anonimleştirme talebi, dışa aktarma hakkı.
- Tıbbi veri ve pasaport: alan bazlı erişim + erişim kaydı. Dosyalar özel depoda, kısa ömürlü imzalı URL ile sunulur.
- Webhook'lar imza doğrulamalı ve idempotent. Hız limiti, CSRF koruması, CSP başlıkları.
- Sırlar (ödeme ve WhatsApp anahtarları) veritabanında şifreli saklanır ve bir daha gösterilmez.

### 7.4 Performans hedefleri
- Uygulama ilk yükleme < 1 sn (gzip JS < 250 KB). Ekran geçişi < 100 ms.
- API p95 < 200 ms. Hasta sayfası (mobil, 4G) < 1,5 sn.
- 50 klinik × 20 kullanıcıyı tek VPS'te rahat taşıyacak şekilde.

## 8. Yol haritası (tahmini)

| Faz | Süre | İçerik | Çıkış kriteri |
|---|---|---|---|
| F0 Temel | 2 hafta | Monorepo, CI/CD, Docker, veritabanı + RLS, kimlik/MFA, roller, denetim, tasarım sistemi, i18n | İki tenant arasında veri izolasyonu testi geçer |
| F1 CRM | 2 hafta | Hasta/lead, liste/kanban, mükerrer, görevler, takvim, bildirim altyapısı | Lead → görev → takip akışı |
| F2 Klinik | 3 hafta | Katalog, vaka, odontogram, kural motoru (paylaşılan), klinik plan, dosyalar | Prototipteki vaka akışı üretimde |
| F3 Teklif + kapora | 3 hafta | Fiyatlandırma, onay, sürümler, hasta sayfası, PDF, iyzico + Stripe | Gerçek ödemeyle uçtan uca kabul + kapora |
| F4 Deal + operasyon | 3 hafta | Deal/defter, seyahat, koordinatör, randevu, resepsiyon, tercüman | Ziyaret → tahsilat → kapanış |
| F5 Kanallar | 3 hafta | WhatsApp inbox, şablonlar, web formu, Meta/TikTok lead'leri, public API, iş akışı motoru | Reklamdan gelen lead WhatsApp'ta yanıtlanır |
| F6 SaaS + rapor | 2 hafta | Onboarding, abonelik (Stripe Billing), platform admin, temel raporlar | İlk dış klinik kendi kendine kaydolur |
| Pilot | 2–4 hafta | Kendi kliniğinizde canlı kullanım, veri taşıma, eğitim, düzeltmeler | P1 hata kalmaz |

**Toplam:** MVP için yaklaşık 18 hafta geliştirme + pilot.

**Ön süreli işler (hemen başlatılmalı):**
- Meta Business doğrulaması ve WhatsApp Business numarası (1–3 hafta).
- iyzico ve Stripe üye işyeri başvuruları.
- Alan adı.

## 9. Açık kararlar

1. **Ürün adı ve alan adı:** "DentaFlow" çalışma adı mı, kalıcı mı? Hangi alan adı?
2. **SaaS fiyatlandırması:** koltuk başı mı, klinik başı paket mi? Deneme süresi ve kotalar.
3. **Ödeme:** yabancı hastalar için Stripe mı (yurt dışı şirket gerekebilir), iyzico yabancı kart mı?
4. **WhatsApp:** hazır Business hesabı ve numaralar var mı? Mesaj ücretleri kliniğe mi yansıtılacak (kredi sistemi)?
5. **Veri barındırma:** tüm veriler Türkiye'deki VPS'te mi kalacak? AB'li hastalar için GDPR açısından değerlendirilmeli.
6. **Fatura:** MVP'de yalnızca makbuz/proforma mı, yoksa e-fatura (v1.4) mı?
7. **Mevcut veriler:** ilk klinikler için içe aktarılacak kaynak var mı (DentClosers, Excel, Zoho)?
8. **Ekip:** geliştirmeyi tamamen burada mı yürüteceğiz, yoksa bir yazılımcı ekibi de katılacak mı (kod standartları ve review süreci buna göre)?

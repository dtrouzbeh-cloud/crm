# DentaFlow v2 — Satış, Pazarlama ve Yapay Zekâ Planı

> Hedef: lead'in ilk saniyesinden tedavi sonrası yoruma ve tavsiyeye kadar **hiçbir hastanın düşmediği** bir sistem.
> Satış temsilcisi varsa onu hızlandırır; yoksa yapay zekâ ajanları yazarak ve konuşarak işi devralır.

Bu doküman, kullanıcının istekleri (pipeline'lar, takip, recall, yapay zekâ ile otomatik iletişim, lead kaynakları) ile diş kliniğine özel modülleri (lab takibi, implant izlenebilirliği, garanti, tedavi sonrası takip) **tek bir yol haritasında** birleştirir.

---

## 0. Bugün sistemde olanlar (temel)

| Var | Eksik / sınırlı |
|---|---|
| Sabit lead aşamaları (new → won/lost), kanban | Klinik tanımlı **çoklu pipeline** ve aşama yok |
| İş akışı kuralları (olay → görev / form gönder) | **Çok adımlı takip dizileri** (sequence) yok, zamanlama ve durdurma koşulları yok |
| WhatsApp Cloud API gelen kutusu, şablonlar | Instagram DM, Messenger, web sohbet, SMS, e-posta gelen kutusu yok |
| Meta / Google / TikTok lead formları, webhook, CSV, ref kodu | Reklam harcaması, maliyet/ROAS, Meta CAPI dönüşüm geri bildirimi yok |
| Anket → yorum linki, iş ortakları | Toplu kampanya (broadcast), segment, izin yönetimi yok |
| Raporlar (huni, kaynak) | Temsilci performansı, tahmin (forecast), hız-lead (speed-to-lead) yok |
| — | Yapay zekâ ajanı (yazılı / sesli), telefon altyapısı yok |

---

## 1. Pipeline'lar (klinik tanımlı)

Tek sabit aşama listesi yerine, klinik istediği kadar pipeline kurar. Varsayılan olarak **5 hazır pipeline** gelir:

| Pipeline | Aşamalar (varsayılan) | Amaç |
|---|---|---|
| **Satış** | Yeni → İletişim kuruldu → Nitelikli → Fotoğraf/röntgen bekleniyor → Teşhiste → Teklif gönderildi → Pazarlık → Kapora → Kazanıldı / Kaybedildi | Lead'den kaporaya |
| **Yeniden kazanım (nurture)** | Soğudu → 1. temas → 2. temas → Yeniden ilgilendi → Satışa geri döndü / Vazgeçti | Kaybedilen veya cevapsız lead'ler |
| **Tedavi yolculuğu** | Kapora alındı → Seyahat planlandı → 1. ziyaret → İyileşme → 2. ziyaret → Tamamlandı | Deal sonrası operasyon (mevcut deal board'u buraya bağlanır) |
| **Tedavi sonrası** | 1. gün → 3. gün → 7. gün → 1. ay → Yorum istendi → Tavsiye eden | Bakım takibi, yorum, tavsiye |
| **Recall** | Hatırlatma zamanı geldi → Ulaşıldı → Randevu alındı → Geldi / Ertelendi | Kontrol, hijyen, kalıcı diş dönüşü |

Her aşamada:
- **Kazanma olasılığı (%)** → ağırlıklı satış tahmini (forecast)
- **SLA** (ör. "Yeni" aşamasında en fazla 5 dk) → aşılırsa uyarı ve otomatik devir (yapay zekâya veya yöneticiye)
- **Giriş/çıkış otomasyonları** → aşamaya girince dizi başlat, görev aç, AI ajanını devreye al
- **Zorunlu alanlar** → ör. "Kaybedildi" için neden, "Nitelikli" için bütçe ve tarih aralığı

Bir lead aynı anda birden fazla pipeline'da olabilir (ör. hem Tedavi sonrası hem Recall). Kanban, liste, tahmin görünümleri her pipeline için çalışır.

---

## 2. Takip dizileri (sequence / cadence motoru)

Takibin kalbi. Görsel olarak adım adım kurulur:

```
Gün 0, 0 dk   AI ajan: WhatsApp karşılama + nitelendirme soruları
Gün 0, 2 dk   Cevap yoksa → AI sesli arama (mesai içi, hastanın saat diliminde)
Gün 0, 1 sa   Cevap yoksa → temsilciye arama görevi
Gün 1, 10:00  WhatsApp şablonu: önce/sonra fotoğrafları + "fotoğrafınızı gönderin"
Gün 3         E-posta: klinik tanıtımı + hasta yorumları
Gün 7         AI sesli arama: "teklifinizi incelediniz mi?"
Gün 14        Son mesaj → cevap yoksa "Yeniden kazanım" pipeline'ına taşı
```

- **Adım türleri:** WhatsApp (şablon/serbest metin), e-posta, SMS, AI mesajı, AI sesli arama, temsilci arama görevi, bekleme, koşul (if/else), pipeline aşaması değiştir, etiket ekle, form gönder.
- **Durdurma koşulları:** hasta cevap verdi, teklifi açtı, randevu aldı, kapora ödedi, "beni arama" dedi (opt-out).
- **Akıllı zamanlama:** hastanın saat dilimi, sessiz saatler (ör. 21:00–09:00 yok), hafta sonu kuralları, WhatsApp 24 saat penceresi (dışarıdaysa otomatik onaylı şablon).
- **A/B testi:** iki mesaj sürümü → hangisi daha çok cevap/dönüşüm getiriyor.
- **Hazır şablon diziler:** Yeni lead (speed-to-lead), teklif sonrası takip, cevapsız lead, kaybedilen lead (30/60/90 gün), tedavi sonrası bakım (implant/kron/veneer için ayrı), recall.

---

## 3. Recall (geri çağırma) motoru

Tedavi tamamlandığında kurallar otomatik recall planlar:

| Tetikleyici | Recall | Kanal |
|---|---|---|
| İmplant yerleştirildi | 3–6 ay sonra kalıcı diş için 2. ziyaret | Dizi: WhatsApp + AI arama |
| Kron/veneer tamamlandı | 6. ay kontrol fotoğrafı, 12. ay kontrol | WhatsApp fotoğraf isteği |
| Herhangi tedavi | 12 ayda bir genel kontrol + temizlik | E-posta + WhatsApp |
| Beyazlatma | 12–18 ay tazeleme önerisi | Kampanya |
| Gece plağı | Yıllık yenileme | WhatsApp |

- Recall listesi: bu hafta/bu ay vadesi gelenler, ulaşılamayanlar, randevuya dönenler.
- Hasta kendi ülkesinde kontrol yaptırıyorsa: fotoğraf/röntgen yükleme bağlantısı → hekim uzaktan değerlendirir.
- Recall dönüşüm raporu: kaç hasta geri döndü, ne kadar ciro getirdi.

---

## 4. Lead kaynakları ve atıf (attribution)

### Yeni kaynaklar

| Kaynak | Nasıl |
|---|---|
| **Web sitesi sohbet widget'ı** | Tek satır JS; AI ajan cevaplar, lead + konuşma oluşur |
| **Web form oluşturucu** | Sürükle-bırak form, fotoğraf yükleme, gömülebilir veya bağımsız sayfa |
| **Instagram DM + Facebook Messenger** | Meta Graph API; tek gelen kutusunda WhatsApp ile birlikte |
| **WhatsApp tıklama reklamları (CTWA)** | Gelen mesajdaki reklam referansıyla kampanya/reklam atfı |
| **Arama takibi (call tracking)** | Kampanya başına sanal numara → gelen arama lead olur, kayıt + transkript |
| **Fiyat karşılaştırma siteleri** | WhatClinic, Bookimed, Dental Departures vb. → e-posta ayrıştırma veya API |
| **E-posta gelen kutusu** | info@ adresine gelen talepler lead'e dönüşür |
| **Randevu/ön görüşme sayfası** | Hastanın kendisi online ön görüşme saati seçer |
| **Hasta tavsiye programı** | Kişisel tavsiye linki (ref altyapısı mevcut) |
| **Landing page oluşturucu** | Kampanya başına hızlı sayfa (ör. "Almanya — All-on-4") |

### Atıf ve reklam verimliliği
- **İlk temas / son temas / çoklu temas** kaynağı, UTM'ler, reklam seti ve reklam adı.
- **Reklam harcaması içe aktarma** (Meta Ads, Google Ads, TikTok Ads API) → kampanya başına **lead maliyeti, hasta başına maliyet, ROAS**.
- **Dönüşüm geri bildirimi (Meta CAPI, Google Ads offline conversions):** "Nitelikli", "Teklif kabul", "Kapora ödendi" olayları reklam platformlarına geri gönderilir → algoritma ucuz lead yerine **gerçek hastaya** optimize eder. Diş turizmi reklamlarında en büyük verim artışı bu.

---

## 5. Yapay zekâ ajanları

### 5.1 Çalışma modları (klinik ve kanal bazında)
| Mod | Davranış |
|---|---|
| **Kapalı** | AI yok |
| **Asistan** | AI cevap taslağı hazırlar, temsilci onaylar/düzenler (varsayılan başlangıç) |
| **Otopilot — mesai dışı** | Temsilci çevrimdışıyken veya mesai dışında AI tam yetkili |
| **Otopilot — her zaman** | AI ilk temas ve nitelendirmeyi her zaman yapar, belirli noktalarda insana devreder |

"Temsilci yok" durumu otomatik algılanır: çevrimiçi temsilci yoksa, SLA aşılırsa veya klinik hiç temsilci tanımlamadıysa AI devralır.

### 5.2 Yazılı ajan (WhatsApp, Instagram, Messenger, web sohbet, e-posta, SMS)
- **Bilgi tabanı:** klinik katalog ve fiyat aralıkları, paketler, otel/transfer, ekip, sertifikalar, SSS, önce/sonra galerisi — mevcut "hasta sayfası içerikleri" ve katalogdan otomatik beslenir.
- **Görevleri:** karşılama, nitelendirme (tedavi ilgisi, eksik diş, zaman, bütçe, ülke), fotoğraf/panoramik isteme ve yükletme, sık soruları cevaplama, ön görüşme randevusu, teklif açılınca takip, itiraz karşılama, kapora linki gönderme.
- **CRM'e yazar:** lead alanlarını doldurur, aşamayı ilerletir, notu ve özeti zaman çizelgesine ekler, sıcaklık/puan verir.
- **İnsana devir tetikleyicileri:** tıbbi soru (teşhis gerektiren), pazarlık/indirim talebi, şikâyet veya öfke, "insanla konuşmak istiyorum", yüksek değerli lead (ör. All-on-4 çift çene), AI'nın emin olmadığı durumlar. Devirde temsilciye özet + önerilen sonraki adım gider.
- **Çok dilli:** hastanın yazdığı dilde cevap verir.

### 5.3 Sesli ajan (telefon)
- **Giden arama — hız (speed-to-lead):** yeni lead gelince **60 saniye içinde** arar, nitelendirir, WhatsApp'tan fotoğraf linki gönderir, randevu/takip ayarlar.
- **Takip aramaları:** teklif sonrası, cevapsız lead, recall, randevu teyidi, seyahat öncesi hatırlatma.
- **Gelen arama:** mesai dışı veya hat meşgulken cevaplar, lead oluşturur, acilse nöbetçiye aktarır.
- **Her arama:** kayıt, transkript, özet, sonuç (ulaşıldı/ulaşılamadı/geri ara/ilgisiz), sonraki adım otomatik CRM'e.
- **Temsilci için:** tarayıcıdan tek tıkla arama (WebRTC), kayıt ve AI özeti.

### 5.4 Temsilci yardımcısı (copilot)
- Cevap önerisi (hastanın dilinde), arama sonrası otomatik özet, "sıradaki en iyi aksiyon", lead puanı ve kapanma olasılığı, itiraz cevapları kütüphanesi.

### 5.5 Güvenlik kuralları (değiştirilemez)
- **AI olduğunu açıkça söyler** (AB Yapay Zekâ Yasası şeffaflık yükümlülüğü); hasta isterse insana aktarılır.
- **Teşhis koymaz, sonuç garanti etmez**; yasaklı pazarlama ifadeleri (mevcut kontrol) uygulanır.
- **Fiyat:** yalnızca katalogdaki aralıkları ve kliniğin izin verdiği kalıpları söyler; kesin fiyat teklifi hekim/temsilci onaylı tekliftir.
- **İletişim izni:** arama ve pazarlama mesajları için izin kaydı; ülke kuralları (GDPR, İngiltere PECR, ABD TCPA), arama saatleri, "beni arama" listesi, kayıt bildirimi.
- **Tıbbi veri:** yalnızca gerekli bilgi işlenir, model sağlayıcısında veri saklanmaz (sıfır saklama ayarı).

### 5.6 Teknik yaklaşım
- **Dil modeli:** Claude (konuşma ajanları için Sonnet sınıfı, sınıflandırma/özet için Haiku sınıfı), araç çağırma ile CRM işlemleri (lead güncelle, randevu öner, link gönder, devret).
- **Ses:** telefon sağlayıcısı (Twilio veya Telnyx — SIP/numara) + konuşma tanıma/sentez katmanı (ElevenLabs veya benzeri, düşük gecikmeli). Ajan mantığı ve CRM araçları bizde kalır; ses sağlayıcısı değiştirilebilir.
- **Maliyet:** klinik başına AI kullanım ölçümü (mesaj, dakika); plan kotası + aşım ücreti veya kliniğin kendi sağlayıcı anahtarı ("her klinik kendi mesajlaşma ücretini öder" kararıyla uyumlu).

---

## 6. Pazarlama

- **Segmentler:** kayıtlı görünümlerden dinamik listeler (ör. "Almanya, implant ilgili, 90 gün önce kaybedilmiş").
- **Toplu kampanyalar:** WhatsApp onaylı şablon ve e-posta; zamanlama, saat dilimi, kişiselleştirme, A/B, sonuç takibi (açıldı, cevap, randevu, ciro).
- **İzin merkezi:** kanal bazında opt-in/opt-out, kaynak ve tarihiyle kanıt; çıkış bağlantısı.
- **İçerik kütüphanesi:** önce/sonra, hasta videoları, tedavi açıklamaları — dizilerde ve AI cevaplarında kullanılır.
- **Yorum ve tavsiye motoru:** anket → yorum linki (mevcut) + tavsiye ödülü takibi.

---

## 7. Satış yönetimi ve raporlar

- **Temsilci paneli:** günlük hedefler, arama/mesaj sayısı, cevap süresi, dönüşüm, ciro, komisyon (mevcut).
- **Yönetici paneli:** SLA ihlalleri, speed-to-lead ortalaması, pipeline tahmini, kaynak/kampanya ROAS, **AI vs insan dönüşüm karşılaştırması**, kayıp nedenleri.
- **Mevcudiyet:** temsilci çevrimiçi/çevrimdışı/vardiya → atama ve AI devri buna göre.
- **Hedefler (quota):** temsilci/ekip başına aylık hedef ve ilerleme.

---

## 8. Diş kliniğine özel modüller (önceki öneriden)

| Modül | Satış/pazarlamayla bağlantısı |
|---|---|
| **Laboratuvar takibi** | Teslim gecikirse hasta yolculuğu pipeline'ında uyarı; vaka kârlılığı |
| **İmplant/malzeme izlenebilirliği** | Garanti belgesi ve implant kartı; marka bazlı satış raporu |
| **Garanti ve şikâyet** | Güven unsuru olarak teklif sayfasında; şikâyet → tedavi sonrası pipeline |
| **Tedavi sonrası takip** | Tedavi sonrası pipeline + hazır diziler (implant/kron/veneer) |
| **Almanya HKP belgesi** | Almanya kampanyalarında dönüşüm artırıcı |

---

## 9. Veri modeli (özet)

```
pipelines(id, clinic_id, kind, name, sort)
pipeline_stages(id, pipeline_id, key, name{çok dilli}, probability, sla_minutes, required_fields, on_enter jsonb, on_exit jsonb, sort, is_won, is_lost)
pipeline_items(id, pipeline_id, stage_id, entity[lead|deal|patient], entity_id, owner_id, entered_at, value_minor, status)
sequences(id, clinic_id, name, trigger, stop_conditions, settings{quiet_hours, timezone_mode, ab})
sequence_steps(id, sequence_id, order, kind, delay, channel, template_id, ai_instructions, condition)
sequence_enrollments(id, sequence_id, lead_id, step_index, next_run_at, status, variant)
recall_rules(id, clinic_id, trigger{tx/bundle}, after_days, sequence_id)
recalls(id, patient_id, rule_id, due_at, status, outcome)
consents(id, patient_id, channel, purpose, granted, source, at, evidence)
ai_agents(id, clinic_id, kind[text|voice], mode, channels[], persona, instructions, handoff_rules, hours)
ai_sessions(id, agent_id, lead_id, conversation_id|call_id, transcript, summary, outcome, tokens, cost_minor)
calls(id, clinic_id, lead_id, direction, from, to, provider_ref, recording_file_id, duration_s, by[user|ai], outcome, summary)
ad_accounts / ad_spend_daily(campaign, adset, ad, date, spend_minor, impressions, clicks)
conversion_events(lead_id, event, platform, sent_at, status)        -- Meta CAPI / Google offline
campaigns(id, segment_view_id, channel, template, schedule, stats)
lab_orders, implant_records, warranties, complaints               -- klinik modüller
```

---

## 10. Yol haritası (fazlar)

### Faz A — Temel (önce)
1. **Pipeline motoru** + mevcut lead/deal aşamalarının taşınması + kanban/forecast
2. **Takip dizisi motoru** (WhatsApp/e-posta/görev adımları, durdurma koşulları, sessiz saatler) + hazır diziler
3. **İzin merkezi** (opt-in/opt-out, kanıt) — AI ve kampanyalardan önce şart
4. **Recall motoru** + tedavi sonrası pipeline + hazır bakım dizileri
5. **Klinik modüller:** lab takibi, implant izlenebilirliği, garanti/şikâyet

### Faz B — Kaynaklar ve atıf
6. Web sohbet widget'ı + form oluşturucu
7. Instagram DM + Messenger (birleşik gelen kutusu), CTWA reklam atfı
8. Reklam harcaması içe aktarma + ROAS raporu
9. Meta CAPI / Google Ads dönüşüm geri bildirimi

### Faz C — Yazılı yapay zekâ
10. Bilgi tabanı (katalog + içerikler + SSS)
11. Asistan modu (taslak cevaplar, özetler, lead puanı)
12. Otopilot (nitelendirme, fotoğraf toplama, randevu, devir kuralları) — önce WhatsApp, sonra diğer kanallar
13. Dizilere "AI adımı"

### Faz D — Ses
14. Temsilci için tarayıcıdan arama + kayıt + AI özeti
15. AI giden arama (speed-to-lead, takip, recall, teyit)
16. AI gelen arama (mesai dışı), arama takibi numaraları

### Faz E — Pazarlama ve yönetim
17. Segment + toplu kampanya (WhatsApp/e-posta), A/B
18. Temsilci/yönetici panelleri, hedefler, AI vs insan raporu
19. Landing page oluşturucu, tavsiye programı, Almanya HKP

---

## 11. Başarı ölçütleri
- **Speed-to-lead:** ilk temas < 1 dk (AI ile), insan < 5 dk
- **Cevapsız lead oranı** %50 azalma (diziler + AI arama)
- **Lead → teklif** ve **teklif → kapora** dönüşümünde artış (kaynak/kampanya bazında izlenir)
- **Recall dönüşümü:** implant hastalarının ≥ %80'i 2. ziyarete döner
- **Reklam:** dönüşüm geri bildirimiyle hasta başına maliyette düşüş
- **Yorum:** tamamlanan hastaların ≥ %30'u yorum bırakır

---

## 12. Kararlar (kullanıcıdan)
1. Telefon/ses sağlayıcısı ve numara ülkeleri (klinik kendi hesabını mı bağlar, platform mu sağlar?)
2. AI otopilot varsayılanı ve AI'ın söyleyebileceği fiyat seviyesi (yalnız aralık mı, paket fiyatı da mı?)
3. Öncelikli yeni lead kaynakları
4. Faz sırası (önerilen: A → C → B → D → E; AI'ın erken değer üretmesi için C, B'den önce)

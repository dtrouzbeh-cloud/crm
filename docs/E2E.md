# Uçtan uca test (hasta yolculuğu)

`scripts/e2e/journey.ts` canlı bir sunucuya gerçek HTTP ile 109 adım çalıştırır: klinik kurulumu, 8 rollü ekip,
6 kaynaktan lead (imzalı WhatsApp/Instagram webhook, widget, landing, Google Ads, REST API), AI koç, anamnez,
OPG yükleme + AI ön değerlendirme, plan kuralları, 3 seçenekli teklif + indirim onayı, hasta sayfası canlı izleme,
kabul, havale kaporası, seyahat/transfer, randevu, lab, implant lotları, revizyon, fatura, komisyon, recall,
garanti, NPS, şikâyet, kampanya, ROAS, raporlar, kiracı izolasyonu.

## Çalıştırma (sunucuda, üretime dokunmaz)
Test örneği ayrı veritabanı (`dentaflow_e2e`), ayrı klasör (`/opt/dentaflow/e2e-app`) ve 4199 portunu kullanır.

```bash
rsync -a --delete --exclude node_modules --exclude .git --exclude .env ./ root@SUNUCU:/opt/dentaflow/e2e-app/
ssh root@SUNUCU 'E2E_APP=/opt/dentaflow/e2e-app bash /opt/dentaflow/e2e-app/scripts/e2e/run.sh /tmp/opg.jpg'
```

- Rapor: `/tmp/df-e2e/report.json`; API ve işçi günlükleri aynı klasörde.
- `E2E_KEEP=1` örneği açık bırakır (arayüz kontrolü için `ssh -L 4199:127.0.0.1:4199`).
- Gerçek AI kullanılır (platform anahtarı); bir çalıştırma ≈ 0,5 USD.
- WhatsApp gönderimleri sahte hesap yüzünden Meta'da reddedilir; bu beklenen bir durumdur.

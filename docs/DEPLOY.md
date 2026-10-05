# Dağıtım ve İşletim

## Canlı ortam
- **URL:** https://crm.188-132-215-179.sslip.io (gerçek alan adı alınınca değişecek)
- **Sunucu:** VPS (Ubuntu 24.04), Node 24, PostgreSQL 17, nginx + Let's Encrypt
- **Servisler:** `dentaflow-api` (API + web), `dentaflow-worker` (iş akışları, webhook'lar, e-posta, otomatik yanıtlar)
- **Dizinler:** `/opt/dentaflow/app` (kod), `/opt/dentaflow/.env` (gizli ayarlar), `/opt/dentaflow/storage` (dosyalar), `/opt/dentaflow/backups` (yedekler)

## Dağıtım
```bash
./scripts/deploy.sh
```
Web'i derler, kodu rsync ile gönderir, bağımlılıkları kurar, migration'ları uygular, servisleri yeniden başlatır ve sağlık kontrolü yapar.

## Yedekler
- Her gece 03:30: `pg_dump` (custom format) + dosya deposu → `/opt/dentaflow/backups`, 14 gün saklama
- Offsite kopya için `/opt/dentaflow/offsite.sh` oluşturun (ör. `rclone copy "$1" remote:dentaflow`)
- Geri yükleme: `cat db-XXXX.dump | sudo -u postgres pg_restore -d dentaflow --clean --no-owner`

## Ortam değişkenleri (opsiyonel entegrasyonlar)
| Değişken | Amaç |
|---|---|
| `RESEND_API_KEY` | E-posta gönderimi (davet, şifre sıfırlama, teklif e-postası) |
| `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_ES_CONFIG_ID` | WhatsApp Embedded Signup, WhatsApp webhook, Meta Lead Ads |
| `PLATFORM_STRIPE_SECRET`, `PLATFORM_STRIPE_WEBHOOK_SECRET` | Kliniklerden SaaS abonelik tahsilatı |

Webhook adresleri:
- WhatsApp: `https://<alan>/api/public/wa/webhook`
- Meta Lead Ads: `https://<alan>/api/public/meta/leads`
- Abonelik (Stripe): `https://<alan>/api/public/billing/stripe/webhook`
- Klinik ödemeleri (Stripe): `https://<alan>/api/public/pay/stripe/webhook`

## Bölge taşıma (AB/ABD)
1. Yeni sunucuda Node 24 + PostgreSQL 17 kurun, roller ve veritabanını oluşturun.
2. Son yedeği geri yükleyin, `storage` arşivini açın, `.env`'i kopyalayın.
3. `DEPLOY_HOST=root@yeni-sunucu ./scripts/deploy.sh` ve DNS'i yönlendirin.

## Geliştirme
```bash
npm install
cp .env.example .env   # veritabanı bilgileri
npm run migrate
npm run dev:api        # :4100
npm run dev:web        # :5173 (API'ye proxy)
npm test
```

## CI
`ci/github-actions.yml` hazır. GitHub erişim anahtarında `workflow` yetkisi olmadığı için `.github/workflows/ci.yml` olarak gönderilemedi. Etkinleştirmek için dosyayı GitHub web arayüzünden `.github/workflows/ci.yml` olarak ekleyin ya da `gh auth refresh -s workflow` çalıştırıp taşıyın.

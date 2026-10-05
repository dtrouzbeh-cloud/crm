# DentaFlow CRM — Prototip

Diş klinikleri için CRM prototipi: lead → vaka → şematik tedavi planı → çok seçenekli teklif → hasta onayı → deal → ziyaret/tahsilat.

- **Tek dosya:** `index.html` — build aracı, framework veya sunucu gerekmez; tarayıcıda açın.
- **Veri:** tarayıcının `localStorage`'ında tutulur (demo verisiyle gelir; Ayarlar → "Demo verisini sıfırla").
- **Diller:** TR / EN / DE / AR (RTL). Açık/koyu tema.

## Yapı
| Dosya | İçerik |
|---|---|
| `src/a_shell.html` | HTML iskeleti ve CSS (tasarım token'ları) |
| `src/b_i18n.js` | Çeviri sözlüğü |
| `src/c_data.js` | Tedavi kataloğu (38 tedavi, 11 paket), demo verisi, store, iş akışları |
| `src/e_chart.js` | Parametrik SVG diş şeması (FDI / Universal / Palmer) |
| `src/f_engine.js` | Plan genişletme, klinik kural motoru, akıllı öneri, fiyat hesabı, teklif → deal |
| `src/g1_views.js` | Kabuk, pano, lead'ler, görevler, deal board |
| `src/g2_case.js` | Vaka listesi ve 4 adımlı vaka sihirbazı |
| `src/h_doc.js` | Teklif dokümanı, hasta sayfası, PDF, teklif listesi |
| `src/i_app.js` | Katalog, ayarlar, router, açılış |

Değişiklikten sonra `./build.sh` ile `index.html` yeniden üretilir.

## Kapsam dışı (asıl projede)
Backend (Node + PostgreSQL + RLS), gerçek kimlik doğrulama/MFA, WhatsApp/Meta entegrasyonları, ödeme sağlayıcıları, AI, resepsiyon/seyahat modülleri.

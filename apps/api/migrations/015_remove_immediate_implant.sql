-- "Anında implant" seçeneği kaldırıldı: mevcut kliniklerin kataloğunda pasife alınır (geçmiş teklif/deal kayıtları snapshot'ta korunur)
update treatment_types set active = false where code = 'implant_imm';
-- kural ayarlarından E1 (çekim + implant → anında implant önerisi) temizlenir
update clinics set settings = jsonb_set(settings, '{rules}', (settings->'rules') - 'E1') where settings ? 'rules' and settings->'rules' ? 'E1';

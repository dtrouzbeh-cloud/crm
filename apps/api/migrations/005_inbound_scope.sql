-- Gelen olay tekrar kontrolü klinik bazında olmalı (farklı kliniklerin aynı harici kimliği olabilir)
alter table inbound_events drop constraint if exists inbound_events_source_external_id_key;
create unique index if not exists inbound_events_clinic_source_ext on inbound_events (clinic_id, source, external_id);

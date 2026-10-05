-- Hasta tavsiye programı: tavsiye eden hasta = 'referrer' iş ortağı; sabit ödül (ilk tahsilatta bir kez)
alter table partners add column patient_id uuid references patients(id) on delete set null;
alter table partners add column reward_minor bigint;
alter table partners add column reward_currency text;
create unique index partners_patient on partners (clinic_id, patient_id) where patient_id is not null;

-- Özel alanlar (deal'e de), kayıtlı görünümler (paylaşım/varsayılan), hasta birleştirme izi
alter table deals add column custom jsonb not null default '{}';
alter table custom_fields add column active boolean not null default true;
alter table custom_fields add column show_in_list boolean not null default false;
alter table saved_views add column shared boolean not null default false;
alter table saved_views add column sort int not null default 0;
alter table patients add column merged_into uuid references patients(id) on delete set null;
create index if not exists leads_custom on leads using gin (custom jsonb_path_ops);
create table patient_merges (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kept_id uuid not null references patients(id) on delete cascade,
  merged_id uuid not null,                     -- silinen kaydın kimliği (iz için)
  snapshot jsonb not null,                     -- birleştirilen hastanın önceki hali
  moved jsonb not null default '{}',           -- tablo → taşınan satır sayısı
  user_id uuid references users(id),
  at timestamptz not null default now()
);
select enable_tenant_rls('patient_merges'::regclass);
grant select, insert, update, delete on patient_merges to dentaflow_app;

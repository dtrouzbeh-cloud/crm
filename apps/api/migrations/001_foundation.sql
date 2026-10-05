-- DentaFlow 001 — platform, kimlik, yetki, denetim, CRM çekirdeği, görevler, sistem
-- Kural: klinik verisi taşıyan her tabloda clinic_id + RLS (tenant izolasyonu).
-- Uygulama rolü (dentaflow_app) RLS'e tabidir; owner rolü migration ve platform işleri içindir.

create extension if not exists citext;

-- Aktif klinik: her istekte `select set_config('app.clinic_id', $1, true)` ile atanır
create or replace function app_clinic() returns uuid language sql stable as
$$ select nullif(current_setting('app.clinic_id', true), '')::uuid $$;

create or replace function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;

-- RLS'i tek satırda kurmak için yardımcı
create or replace function enable_tenant_rls(tbl regclass) returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('drop policy if exists tenant_isolation on %s', tbl);
  execute format('create policy tenant_isolation on %s using (clinic_id = app_clinic()) with check (clinic_id = app_clinic())', tbl);
end $$;

-- ───────────────────────── PLATFORM ─────────────────────────
create table plans (
  id text primary key,                        -- 'starter' | 'pro' | 'enterprise'
  name text not null,
  currency text not null default 'USD',
  clinic_price_minor int not null,            -- hibrit fiyat: klinik başına sabit
  seat_price_minor int not null,              -- + kullanıcı başına
  yearly_discount_bps int not null default 1700,
  included_seats int not null default 0,
  limits jsonb not null default '{}',          -- {quotesPerMonth, waNumbers, leadForms, storageGb}
  features text[] not null default '{}',
  active boolean not null default true,
  sort int not null default 0
);

create table clinics (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique,
  name text not null,
  legal_name text,
  country text not null default 'TR',
  city text, address text, phone text, email citext, website text, tax_id text,
  logo_file_id uuid,
  brand_color text not null default '#0E7C86',
  default_currency text not null default 'EUR',
  currencies text[] not null default '{EUR,USD,GBP,TRY}',
  languages text[] not null default '{en,tr,de,ar}',
  default_language text not null default 'en',
  timezone text not null default 'Europe/Istanbul',
  tooth_numbering text not null default 'FDI' check (tooth_numbering in ('FDI','UNIVERSAL','PALMER')),
  settings jsonb not null default '{}',        -- teklif varsayılanları, indirim limitleri, kayıp nedenleri, kanallar…
  status text not null default 'trial' check (status in ('trial','active','past_due','suspended','canceled')),
  region text not null default 'tr-1',         -- bölge bağımsızlık için: verinin barındığı bölge
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clinics_touch before update on clinics for each row execute function touch_updated_at();

create table subscriptions (
  clinic_id uuid primary key references clinics(id) on delete cascade,
  plan_id text not null references plans(id),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','canceled')),
  billing_period text not null default 'monthly' check (billing_period in ('monthly','yearly')),
  seats int not null default 1,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  provider text,                                -- 'stripe' | 'iyzico' | 'manual'
  provider_customer_id text, provider_subscription_id text,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ───────────────────────── KİMLİK ─────────────────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null,
  password_hash text,
  locale text not null default 'tr',
  avatar_file_id uuid,
  phone text,
  mfa_secret_enc text,                          -- şifreli TOTP sırrı
  mfa_enabled boolean not null default false,
  is_platform_admin boolean not null default false,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null,                           -- admin|manager|sales|dentist|coordinator|reception|translator|accounting
  permission_overrides jsonb not null default '{}',
  title text,
  languages text[] not null default '{}',
  availability text not null default 'auto',
  reports_to uuid references users(id),
  can_own_leads boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);
create index on memberships(user_id);

create table role_permissions (
  clinic_id uuid not null references clinics(id) on delete cascade,
  role text not null,
  permissions jsonb not null,                   -- klinik özelleştirmesi (varsayılan kodda)
  primary key (clinic_id, role)
);

create table sessions (
  id text primary key,                          -- token'ın sha256 hash'i
  user_id uuid not null references users(id) on delete cascade,
  clinic_id uuid references clinics(id) on delete set null,
  mfa_passed boolean not null default false,
  ip inet, user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  impersonated_by uuid references users(id)
);
create index on sessions(user_id);

create table invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  email citext not null,
  role text not null,
  token_hash text not null unique,
  invited_by uuid references users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table auth_tokens (                      -- şifre sıfırlama, e-posta doğrulama
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table login_events (
  id bigint generated always as identity primary key,
  user_id uuid references users(id) on delete cascade,
  email citext, success boolean not null, reason text,
  ip inet, user_agent text, at timestamptz not null default now()
);

-- ───────────────────────── SİSTEM ─────────────────────────
create table clinic_counters (
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  value bigint not null default 0,
  primary key (clinic_id, name)
);
-- insan okunur numaralar (L-1042, Q-2026-0007…)
create or replace function next_number(p_clinic uuid, p_name text) returns bigint language sql as $$
  insert into clinic_counters(clinic_id, name, value) values (p_clinic, p_name, 1)
  on conflict (clinic_id, name) do update set value = clinic_counters.value + 1
  returning value $$;

create table audit_events (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,                          -- 'lead.create', 'quote.send', 'deal.payment.record'…
  entity text, entity_id text,
  data jsonb,
  ip inet, at timestamptz not null default now()
);
create index on audit_events(clinic_id, at desc);
create index on audit_events(clinic_id, entity, entity_id);

create table files (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null,                            -- photo|xray|passport|ticket|document|logo|media|pdf
  name text not null, mime text not null, size_bytes bigint not null,
  storage_key text not null,                     -- depolama sürücüsündeki anahtar (disk / S3)
  sha256 text,
  entity text, entity_id uuid,
  uploaded_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index on files(clinic_id, entity, entity_id);

-- İş kuyruğu: SKIP LOCKED ile çalışan basit, dayanıklı kuyruk
create table jobs (
  id bigint generated always as identity primary key,
  clinic_id uuid references clinics(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 8,
  locked_at timestamptz, locked_by text,
  last_error text,
  done_at timestamptz,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index jobs_ready on jobs(run_at) where done_at is null;

-- Olay çıkış kutusu: entegrasyonlar, giden webhook'lar, bildirimler buradan beslenir
create table outbox_events (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  type text not null,                            -- 'lead.created', 'quote.accepted', 'payment.succeeded'…
  entity_id text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz
);
create index outbox_pending on outbox_events(id) where dispatched_at is null;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null, body text,
  link text,
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications(user_id, created_at desc);

-- ───────────────────────── CRM ─────────────────────────
create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  number bigint not null,
  full_name text not null,
  phone text,                                    -- E.164
  phone_alt text,
  email citext,
  country text, city text,
  language text,
  timezone text,
  birth_year int, gender text,
  wa_id text,                                    -- WhatsApp kimliği
  marketing_consent boolean not null default false,
  consent_at timestamptz,
  external_ids jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, number)
);
create index on patients(clinic_id, phone);
create index on patients(clinic_id, email);
create index on patients(clinic_id, wa_id);
create index patients_search on patients using gin (to_tsvector('simple', coalesce(full_name,'') || ' ' || coalesce(phone,'') || ' ' || coalesce(email::text,'')));
create trigger patients_touch before update on patients for each row execute function touch_updated_at();

create table medical_profiles (
  patient_id uuid primary key references patients(id) on delete cascade,
  clinic_id uuid not null references clinics(id) on delete cascade,
  flags text[] not null default '{}',            -- diabetes|anticoag|bisph|pregnant|chemo|smoker|heart|allergy…
  age int,
  medications text,
  allergies text,
  notes text,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  number bigint not null,
  patient_id uuid not null references patients(id) on delete cascade,
  stage text not null default 'new',             -- new|contacted|interested|… (türetilmiş görünüm ayrıca hesaplanır)
  temperature text not null default 'warm' check (temperature in ('hot','warm','cold')),
  source text not null default 'manual',
  campaign text, ad_set text, ad_name text, form_name text,
  utm jsonb not null default '{}',
  owner_id uuid references users(id),
  interest text,
  budget text,
  travel_window text,
  issue text,
  lost_reason text, lost_note text,
  next_follow_up_at timestamptz,
  first_response_at timestamptz,
  last_activity_at timestamptz not null default now(),
  contact_attempts int not null default 0,
  tags text[] not null default '{}',
  custom jsonb not null default '{}',
  external_ids jsonb not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, number)
);
create index on leads(clinic_id, stage);
create index on leads(clinic_id, owner_id);
create index on leads(clinic_id, last_activity_at desc);
create index on leads(patient_id);
create trigger leads_touch before update on leads for each row execute function touch_updated_at();

-- Lead zaman çizelgesi: not, arama, mesaj, durum değişimi, sistem olayları
create table lead_events (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  type text not null,                            -- note|call|email|whatsapp|stage|assign|case|quote|deal|payment|system
  body text,
  data jsonb not null default '{}',
  user_id uuid references users(id) on delete set null,
  at timestamptz not null default now()
);
create index on lead_events(lead_id, at desc);

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,  -- null = herkese açık
  entity text not null,
  name text not null,
  filters jsonb not null,
  created_at timestamptz not null default now()
);

create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  entity text not null,                          -- lead|deal|case
  key text not null,
  label jsonb not null,                          -- çok dilli
  type text not null,                            -- text|number|date|select|multiselect|boolean
  options jsonb not null default '[]',
  required boolean not null default false,
  sort int not null default 0,
  unique (clinic_id, entity, key)
);

-- ───────────────────────── GÖREVLER ─────────────────────────
create table tasks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  title text not null,
  description text,
  type text not null default 'general',          -- call|follow_up|whatsapp|email|payment|general|meeting
  priority text not null default 'med' check (priority in ('low','med','high')),
  due_at timestamptz not null,
  done_at timestamptz,
  snoozed_until timestamptz,
  lead_id uuid references leads(id) on delete cascade,
  entity text, entity_id uuid,                   -- vaka / deal / teklif bağlantısı
  assignee_id uuid references users(id) on delete set null,
  created_by uuid references users(id) on delete set null,
  source_rule_id uuid,
  recurrence text,
  created_at timestamptz not null default now()
);
create index on tasks(clinic_id, assignee_id, due_at) where done_at is null;
create index on tasks(lead_id);

create table workflow_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  trigger jsonb not null,                        -- {event:'lead.stage', stage:'interested'}
  conditions jsonb not null default '[]',
  actions jsonb not null,                        -- [{type:'task', title, dueHours, priority, assign:'owner'}]
  active boolean not null default true,
  runs int not null default 0,
  created_at timestamptz not null default now()
);

create table workflow_runs (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  rule_id uuid not null references workflow_rules(id) on delete cascade,
  event_id bigint, status text not null, detail jsonb, at timestamptz not null default now()
);

-- ───────────────────────── RLS ─────────────────────────
select enable_tenant_rls(t::regclass) from unnest(array[
  'memberships','role_permissions','invites','audit_events','files','notifications','patients','medical_profiles',
  'leads','lead_events','saved_views','custom_fields','tasks','workflow_rules','workflow_runs','outbox_events','clinic_counters'
]) as t;

-- clinics: uygulama rolü yalnızca aktif kliniği görür
alter table clinics enable row level security;
create policy own_clinic on clinics using (id = app_clinic()) with check (id = app_clinic());
alter table subscriptions enable row level security;
create policy own_sub on subscriptions using (clinic_id = app_clinic());

-- Uygulama rolü yetkileri
grant usage on schema public to dentaflow_app;
grant select, insert, update, delete on all tables in schema public to dentaflow_app;
grant usage, select on all sequences in schema public to dentaflow_app;
grant execute on all functions in schema public to dentaflow_app;
alter default privileges in schema public grant select, insert, update, delete on tables to dentaflow_app;
alter default privileges in schema public grant usage, select on sequences to dentaflow_app;
alter default privileges in schema public grant execute on functions to dentaflow_app;

-- Planlar (hibrit: klinik + koltuk, USD, aylık)
insert into plans(id, name, clinic_price_minor, seat_price_minor, included_seats, limits, features, sort) values
 ('starter','Starter', 4900, 2900, 2, '{"quotesPerMonth":100,"waNumbers":1,"leadForms":2,"storageGb":10}', '{crm,cases,quotes,payments}', 1),
 ('pro','Pro', 9900, 3900, 3, '{"quotesPerMonth":1000,"waNumbers":3,"leadForms":-1,"storageGb":50}', '{crm,cases,quotes,payments,whatsapp,integrations,operations,reports}', 2),
 ('enterprise','Enterprise', 29900, 4900, 10, '{"quotesPerMonth":-1,"waNumbers":-1,"leadForms":-1,"storageGb":500}', '{crm,cases,quotes,payments,whatsapp,integrations,operations,reports,custom_domain,sso,api}', 3);

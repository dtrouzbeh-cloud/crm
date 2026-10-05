-- DentaFlow 004 — WhatsApp / omnichannel mesajlaşma, entegrasyon merkezi, API anahtarları, webhook'lar, içe aktarma

-- ───────────── MESAJLAŞMA ─────────────
create table channel_accounts (                    -- WhatsApp numarası, Instagram hesabı, Messenger sayfası, e-posta kutusu
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','instagram','messenger','email','sms','telegram')),
  name text not null,
  external_id text not null,                        -- WA phone_number_id, IG account id…
  waba_id text, phone text,
  access_token_enc text,                            -- kliniğin kendi sistem kullanıcısı token'ı (şifreli)
  config jsonb not null default '{}',               -- {coexistence, routing, workingHours, autoReply…}
  status text not null default 'connected' check (status in ('connected','pending','error','disconnected')),
  last_error text, last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  unique (channel, external_id)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  account_id uuid not null references channel_accounts(id) on delete cascade,
  channel text not null,
  contact_id text not null,                         -- wa_id / igsid
  contact_name text,
  patient_id uuid references patients(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  assignee_id uuid references users(id) on delete set null,
  status text not null default 'open' check (status in ('open','pending','closed')),
  starred boolean not null default false,
  unread int not null default 0,
  last_message_at timestamptz, last_inbound_at timestamptz,   -- 24 saat penceresi için
  last_preview text,
  created_at timestamptz not null default now(),
  unique (account_id, contact_id)
);
create index on conversations(clinic_id, last_message_at desc);

create table messages (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out','note')),
  type text not null default 'text',                -- text|image|document|audio|video|template|location|reaction|system
  body text, media jsonb, template jsonb,
  external_id text,                                 -- wamid
  status text not null default 'sent',              -- queued|sent|delivered|read|failed|received
  error text,
  user_id uuid references users(id) on delete set null,
  idempotency_key text,
  at timestamptz not null default now(),
  unique (conversation_id, external_id),
  unique (conversation_id, idempotency_key)
);
create index on messages(conversation_id, id desc);

create table message_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  account_id uuid references channel_accounts(id) on delete cascade,
  name text not null, language text not null, category text not null default 'UTILITY',
  components jsonb not null default '[]',
  status text not null default 'draft',             -- draft|PENDING|APPROVED|REJECTED
  external_id text,
  updated_at timestamptz not null default now(),
  unique (clinic_id, name, language)
);
create table canned_replies (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  title text not null, body text not null, language text, shortcut text,
  created_at timestamptz not null default now()
);

-- ───────────── ENTEGRASYON MERKEZİ ─────────────
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  prefix text not null,                             -- görüntüleme için ilk 8 karakter
  key_hash text not null unique,
  scopes text[] not null default '{leads:write}',
  last_used_at timestamptz, revoked_at timestamptz,
  created_by uuid references users(id), created_at timestamptz not null default now()
);

create table integrations (                         -- Meta Lead Ads, TikTok, Google, GHL, Zoho, HubSpot, genel webhook alıcıları
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null,                               -- meta_leads|tiktok_leads|google_leads|ghl|zoho|hubspot|inbound_webhook
  name text not null,
  credentials_enc text,
  config jsonb not null default '{}',               -- form eşlemeleri, alan eşlemeleri, varsayılan kaynak/sahip…
  inbound_token text unique,                        -- genel webhook alıcısı için gizli URL parçası
  status text not null default 'configured' check (status in ('configured','connected','healthy','error','disabled')),
  last_sync_at timestamptz, last_error text, stats jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table webhook_endpoints (                    -- giden webhook abonelikleri (Zapier/Make/özel sistemler)
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  url text not null,
  events text[] not null default '{*}',
  secret text not null,
  active boolean not null default true,
  failures int not null default 0, last_status int, last_at timestamptz,
  created_at timestamptz not null default now()
);
create table webhook_deliveries (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  endpoint_id uuid not null references webhook_endpoints(id) on delete cascade,
  event_id bigint, event_type text not null, status int, response text, duration_ms int, attempt int not null default 1,
  at timestamptz not null default now()
);

create table inbound_events (                       -- dış sistemlerden gelen ham veri (idempotent + yeniden işleme)
  id bigint generated always as identity primary key,
  clinic_id uuid references clinics(id) on delete cascade,
  source text not null, external_id text, payload jsonb not null,
  status text not null default 'received', error text, result jsonb,
  received_at timestamptz not null default now(),
  unique (source, external_id)
);

create table import_runs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null default 'leads', file_name text, mapping jsonb not null default '{}',
  total int not null default 0, created int not null default 0, updated int not null default 0, skipped int not null default 0, errors jsonb not null default '[]',
  status text not null default 'preview', created_ids uuid[] not null default '{}',
  created_by uuid references users(id), created_at timestamptz not null default now(), undone_at timestamptz
);

select enable_tenant_rls(t::regclass) from unnest(array['channel_accounts','conversations','messages','message_templates','canned_replies','api_keys','integrations','webhook_endpoints','webhook_deliveries','import_runs']) as t;
alter table inbound_events enable row level security;
create policy tenant_isolation on inbound_events using (clinic_id = app_clinic()) with check (clinic_id = app_clinic());
grant select, insert, update, delete on all tables in schema public to dentaflow_app;
grant usage, select on all sequences in schema public to dentaflow_app;

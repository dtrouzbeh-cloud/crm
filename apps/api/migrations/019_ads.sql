-- Reklam harcaması (Meta API senkron + CSV) ve dönüşüm geri bildirimi (Meta CAPI) kayıtları
create table ad_spend (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  platform text not null check (platform in ('meta','google','tiktok','other')),
  day date not null,
  campaign text not null,
  spend_minor bigint not null default 0, currency text not null,
  impressions bigint not null default 0, clicks bigint not null default 0, platform_leads int not null default 0,
  source text not null default 'csv',          -- api|csv|manual
  updated_at timestamptz not null default now(),
  unique (clinic_id, platform, day, campaign)
);
create index ad_spend_q on ad_spend (clinic_id, day);
create table conversion_events (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  platform text not null check (platform in ('meta','google')),
  event text not null,                         -- Lead|QualifiedLead|Schedule|Purchase…
  value_minor bigint, currency text,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  response jsonb, error text,
  created_at timestamptz not null default now(), sent_at timestamptz,
  unique (lead_id, platform, event)
);
select enable_tenant_rls(t::regclass) from unnest(array['ad_spend','conversion_events']) as t;
grant select, insert, update, delete on ad_spend, conversion_events to dentaflow_app;
grant usage, select on all sequences in schema public to dentaflow_app;

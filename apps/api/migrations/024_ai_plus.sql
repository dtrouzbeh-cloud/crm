-- AI+ : klinik anahtar kasası, canlı satış koçu içgörüleri, canlı teklif takibi, lead puanı, AI raporları, fotoğraftan ön değerlendirme
create table clinic_secrets (
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,                          -- anthropic | stt | resend | twilio …
  value_enc text not null,                     -- şifreli JSON
  meta jsonb not null default '{}',            -- gizli olmayan alanlar (sağlayıcı, gönderen adres, numara…)
  updated_by uuid references users(id), updated_at timestamptz not null default now(),
  primary key (clinic_id, name)
);
alter table ai_agents add column features jsonb not null default '{"coach":true,"translate":true,"scoring":true}';

create table conv_insights (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  message_id bigint,
  lang text, translation text,                 -- hastanın son mesaj(lar)ının klinik diline çevirisi
  intent text, objection text, sentiment text, urgency text,
  tactic text,                                 -- önerilen yaklaşım (klinik dilinde)
  suggestions jsonb not null default '[]',     -- [{label, text, gloss}]
  created_at timestamptz not null default now()
);
create index conv_insights_conv on conv_insights (conversation_id, id desc);
create index conv_insights_obj on conv_insights (clinic_id, created_at) where objection is not null;

create table quote_live (
  quote_id uuid primary key references quotes(id) on delete cascade,
  clinic_id uuid not null references clinics(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  last_ping timestamptz not null default now(),
  session_started timestamptz not null default now(),
  sessions int not null default 1,
  seconds_total int not null default 0,
  option_seconds jsonb not null default '{}',  -- {"0": 42, "1": 130}
  section_seconds jsonb not null default '{}', -- {"plan": 30, "price": 95, "payment": 12}
  current_option int, current_section text
);
create index quote_live_ping on quote_live (clinic_id, last_ping desc);

alter table leads add column score int;
alter table leads add column score_reasons jsonb;
alter table leads add column scored_at timestamptz;
create index leads_score on leads (clinic_id, score desc nulls last) where archived_at is null;

create table ai_reports (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('loss','qa')),
  user_id uuid references users(id) on delete cascade,   -- qa: değerlendirilen temsilci
  period_from date, period_to date,
  body text not null, data jsonb not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index ai_reports_q on ai_reports (clinic_id, kind, created_at desc);

alter table cases add column ai_assessment jsonb;

select enable_tenant_rls(t::regclass) from unnest(array['clinic_secrets','conv_insights','quote_live','ai_reports']) as t;
grant select, insert, update, delete on clinic_secrets, conv_insights, quote_live, ai_reports to dentaflow_app;
grant usage, select on all sequences in schema public to dentaflow_app;

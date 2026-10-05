-- Yapay zekâ: ajan yapılandırması, bilgi tabanı, oturumlar, taslaklar (asistan modu), kullanım ölçümü
create table ai_agents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','voice')),
  name text not null default 'Asistan',
  mode text not null default 'off' check (mode in ('off','assist','auto_offhours','auto_always')),
  channels text[] not null default '{whatsapp}',
  persona text,                                -- ton/kişilik
  instructions text,                           -- kliniğe özel talimatlar
  price_policy text not null default 'ranges' check (price_policy in ('none','ranges','packages')),
  handoff jsonb not null default '{}',         -- {keywords[], highValue: true, onMedical: true, maxTurns}
  hours jsonb not null default '{}',           -- {start, end, days[]} klinik saat diliminde — mesai dışı modu için
  model text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, kind)
);
create trigger ai_agents_touch before update on ai_agents for each row execute function touch_updated_at();

create table ai_kb (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  title text not null, body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table ai_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  agent_id uuid references ai_agents(id) on delete set null,
  conversation_id uuid references conversations(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  status text not null default 'active' check (status in ('active','handed_off','closed')),
  turns int not null default 0,
  disclosed boolean not null default false,
  handoff_reason text, summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ai_sessions_conv on ai_sessions (conversation_id) where status = 'active';

create table ai_drafts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  body text not null,
  status text not null default 'pending' check (status in ('pending','used','discarded')),
  created_at timestamptz not null default now()
);

create table ai_usage (
  clinic_id uuid not null references clinics(id) on delete cascade,
  day date not null default current_date,
  purpose text not null,                       -- reply|draft|sequence|summary|suggest|test
  calls int not null default 0, tokens_in bigint not null default 0, tokens_out bigint not null default 0, cost_micro bigint not null default 0,
  primary key (clinic_id, day, purpose)
);

alter table messages add column ai boolean not null default false;
alter table conversations add column ai_paused boolean not null default false;

select enable_tenant_rls(t::regclass) from unnest(array['ai_agents','ai_kb','ai_sessions','ai_drafts','ai_usage']) as t;
grant select, insert, update, delete on ai_agents, ai_kb, ai_sessions, ai_drafts, ai_usage to dentaflow_app;

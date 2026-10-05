-- Recall motoru: tedaviye göre kurallar, planlanan recall'lar (vadesi gelince recall pipeline'ına düşer)
create table recall_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  match text[] not null default '{}',          -- tedavi/paket kimlikleri; boş = her tamamlanan tedavi
  after_days int not null check (after_days between 1 and 3650),
  repeat_days int check (repeat_days between 30 and 3650),
  sequence_id uuid references sequences(id) on delete set null,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create table recalls (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  rule_id uuid references recall_rules(id) on delete set null,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','active','done','canceled')),
  item_id uuid references pipeline_items(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz, closed_at timestamptz
);
create index recalls_due on recalls (due_at) where status = 'scheduled';
create index recalls_lead on recalls (clinic_id, lead_id);
create unique index recalls_once on recalls (deal_id, rule_id) where deal_id is not null and status in ('scheduled','active');
select enable_tenant_rls(t::regclass) from unnest(array['recall_rules','recalls']) as t;
grant select, insert, update, delete on recall_rules, recalls to dentaflow_app;

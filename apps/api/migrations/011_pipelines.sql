-- Pipeline motoru: klinik tanımlı çoklu pipeline ve aşamalar, aşama geçmişi (analitik), SLA takibi
create table pipelines (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('sales','nurture','aftercare','recall','custom')),
  name jsonb not null,                         -- {default, tr, en…}
  color text not null default '#0E7C86',
  sort int not null default 0,
  active boolean not null default true,
  settings jsonb not null default '{}',        -- {autoAddOn: 'lead.lost'|'deal.won'…}
  created_at timestamptz not null default now()
);
create unique index pipelines_one_sales on pipelines (clinic_id) where kind = 'sales';

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  key text not null,                           -- satış pipeline'ında leads.stage değeri
  name jsonb not null,
  color text not null default '#94A3B8',
  probability int not null default 0 check (probability between 0 and 100),
  sla_minutes int,                             -- bu aşamada en fazla bekleme
  is_won boolean not null default false, is_lost boolean not null default false,
  system boolean not null default false,       -- sistem aşaması: silinemez, anahtarı değişmez
  hidden boolean not null default false,
  sort int not null default 0,
  unique (pipeline_id, key)
);

create table pipeline_items (                  -- satış dışındaki pipeline'larda kayıtlar (satış = leads tablosu)
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  stage_id uuid not null references pipeline_stages(id),
  lead_id uuid not null references leads(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  owner_id uuid references users(id) on delete set null,
  status text not null default 'open' check (status in ('open','won','lost','archived')),
  value_minor bigint not null default 0, currency text,
  note text,
  due_at timestamptz,                          -- ör. recall vadesi
  stage_entered_at timestamptz not null default now(),
  sla_breached_at timestamptz,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index pipeline_items_open on pipeline_items (pipeline_id, lead_id) where status = 'open';
create index pipeline_items_board on pipeline_items (clinic_id, pipeline_id, status, stage_id);

create table stage_history (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  pipeline_kind text not null,
  item_id uuid,                                -- pipeline_items.id (satışta null)
  lead_id uuid not null references leads(id) on delete cascade,
  from_stage text, to_stage text not null,
  seconds_in_prev bigint,
  at timestamptz not null default now()
);
create index stage_history_q on stage_history (clinic_id, pipeline_kind, at);

alter table leads add column stage_entered_at timestamptz not null default now();
alter table leads add column sla_breached_at timestamptz;

-- satış: leads.stage hangi yoldan değişirse değişsin geçmiş + giriş zamanı tutulur
create or replace function lead_stage_track() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into stage_history (clinic_id, pipeline_kind, lead_id, from_stage, to_stage) values (new.clinic_id, 'sales', new.id, null, new.stage);
  elsif new.stage is distinct from old.stage then
    insert into stage_history (clinic_id, pipeline_kind, lead_id, from_stage, to_stage, seconds_in_prev)
      values (new.clinic_id, 'sales', new.id, old.stage, new.stage, extract(epoch from now() - old.stage_entered_at)::bigint);
    new.stage_entered_at := now(); new.sla_breached_at := null;
  end if;
  return new;
end $$;
create trigger leads_stage_ins after insert on leads for each row execute function lead_stage_track();
create trigger leads_stage_upd before update of stage on leads for each row execute function lead_stage_track();

create or replace function item_stage_track() returns trigger language plpgsql as $$
declare k text; fs text; ts text;
begin
  select p.kind into k from pipelines p where p.id = new.pipeline_id;
  select key into ts from pipeline_stages where id = new.stage_id;
  if tg_op = 'INSERT' then
    insert into stage_history (clinic_id, pipeline_kind, item_id, lead_id, to_stage) values (new.clinic_id, k, new.id, new.lead_id, ts);
  elsif new.stage_id is distinct from old.stage_id then
    select key into fs from pipeline_stages where id = old.stage_id;
    insert into stage_history (clinic_id, pipeline_kind, item_id, lead_id, from_stage, to_stage, seconds_in_prev)
      values (new.clinic_id, k, new.id, new.lead_id, fs, ts, extract(epoch from now() - old.stage_entered_at)::bigint);
    new.stage_entered_at := now(); new.sla_breached_at := null;
  end if;
  return new;
end $$;
create trigger items_stage_ins after insert on pipeline_items for each row execute function item_stage_track();
create trigger items_stage_upd before update of stage_id on pipeline_items for each row execute function item_stage_track();

select enable_tenant_rls(t::regclass) from unnest(array['pipelines','pipeline_stages','pipeline_items','stage_history']) as t;
grant select, insert, update, delete on pipelines, pipeline_stages, pipeline_items, stage_history to dentaflow_app;
grant usage, select on all sequences in schema public to dentaflow_app;

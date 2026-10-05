-- Toplu kampanyalar (WhatsApp onaylı şablon / e-posta), hedef kitle, alıcılar ve sonuç takibi
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  channel text not null check (channel in ('whatsapp','email')),
  audience jsonb not null default '{}',        -- {stages[], sources[], countries[], languages[], tags[], partnerId, createdFrom, createdTo, inactiveDays, hasDeal, cf{}, pipeline, pipelineStage}
  content jsonb not null default '{}',         -- whatsapp: {template:{name,language,params}} | email: {subject{lang}, body{lang}}
  variant_b jsonb,
  schedule_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','canceled')),
  stats jsonb not null default '{}',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz, finished_at timestamptz
);
create table campaign_recipients (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  variant text not null default 'A',
  status text not null default 'pending' check (status in ('pending','sent','skipped','failed')),
  reason text,
  sent_at timestamptz,
  unique (campaign_id, lead_id)
);
create index campaign_recipients_q on campaign_recipients (campaign_id, status);
select enable_tenant_rls(t::regclass) from unnest(array['campaigns','campaign_recipients']) as t;
grant select, insert, update, delete on campaigns, campaign_recipients to dentaflow_app;
grant usage, select on all sequences in schema public to dentaflow_app;

-- Takip dizileri (çok adımlı, çok kanallı) ve izin merkezi
create table consents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','email','sms','call','all')),
  purpose text not null default 'marketing' check (purpose in ('marketing','followup')),
  status text not null check (status in ('granted','revoked')),
  source text not null,                        -- form|import|whatsapp_stop|manual|web|portal|api
  evidence jsonb not null default '{}',        -- {formId, ip, text, userId}
  at timestamptz not null default now()
);
create index consents_patient on consents (clinic_id, patient_id, channel, at desc);

create table sequences (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null, description text,
  active boolean not null default false,
  trigger jsonb not null default '{}',         -- {event, stage, pipeline, source} | {} = yalnız elle
  stop_on text[] not null default '{replied,quote_accepted,deal_created,stage_won,stage_lost,opted_out}',
  settings jsonb not null default '{}',        -- {quietStart, quietEnd, weekends, marketing, exitOnStageChange}
  template_key text,                           -- hazır şablondan oluşturulduysa
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sequences_touch before update on sequences for each row execute function touch_updated_at();

create table sequence_steps (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  sequence_id uuid not null references sequences(id) on delete cascade,
  position int not null,
  kind text not null check (kind in ('whatsapp','email','sms','task','stage','tag','form','ai_message','ai_call','wait')),
  delay_minutes int not null default 0,        -- önceki adımdan sonra bekleme
  config jsonb not null default '{}',          -- {body:{tr,en..}, subject, template:{name,language,params}, title, stageKey, tag, templateId…}
  variant_b jsonb,                             -- A/B: B sürümünün config'i
  unique (sequence_id, position)
);

create table sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  sequence_id uuid not null references sequences(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  status text not null default 'active' check (status in ('active','completed','stopped','failed')),
  step_index int not null default 0,
  next_run_at timestamptz not null default now(),
  variant text not null default 'A',
  stop_reason text, last_error text,
  enrolled_by uuid references users(id),
  started_at timestamptz not null default now(), finished_at timestamptz,
  locked_at timestamptz
);
create unique index enroll_active on sequence_enrollments (sequence_id, lead_id) where status = 'active';
create index enroll_due on sequence_enrollments (next_run_at) where status = 'active';

create table sequence_runs (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  enrollment_id uuid not null references sequence_enrollments(id) on delete cascade,
  step_id uuid references sequence_steps(id) on delete set null,
  status text not null check (status in ('sent','skipped','failed','done')),
  channel text, variant text, detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index sequence_runs_enr on sequence_runs (enrollment_id, at);

select enable_tenant_rls(t::regclass) from unnest(array['consents','sequences','sequence_steps','sequence_enrollments','sequence_runs']) as t;
grant select, insert, update, delete on consents, sequences, sequence_steps, sequence_enrollments, sequence_runs to dentaflow_app;
grant usage, select on all sequences in schema public to dentaflow_app;

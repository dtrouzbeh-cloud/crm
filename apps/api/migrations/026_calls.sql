-- Faz D: telefon aramaları (Twilio). Temsilci tek tık arama (önce temsilci, sonra hasta), gelen arama, kayıt → döküm → AI özet
create table calls (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  user_id uuid references users(id) on delete set null,     -- arayan / cevaplayan temsilci
  direction text not null check (direction in ('out','in')),
  provider text not null default 'twilio',
  provider_sid text,                                         -- ilk bacak CallSid
  from_number text, to_number text, rep_number text,
  status text not null default 'initiated',                  -- initiated|ringing|in-progress|completed|busy|no-answer|failed|canceled
  outcome text,                                              -- reached_interested|reached_not_interested|callback|booked|no_answer|voicemail|missed|wrong_number|failed
  started_at timestamptz not null default now(), answered_at timestamptz, ended_at timestamptz,
  duration_sec int,
  recording_sid text, recording_file_id uuid references files(id) on delete set null, recording_sec int,
  transcript text, summary text, next_step text,
  ai jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now()
);
create index on calls (clinic_id, started_at desc);
create index on calls (lead_id, started_at desc);
create unique index calls_provider_sid on calls (provider, provider_sid) where provider_sid is not null;
select enable_tenant_rls('calls'::regclass);
grant select, insert, update, delete on calls to dentaflow_app;

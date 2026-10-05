-- Formlar: dijital onam, hasta anamnez formu, memnuniyet anketi (NPS) — token'lı hasta sayfası, imza, değiştirilemez kayıt
create table form_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('consent','intake','survey')),
  key text,                                   -- varsayılan şablon anahtarı (implant_consent…), klinik şablonlarında null
  name text not null,
  lang text not null default 'en',
  title text not null,
  body text not null default '',              -- onam metni (paragraflar, **kalın**)
  fields jsonb not null default '[]',         -- [{key,type,label,options?,required?,flag?,map?}]
  require_signature boolean not null default false,
  active boolean not null default true,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index form_templates_clinic on form_templates (clinic_id, kind);
create trigger form_templates_touch before update on form_templates for each row execute function touch_updated_at();

create table form_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  template_id uuid references form_templates(id) on delete set null,
  kind text not null,
  lead_id uuid references leads(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  token_hash text not null unique,
  token_enc text not null,
  snapshot jsonb not null,                    -- gönderim anındaki şablon (sonradan değişse de kayıt sabit)
  status text not null default 'sent' check (status in ('sent','opened','completed','revoked')),
  answers jsonb,
  nps int,
  signature_file_id uuid references files(id),
  signed_name text,
  doc_hash text,                              -- sha256(snapshot + answers + imza) — inkar edilemezlik
  ip text, user_agent text,
  sent_by uuid references users(id),
  sent_at timestamptz not null default now(),
  opened_at timestamptz, completed_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days'
);
create index form_requests_lead on form_requests (clinic_id, lead_id, sent_at desc);
create index form_requests_nps on form_requests (clinic_id, completed_at) where nps is not null;

select enable_tenant_rls(t::regclass) from unnest(array['form_templates','form_requests']) as t;
grant select, insert, update, delete on form_templates, form_requests to dentaflow_app;

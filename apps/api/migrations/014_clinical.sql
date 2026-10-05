-- Klinik modüller: laboratuvar siparişleri, implant izlenebilirliği, garanti belgesi, şikâyetler
create table labs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null, contact text, phone text, email citext,
  avg_days int not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table lab_orders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  number bigint not null,
  lead_id uuid not null references leads(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  lab_id uuid references labs(id) on delete set null,
  visit_no int,
  items jsonb not null default '[]',           -- [{desc, teeth[], material, qty}]
  shade text, notes text,
  file_ids uuid[] not null default '{}',       -- ölçü/tarama (STL), fotoğraf
  status text not null default 'draft' check (status in ('draft','sent','in_production','try_in','ready','delivered','remake','canceled')),
  history jsonb not null default '[]',         -- [{status, at, userId, note}]
  sent_at timestamptz, due_at timestamptz, delivered_at timestamptz,
  cost_minor bigint, currency text, expense_id uuid references expenses(id) on delete set null,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (clinic_id, number)
);
create index lab_orders_status on lab_orders (clinic_id, status, due_at);

create table implant_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  tooth int not null check (tooth between 11 and 48),
  brand text not null, system text, diameter numeric(4,2), length numeric(4,1),
  lot text, serial text, ref_code text,
  abutment text, torque_ncm int,
  placed_at date not null default current_date,
  dentist_id uuid references users(id),
  removed_at date, notes text,
  created_at timestamptz not null default now()
);
create index implant_lot on implant_records (clinic_id, lower(lot));

create table warranties (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  number bigint not null,
  lead_id uuid not null references leads(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  items jsonb not null default '[]',           -- [{desc, teeth[], years|null(ömür boyu)}]
  conditions text,
  lang text not null default 'en',
  token_hash text unique, token_enc text,
  status text not null default 'active' check (status in ('active','void')),
  issued_at timestamptz not null default now(),
  created_by uuid references users(id),
  unique (clinic_id, number)
);
create table complaints (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  number bigint not null,
  lead_id uuid not null references leads(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  category text not null check (category in ('pain','broken','loose','aesthetic','bite','implant_failure','infection','service','other')),
  teeth int[] not null default '{}',
  description text not null,
  file_ids uuid[] not null default '{}',
  status text not null default 'open' check (status in ('open','reviewing','in_progress','resolved','rejected')),
  warranty_covered boolean,
  resolution text, cost_minor bigint, currency text,
  owner_id uuid references users(id),
  source text not null default 'staff',       -- staff|patient|whatsapp
  opened_at timestamptz not null default now(), resolved_at timestamptz,
  unique (clinic_id, number)
);
create index complaints_status on complaints (clinic_id, status);
select enable_tenant_rls(t::regclass) from unnest(array['labs','lab_orders','implant_records','warranties','complaints']) as t;
grant select, insert, update, delete on labs, lab_orders, implant_records, warranties, complaints to dentaflow_app;

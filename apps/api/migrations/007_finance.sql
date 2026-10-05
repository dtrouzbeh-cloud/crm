-- Finans: iş ortakları (ajans/yönlendiren), komisyon kuralları ve hak edişler, giderler, faturalar
create table partners (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  type text not null default 'agency' check (type in ('agency','referrer','influencer','doctor','other')),
  email citext, phone text, country text,
  commission_bps int not null default 0 check (commission_bps between 0 and 10000),
  ref_code text,                                -- yönlendirme kodu (form/UTM ile lead eşleştirme)
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (clinic_id, ref_code)
);
alter table leads add column partner_id uuid references partners(id) on delete set null;
create index leads_partner on leads (clinic_id, partner_id) where partner_id is not null;

create table commission_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  recipient text not null check (recipient in ('deal_owner','user','lead_partner')),
  user_id uuid references users(id) on delete cascade,
  role text,                                    -- deal_owner için rol filtresi (ör. yalnız sales)
  rate_bps int not null default 0 check (rate_bps between 0 and 10000),  -- lead_partner'da 0 = ortağın kendi oranı
  source text,                                  -- yalnız bu lead kaynağı için (opsiyonel)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table commissions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  rule_id uuid references commission_rules(id) on delete set null,
  deal_id uuid not null references deals(id) on delete cascade,
  payment_id uuid not null references payments(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  partner_id uuid references partners(id) on delete set null,
  base_minor bigint not null, rate_bps int not null, amount_minor bigint not null,  -- iade/düzeltmede negatif
  currency text not null,
  status text not null default 'pending' check (status in ('pending','approved','paid','void')),
  approved_by uuid references users(id), approved_at timestamptz,
  paid_at timestamptz, paid_ref text,
  created_at timestamptz not null default now(),
  unique (payment_id, rule_id)
);
create index commissions_status on commissions (clinic_id, status, created_at desc);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  category text not null check (category in ('lab','materials','hotel','transfer','flight','marketing','commission','salary','rent','software','other')),
  vendor text, description text,
  amount_minor bigint not null check (amount_minor > 0), currency text not null,
  spent_on date not null default current_date,
  deal_id uuid references deals(id) on delete set null,
  file_id uuid references files(id),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index expenses_date on expenses (clinic_id, spent_on desc);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null default 'invoice' check (kind in ('invoice','proforma','receipt','credit_note')),
  number text,                                  -- kesilince atanır (taslakta null)
  deal_id uuid references deals(id) on delete set null,
  patient_id uuid references patients(id) on delete set null,
  payment_id uuid references payments(id) on delete set null,
  credit_of uuid references invoices(id),
  currency text not null,
  seller jsonb not null default '{}', buyer jsonb not null default '{}',
  lines jsonb not null default '[]',            -- [{desc, qty, unitMinor, taxBps}]
  subtotal_minor bigint not null default 0, tax_minor bigint not null default 0, total_minor bigint not null default 0,
  status text not null default 'draft' check (status in ('draft','issued','paid','void')),
  issued_at timestamptz, due_at date, paid_at timestamptz, voided_at timestamptz, void_reason text,
  notes text, lang text not null default 'en',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  unique (clinic_id, number)
);
create index invoices_clinic on invoices (clinic_id, created_at desc);

select enable_tenant_rls(t::regclass) from unnest(array['partners','commission_rules','commissions','expenses','invoices']) as t;
grant select, insert, update, delete on partners, commission_rules, commissions, expenses, invoices to dentaflow_app;

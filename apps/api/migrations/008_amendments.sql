-- Deal sonrası plan revizyonları (klinikte değişen/eklenen tedaviler) — fark fiyatlanır, hasta onaylar, deal ve ziyaret planı güncellenir
create table deal_amendments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  number int not null,
  status text not null default 'draft' check (status in ('draft','sent','approved','rejected','canceled')),
  lines jsonb not null default '[]',          -- [{kind:add|remove, v, tx?, b?, teeth?, brand?, qty, name, unitMinor, totalMinor, manual?}]
  delta_minor bigint not null default 0,
  currency text not null,
  reason text,
  lang text not null default 'en',
  token_hash text unique, token_enc text,
  response jsonb,                            -- {action, at, ip, name, channel: link|in_clinic, signatureFileId?}
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz, decided_at timestamptz,
  unique (deal_id, number)
);
create index deal_amendments_deal on deal_amendments (clinic_id, deal_id);
alter table deals add column amended_minor bigint not null default 0;  -- onaylı revizyonların toplam etkisi (value_minor içine dahil)
select enable_tenant_rls('deal_amendments'::regclass);
grant select, insert, update, delete on deal_amendments to dentaflow_app;

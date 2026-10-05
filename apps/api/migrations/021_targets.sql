-- Aylık satış hedefleri (temsilci başına)
create table sales_targets (
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  month date not null,                          -- ayın ilk günü
  revenue_minor bigint not null default 0, deals int not null default 0, currency text not null default 'EUR',
  primary key (clinic_id, user_id, month)
);
select enable_tenant_rls('sales_targets'::regclass);
grant select, insert, update, delete on sales_targets to dentaflow_app;

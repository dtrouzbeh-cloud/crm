-- Landing page oluşturucu (blok tabanlı, çok dilli, form → lead)
create table landing_pages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  slug text not null,
  title text not null,
  lang text not null default 'en',
  blocks jsonb not null default '[]',          -- [{type, props}]
  theme jsonb not null default '{}',           -- {color}
  campaign text,                               -- gelen lead'lerin kampanya adı
  published boolean not null default false,
  views int not null default 0, leads int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (clinic_id, slug)
);
create trigger landing_touch before update on landing_pages for each row execute function touch_updated_at();
select enable_tenant_rls('landing_pages'::regclass);
grant select, insert, update, delete on landing_pages to dentaflow_app;

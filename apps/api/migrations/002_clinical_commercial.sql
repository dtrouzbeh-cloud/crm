-- DentaFlow 002 — katalog, vaka/klinik plan, teklif, deal, ödeme defteri, seyahat ve operasyon

-- ───────────── KATALOG ─────────────
create table treatment_types (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  code text not null,                              -- motorun kullandığı kimlik (implant, crown_zr…)
  category text not null,
  names jsonb not null,                            -- ["tr","en","de","ar"]
  descriptions jsonb,
  unit text not null check (unit in ('tooth','side','arch','mouth','piece')),
  render text not null,
  material text,
  visits int[] not null default '{1,2,3}',
  color text,
  price_eur numeric(12,2) not null default 0,
  prices jsonb,                                    -- para birimi bazında sabit fiyat (opsiyonel)
  brands jsonb,                                    -- [{id,n,price,form}]
  tiers jsonb,                                     -- [[adet, fiyat]]
  needs_implant boolean not null default false,
  prereq jsonb,
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  unique (clinic_id, code)
);

create table bundles (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  code text not null,
  names jsonb not null,
  jaw text not null check (jaw in ('u','l')),
  implant_teeth int[] not null default '{}',
  crown_teeth int[] not null default '{}',
  material text, arch_treatment text,
  min_visits int not null default 1,
  visits int[] not null default '{1,2,3}',
  prereq jsonb, brands jsonb,
  price_eur numeric(12,2) not null default 0, prices jsonb,
  color text,
  active boolean not null default true,
  sort int not null default 0,
  unique (clinic_id, code)
);

create table hotels (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null, stars int, address text, distance_note text,
  night_eur numeric(10,2) not null default 0,
  room_types jsonb not null default '[{"code":"single","n":"Single","mult":1},{"code":"double","n":"Double","mult":1.3}]',
  image_file_ids uuid[] not null default '{}',
  description jsonb,
  active boolean not null default true, sort int not null default 0
);
create table transfer_options (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name jsonb not null, price_eur numeric(10,2) not null default 0, per text not null default 'visit',
  active boolean not null default true, sort int not null default 0
);

-- Hasta sayfası içerikleri (ekip, galeri, SSS, sertifika, yorum)
create table clinic_content (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null check (kind in ('team','gallery','faq','certificate','testimonial','legal')),
  data jsonb not null, file_id uuid,
  active boolean not null default true, sort int not null default 0
);

-- ───────────── VAKA ─────────────
create table cases (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  number bigint not null,
  lead_id uuid not null references leads(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  status text not null default 'pool' check (status in ('awaiting_info','pool','diagnosed','quoted','accepted','in_treatment','completed','canceled')),
  dentist_id uuid references users(id), owner_id uuid references users(id),
  situation jsonb not null default '{}',
  situation_done boolean not null default false,
  situation_skipped boolean not null default false,
  visits int not null default 1 check (visits between 1 and 10),
  plan_items jsonb not null default '[]',          -- PlanItem[] (core/engine)
  plan_revision int not null default 0,            -- iyimser eşzamanlılık
  dx_at timestamptz, dx_by uuid references users(id), dx_ack jsonb,  -- onaylanan klinik uyarılar
  pricing jsonb,                                   -- taslak fiyat yapılandırması (seçenekler)
  dentist_note text,                               -- hekime iç not
  step int not null default 1,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, number)
);
create index on cases(clinic_id, status);
create index on cases(lead_id);
create trigger cases_touch before update on cases for each row execute function touch_updated_at();

create table case_notes (                          -- düzenlenemez klinik notlar (düzeltme ayrı kayıt)
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  body text not null, correction_of bigint references case_notes(id),
  internal boolean not null default true,
  user_id uuid references users(id), at timestamptz not null default now()
);
create table case_messages (                       -- vaka içi ekip sohbeti
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  body text not null, file_id uuid,
  user_id uuid references users(id), at timestamptz not null default now()
);

-- ───────────── TEKLİF ─────────────
create table quotes (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  number bigint not null,
  version int not null,
  case_id uuid not null references cases(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  status text not null default 'sent' check (status in ('sent','viewed','accepted','changes','declined','expired','superseded','revoked')),
  token_hash text not null unique,
  language text not null, currency text not null,
  valid_until timestamptz not null,
  prices_hidden boolean not null default false,
  snapshot jsonb not null,                         -- değişmez teklif içeriği
  snapshot_hash text not null,
  total_minor bigint not null,                     -- önerilen seçenek toplamı
  created_by uuid references users(id),
  sent_via text[] not null default '{}',
  viewed_at timestamptz, view_count int not null default 0,
  responded_at timestamptz, response jsonb, accepted_option int,
  created_at timestamptz not null default now(),
  unique (clinic_id, number, version)
);
create index on quotes(clinic_id, status);
create index on quotes(case_id);

create table quote_events (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  quote_id uuid not null references quotes(id) on delete cascade,
  type text not null,                              -- view|accept|changes|decline|send|extend|revoke|pdf
  data jsonb not null default '{}', ip inet, user_agent text, staff boolean not null default false,
  at timestamptz not null default now()
);

create table discount_approvals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  option_id text not null, requested_bps int not null,
  requested_by uuid references users(id), decided_by uuid references users(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text, created_at timestamptz not null default now(), decided_at timestamptz
);

-- ───────────── DEAL & PARA ─────────────
create table deals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  number bigint not null,
  lead_id uuid not null references leads(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  case_id uuid references cases(id) on delete set null,
  quote_id uuid references quotes(id) on delete set null,
  accepted_option jsonb,                           -- kabul edilen seçeneğin kopyası
  title text not null,
  currency text not null,
  value_minor bigint not null default 0,
  deposit_minor bigint not null default 0,
  stage text not null default 'accepted',          -- accepted|deposit|travel|visit_N|won  (yan: postponed|lost)
  status text not null default 'open' check (status in ('open','won','lost','postponed')),
  owner_id uuid references users(id),
  lost_reason text, tags text[] not null default '{}',
  created_at timestamptz not null default now(), closed_at timestamptz,
  unique (clinic_id, number)
);
create index on deals(clinic_id, status, stage);

create table deal_visits (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  visit_no int not null,
  planned_minor bigint not null default 0,
  upsell_minor bigint not null default 0,
  status text not null default 'planned' check (status in ('planned','scheduled','arrived','in_treatment','done','canceled')),
  arrival_at timestamptz, departure_at timestamptz,
  unique (deal_id, visit_no)
);

create table payment_providers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  provider text not null,                          -- stripe|iyzico|paypal|bank_transfer|payment_link
  mode text not null default 'test' check (mode in ('test','live')),
  credentials_enc text,                            -- şifreli JSON
  config jsonb not null default '{}',              -- {currencies:[], iban, accountName, linkUrl…}
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (clinic_id, provider)
);

create table payment_intents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  deal_id uuid references deals(id) on delete cascade,
  quote_id uuid references quotes(id) on delete set null,
  provider text not null, purpose text not null default 'deposit',
  amount_minor bigint not null, currency text not null,
  status text not null default 'created' check (status in ('created','pending','succeeded','failed','canceled','expired')),
  provider_ref text, checkout_url text, reference_code text,  -- havale için referans kodu
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(), completed_at timestamptz
);
create index on payment_intents(provider, provider_ref);

create table payments (                            -- yalnız ekleme: düzeltmeler ayrı kayıt
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  intent_id uuid references payment_intents(id),
  kind text not null default 'payment' check (kind in ('payment','refund','adjustment')),
  amount_minor bigint not null,                    -- iade/düzeltmede negatif
  currency text not null,
  method text not null,                            -- card|paypal|bank_transfer|cash|pos|link|other
  provider text, provider_ref text,
  received_at timestamptz not null default now(),
  recorded_by uuid references users(id),
  note text, reverses uuid references payments(id),
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index on payments(deal_id);

create table payment_allocations (
  payment_id uuid not null references payments(id) on delete cascade,
  deal_visit_id uuid not null references deal_visits(id) on delete cascade,
  clinic_id uuid not null references clinics(id) on delete cascade,
  amount_minor bigint not null,
  primary key (payment_id, deal_visit_id)
);

-- ───────────── SEYAHAT & OPERASYON ─────────────
create table trips (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  visit_no int not null,
  passport_enc text,                               -- şifreli {fullName, number, expiry, nationality}
  passport_file_id uuid,
  flight jsonb not null default '{}',              -- {outbound:{no,from,to,dep,arr}, return:{…}, ticketFileId, cost, booked}
  hotel jsonb not null default '{}',               -- {hotelId, room, checkIn, checkOut, cost, booked, confirmation}
  companions int not null default 0,
  status text not null default 'planning' check (status in ('planning','confirmed','in_progress','done','canceled')),
  notes text,
  confirmation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (deal_id, visit_no)
);

create table transfer_runs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  leg text not null,                               -- airport_hotel|hotel_clinic|clinic_hotel|hotel_airport|other
  run_at timestamptz not null,
  driver_name text, driver_phone text, vehicle text,
  status text not null default 'planned' check (status in ('planned','dispatched','done','canceled')),
  note text
);
create index on transfer_runs(clinic_id, run_at);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  case_id uuid references cases(id) on delete set null,
  visit_no int,
  title text not null,
  start_at timestamptz not null, end_at timestamptz not null,
  dentist_id uuid references users(id), translator_id uuid references users(id),
  chair text,
  status text not null default 'booked' check (status in ('booked','confirmed','arrived','in_chair','done','no_show','canceled')),
  plan_item_ids text[] not null default '{}',      -- bu randevuda yapılacak plan kalemleri
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index on appointments(clinic_id, start_at);
create index on appointments(dentist_id, start_at);

-- klinik plan kalemi tamamlanma kayıtları (satılan plan dokunulmaz; ilerleme ayrı tutulur)
create table treatment_progress (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references clinics(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  plan_item_id text not null, tooth int,
  status text not null check (status in ('done','skipped','changed')),
  appointment_id uuid references appointments(id) on delete set null,
  upsell boolean not null default false, amount_minor bigint, note text,
  user_id uuid references users(id), at timestamptz not null default now()
);

select enable_tenant_rls(t::regclass) from unnest(array[
  'treatment_types','bundles','hotels','transfer_options','clinic_content','cases','case_notes','case_messages','quotes','quote_events',
  'discount_approvals','deals','deal_visits','payment_providers','payment_intents','payments','payment_allocations','trips','transfer_runs','appointments','treatment_progress'
]) as t;

grant select, insert, update, delete on all tables in schema public to dentaflow_app;
grant usage, select on all sequences in schema public to dentaflow_app;

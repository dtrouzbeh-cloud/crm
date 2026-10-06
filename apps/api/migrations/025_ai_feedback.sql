-- AI geri bildirimi: hekimin AI ön değerlendirmesine verdiği karar (doğru / kısmen / yanlış), yanlış dişler ve not → doğruluk ölçümü ve model iyileştirme için
create table ai_feedback (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  kind text not null default 'assess',          -- assess | coach | report …
  entity_id uuid,                               -- vaka / konuşma kimliği
  verdict text not null check (verdict in ('correct','partial','wrong')),
  wrong_teeth int[] not null default '{}',
  note text,
  model text,
  snapshot jsonb,                               -- değerlendirmenin o anki hali
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index on ai_feedback (clinic_id, kind, created_at desc);
select enable_tenant_rls('ai_feedback'::regclass);
grant select, insert, update, delete on ai_feedback to dentaflow_app;

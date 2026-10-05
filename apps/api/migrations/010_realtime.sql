-- Anlık güncelleme: bildirim ve olay kayıtları 'rt' kanalına yayınlanır (API SSE ile tarayıcıya iter); kullanıcı bildirim tercihleri
alter table users add column notify_prefs jsonb not null default '{}';

create or replace function rt_notification() returns trigger language plpgsql as $$
begin
  perform pg_notify('rt', json_build_object('k', 'n', 'c', new.clinic_id, 'u', new.user_id, 't', new.type, 'id', new.id, 'title', left(new.title, 200), 'link', new.link)::text);
  return new;
end $$;
create trigger notifications_rt after insert on notifications for each row execute function rt_notification();

-- olay: yalnız tür ve kimlikler (kişisel veri yok) — istemci ilgili listeleri yeniler
create or replace function rt_event() returns trigger language plpgsql as $$
begin
  perform pg_notify('rt', json_build_object('k', 'e', 'c', new.clinic_id, 't', new.type, 'e', new.entity_id)::text);
  return new;
end $$;
create trigger outbox_rt after insert on outbox_events for each row execute function rt_event();

-- görev değişikliği: atanan kişinin görev sayaçları anında güncellensin
create or replace function rt_task() returns trigger language plpgsql as $$
begin
  perform pg_notify('rt', json_build_object('k', 'e', 'c', new.clinic_id, 't', 'task.changed', 'u', new.assignee_id)::text);
  return new;
end $$;
create trigger tasks_rt after insert or update on tasks for each row execute function rt_task();

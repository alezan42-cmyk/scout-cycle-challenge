-- Une sortie à valider cesse d'apparaître dès qu'un admin l'approuve.
create index if not exists app_notifications_read_cleanup_idx
  on public.app_notifications(read_at) where read_at is not null;

create or replace function public.clear_aquila_pending_activity_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    delete from public.app_notifications
     where kind = 'activity_pending'
       and dedupe_key = 'activity-pending:' || new.id::text;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_clear_aquila_pending_activity_notification on public.activities;
create trigger trg_clear_aquila_pending_activity_notification
  after update of status on public.activities
  for each row execute function public.clear_aquila_pending_activity_notification();
revoke execute on function public.clear_aquila_pending_activity_notification() from public, anon, authenticated;

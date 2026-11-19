-- Tests « Sorties prévues » (à lancer après les migrations)
\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001','a@test.be'),
  ('aaaaaaaa-0000-4000-8000-000000000002','b@test.be'),
  ('aaaaaaaa-0000-4000-8000-000000000003','c@test.be')
on conflict do nothing;

create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end $$;

-- A crée une sortie (2 places)
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.planned_rides(id, created_by, title, ride_date, start_time, meeting_point, max_participants)
values ('bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','Boucle du dimanche', current_date + 3, '09:30', 'Église de Moustier', 2);

do $$ begin
  assert (select count(*) from public.planned_ride_responses where ride_id='bbbbbbbb-0000-4000-8000-000000000001' and status='yes') = 1, 'le créateur doit être inscrit';
end $$;

-- Impossible de créer au nom d'un autre
do $$ begin
  begin
    insert into public.planned_rides(created_by, title, ride_date, start_time, meeting_point)
    values ('aaaaaaaa-0000-4000-8000-000000000002','Usurpation', current_date + 1, '10:00','Ici');
    raise exception 'ECHEC: insertion au nom d''un autre acceptée';
  exception when insufficient_privilege then null; when others then if sqlerrm like 'ECHEC%' then raise; end if;
  end;
end $$;

-- Impossible de créer dans le passé
do $$ begin
  begin
    insert into public.planned_rides(created_by, title, ride_date, start_time, meeting_point)
    values ('aaaaaaaa-0000-4000-8000-000000000001','Passée', current_date - 1, '10:00','Ici');
    raise exception 'ECHEC: sortie passée acceptée';
  exception when others then if sqlerrm like 'ECHEC%' then raise; end if;
  end;
end $$;

-- B répond oui : complet ensuite pour C
reset role;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000002');
insert into public.planned_ride_responses(ride_id, user_id, status) values ('bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000002','yes');
-- B ne peut pas modifier la sortie de A
update public.planned_rides set title='Piraté' where id='bbbbbbbb-0000-4000-8000-000000000001';
do $$ begin assert (select title from public.planned_rides where id='bbbbbbbb-0000-4000-8000-000000000001')='Boucle du dimanche', 'B a modifié la sortie de A'; end $$;
-- B ne peut pas répondre pour C
do $$ begin
  begin
    insert into public.planned_ride_responses(ride_id, user_id, status) values ('bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000003','yes');
    raise exception 'ECHEC: réponse pour un autre acceptée';
  exception when others then if sqlerrm like 'ECHEC%' then raise; end if;
  end;
end $$;

reset role;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000003');
do $$ begin
  begin
    insert into public.planned_ride_responses(ride_id, user_id, status) values ('bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000003','yes');
    raise exception 'ECHEC: place au-delà du maximum';
  exception when others then if sqlerrm like 'ECHEC%' then raise; end if;
  end;
end $$;
-- « peut-être » reste possible
insert into public.planned_ride_responses(ride_id, user_id, status) values ('bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000003','maybe');

-- Visiteur sans compte : rien
reset role;
set local role anon;
do $$ begin
  begin
    perform 1 from public.planned_rides;
    raise exception 'ECHEC: visiteur peut lire';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A annule : plus de réponse possible
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
update public.planned_rides set cancelled = true, created_by = 'aaaaaaaa-0000-4000-8000-000000000002' where id='bbbbbbbb-0000-4000-8000-000000000001';
do $$ begin assert (select created_by::text from public.planned_rides where id='bbbbbbbb-0000-4000-8000-000000000001')='aaaaaaaa-0000-4000-8000-000000000001', 'auteur modifié'; end $$;
reset role;
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000003');
do $$ begin
  begin
    update public.planned_ride_responses set status='yes' where ride_id='bbbbbbbb-0000-4000-8000-000000000001' and user_id='aaaaaaaa-0000-4000-8000-000000000003';
    raise exception 'ECHEC: réponse sur sortie annulée';
  exception when others then if sqlerrm like 'ECHEC%' then raise; end if;
  end;
end $$;
reset role;
do $$ begin raise notice 'TOUS LES TESTS SORTIES PREVUES SONT PASSÉS'; end $$;
rollback;

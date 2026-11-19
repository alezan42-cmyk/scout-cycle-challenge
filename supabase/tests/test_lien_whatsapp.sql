\set ON_ERROR_STOP on
begin;
insert into auth.users(id, email) values ('cccccccc-0000-4000-8000-000000000001','scout@test.be') on conflict do nothing;
-- Un scout (non admin) ne peut pas écrire
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  begin
    insert into public.member_links(key, url) values ('whatsapp_sorties','https://chat.whatsapp.com/ABC');
    raise exception 'ECHEC: un scout a écrit le lien';
  exception when others then if sqlerrm like 'ECHEC%' then raise; end if;
  end;
end $$;
reset role;
insert into public.member_links(key, url) values ('whatsapp_sorties','https://chat.whatsapp.com/ABC');
-- Mauvais lien refusé
do $$ begin
  begin
    update public.member_links set url='https://evil.example/x' where key='whatsapp_sorties';
    raise exception 'ECHEC: lien non WhatsApp accepté';
  exception when check_violation then null;
  end;
end $$;
-- Membre connecté : lit
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ begin assert (select count(*) from public.member_links) = 1, 'membre ne lit pas'; end $$;
reset role;
-- Visiteur : rien
set local role anon;
do $$ begin
  begin perform 1 from public.member_links; raise exception 'ECHEC: visiteur lit';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin raise notice 'TOUS LES TESTS LIEN WHATSAPP SONT PASSÉS'; end $$;
rollback;

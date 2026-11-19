-- =====================================================================
-- Liens réservés aux membres (ex. lien d'invitation du groupe WhatsApp
-- des sorties). Contrairement à site_settings (lisible par tous), ces liens
-- ne sont lisibles que par les membres connectés : un lien d'invitation
-- WhatsApp permet à n'importe qui d'entrer dans le groupe des scouts.
-- Modification : admins uniquement.
-- =====================================================================
create table if not exists public.member_links (
  key text primary key check (key in ('whatsapp_sorties')),
  url text not null check (url ~* '^https://(chat\.whatsapp\.com|wa\.me)/'),
  label text check (label is null or char_length(label) <= 80),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.member_links enable row level security;
revoke all on public.member_links from anon;
grant select, insert, update, delete on public.member_links to authenticated;

create policy "liens membres lecture" on public.member_links
  for select to authenticated using (true);
create policy "liens membres ecriture admin" on public.member_links
  for insert to authenticated with check (public.has_role((select auth.uid()), 'admin'));
create policy "liens membres modif admin" on public.member_links
  for update to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));
create policy "liens membres suppression admin" on public.member_links
  for delete to authenticated using (public.has_role((select auth.uid()), 'admin'));

-- Supprime l'ancien contournement de la confirmation e-mail.
-- Le réglage "Confirm email" et le SMTP restent à activer dans le Dashboard Supabase.
drop trigger if exists on_auth_user_auto_confirm on auth.users;
drop function if exists public.auto_confirm_user();

-- Cette ancienne RPC était exécutable par anon et permettait de confirmer
-- arbitrairement une adresse. La confirmation doit désormais passer par Auth.
revoke all on function public.confirm_user_email(text) from public, anon, authenticated;
drop function if exists public.confirm_user_email(text);

-- Les comptes déjà confirmés ne sont pas modifiés.

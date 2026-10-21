-- WP04 (audit L67) — keep profiles.email equal to the login email.
--
-- profiles.email was copied once at signup (handle_new_user) and never
-- resynced after an email change, and any user could overwrite it through the
-- "users can update own profile" policy. It is shown as identity text (Staff,
-- Teams, audit actor fallback, invite emails).
--   1. Resync on auth email change, reusing handle_new_user (its ON CONFLICT
--      branch updates email and preserves full_name).
--   2. A BEFORE INSERT/UPDATE trigger on profiles overwrites email with the
--      auth.users value for every client (JWT) write, so the existing web
--      upserts (CompleteProfile, InviteAccept) keep working unchanged while
--      the email they send is ignored.

-- Wrapped so a hosted project that forbids triggers on auth.users does not
-- fail the whole push; the pin trigger below still resyncs email on the
-- user's next profile write in that case.
do $$
begin
  drop trigger if exists on_auth_user_email_updated on auth.users;
  create trigger on_auth_user_email_updated
    after update of email on auth.users
    for each row
    when (old.email is distinct from new.email)
    execute function public.handle_new_user();
exception when insufficient_privilege then
  raise warning 'WP04/L67: cannot create a trigger on auth.users here; profiles.email will resync on the next profile write (profiles_pin_email) instead.';
end $$;

create or replace function public.profiles_pin_email()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.email := (select u.email from auth.users u where u.id = new.id);
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_pin_email() from public, anon, authenticated;

drop trigger if exists profiles_pin_email on public.profiles;
create trigger profiles_pin_email
  before insert or update on public.profiles
  for each row execute function public.profiles_pin_email();

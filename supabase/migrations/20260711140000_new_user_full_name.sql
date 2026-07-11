-- Carry the name entered at signup onto the profile.
--
-- The signup form collects a full name, but handle_new_user() only copied
-- id + email into profiles, so the name was dropped and the user was asked
-- for it again on the Complete-profile screen. supabase.auth.signUp() now
-- passes the name in options.data (=> auth.users.raw_user_meta_data), so read
-- it here. Falls back to null when absent (e.g. invited users, who set their
-- name later on the invite-accept screen).

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do update
    set email = excluded.email,
        -- Only fill the name when we have one and the row doesn't already,
        -- so we never blank out a name that was set elsewhere.
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

-- WP26 Phase 3 (TODO 9.21) — supplier templates for rental-list PDFs.
--
-- A template is data describing one supplier's PDF layout (column x ranges,
-- table start/end markers, lines to skip). The shared JS engine
-- (supabase/functions/_shared/pdf/templates.js) applies it to the PDF's own
-- text, so no imported value ever comes from a template. Templates hold no
-- rows, prices or customer data.
--
--   1. pdf_templates: org templates (scope 'org', org_id set) and, later,
--      global ones promoted by Chris (scope 'global', org_id null; Phase 4).
--   2. pdf_template_is_valid(): the same shape rules as validateTemplate()
--      in templates.js, enforced by a CHECK constraint.
--   3. RLS: active members read their org's templates and global ones; the
--      roles that may import (owner, admin, department_head) write their
--      org's. Usage counters are written only by record_pdf_template_use().

create table public.pdf_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  scope text not null default 'org' constraint pdf_templates_scope_check check (scope in ('org', 'global')),
  name text not null constraint pdf_templates_name_check check (char_length(btrim(name)) between 1 and 80),
  template jsonb not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  success_count integer not null default 0,
  fail_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pdf_templates_scope_org check ((scope = 'org') = (org_id is not null))
);

create index pdf_templates_org_id_idx on public.pdf_templates (org_id);
create unique index pdf_templates_org_name_key
  on public.pdf_templates (org_id, lower(btrim(name))) where scope = 'org';

-- ── 2. Shape check (mirrors validateTemplate in templates.js) ───────────────
create or replace function public.pdf_template_is_valid(t jsonb)
  returns boolean
  language plpgsql
  immutable
  set search_path to 'public'
as $$
declare
  v_tokens jsonb := t #> '{fingerprint,tokens}';
  v_skip jsonb := t -> 'skip';
  v_cat text := t ->> 'category_from';
  k text;
  v jsonb;
begin
  if jsonb_typeof(t) is distinct from 'object' then return false; end if;
  if (t ->> 'version') is distinct from '1' then return false; end if;

  if jsonb_typeof(v_tokens) is distinct from 'array'
     or jsonb_array_length(v_tokens) not between 1 and 16 then
    return false;
  end if;
  for v in select * from jsonb_array_elements(v_tokens) loop
    if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[A-Z]{3,40}$' then return false; end if;
  end loop;

  -- name and quantity required; category and code optional.
  foreach k in array array['name', 'quantity', 'category', 'code'] loop
    v := t #> array['columns', k];
    if v is null then
      if k in ('name', 'quantity') then return false; end if;
      continue;
    end if;
    if jsonb_typeof(v -> 'x_min') <> 'number' or jsonb_typeof(v -> 'x_max') <> 'number'
       or (v ->> 'x_min')::numeric < 0
       or (v ->> 'x_max')::numeric <= (v ->> 'x_min')::numeric
       or (v ->> 'x_max')::numeric > 100000 then
      return false;
    end if;
  end loop;

  foreach k in array array['start_after', 'end_before'] loop
    v := t #> array['table', k];
    if v is not null and (jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') not between 1 and 80) then
      return false;
    end if;
  end loop;

  if jsonb_typeof(v_skip) is distinct from 'array' or jsonb_array_length(v_skip) > 20 then
    return false;
  end if;
  for v in select * from jsonb_array_elements(v_skip) loop
    if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') not between 1 and 80 then return false; end if;
  end loop;

  if v_cat is null or v_cat not in ('column', 'heading', 'none') then return false; end if;
  if v_cat = 'column' and t #> '{columns,category}' is null then return false; end if;

  return true;
end;
$$;

alter table public.pdf_templates
  add constraint pdf_templates_template_valid check (public.pdf_template_is_valid(template));

-- ── updated_at ──────────────────────────────────────────────────────────────
create or replace function public.pdf_templates_touch()
  returns trigger
  language plpgsql
  set search_path to 'public'
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.pdf_templates_touch() from public, anon, authenticated;

create trigger pdf_templates_touch
  before update on public.pdf_templates
  for each row execute function public.pdf_templates_touch();

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
alter table public.pdf_templates enable row level security;

-- Caller may import into (and so teach templates for) this org.
create or replace function public.can_manage_pdf_templates(p_org uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
as $$
  select exists (
    select 1 from public.organization_members m
     where m.org_id = p_org
       and m.user_id = auth.uid()
       and m.status = 'active'
       and m.role in ('owner', 'admin', 'department_head')
  );
$$;

revoke execute on function public.can_manage_pdf_templates(uuid) from public, anon;
grant execute on function public.can_manage_pdf_templates(uuid) to authenticated, service_role;

create policy "pdf_templates: members read org and global" on public.pdf_templates
  for select to authenticated
  using (
    scope = 'global'
    or exists (
      select 1 from public.organization_members m
       where m.org_id = pdf_templates.org_id
         and m.user_id = (select auth.uid())
         and m.status = 'active'
    )
  );

create policy "pdf_templates: importers insert" on public.pdf_templates
  for insert to authenticated
  with check (
    scope = 'org'
    and created_by = (select auth.uid())
    and public.can_manage_pdf_templates(org_id)
  );

create policy "pdf_templates: importers update" on public.pdf_templates
  for update to authenticated
  using (scope = 'org' and public.can_manage_pdf_templates(org_id))
  with check (scope = 'org' and public.can_manage_pdf_templates(org_id));

create policy "pdf_templates: importers delete" on public.pdf_templates
  for delete to authenticated
  using (scope = 'org' and public.can_manage_pdf_templates(org_id));

-- Clients write only name and template; counters go through the RPC below.
revoke all on table public.pdf_templates from anon, authenticated;
grant select, delete on table public.pdf_templates to authenticated;
grant insert (id, org_id, name, template, created_by) on table public.pdf_templates to authenticated;
grant update (name, template) on table public.pdf_templates to authenticated;
grant all on table public.pdf_templates to service_role;

-- ── Usage counters ──────────────────────────────────────────────────────────
-- Called after an import that used a template: p_ok = true when the user
-- imported its rows. Only templates the caller can read are counted.
create or replace function public.record_pdf_template_use(p_template uuid, p_ok boolean)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $$
begin
  update public.pdf_templates t
     set success_count = t.success_count + case when p_ok then 1 else 0 end,
         fail_count = t.fail_count + case when p_ok then 0 else 1 end,
         last_used_at = now()
   where t.id = p_template
     and (t.scope = 'global'
          or exists (select 1 from public.organization_members m
                      where m.org_id = t.org_id
                        and m.user_id = auth.uid()
                        and m.status = 'active'));
end;
$$;

revoke execute on function public.record_pdf_template_use(uuid, boolean) from public, anon;
grant execute on function public.record_pdf_template_use(uuid, boolean) to authenticated, service_role;
revoke execute on function public.pdf_template_is_valid(jsonb) from public, anon;
grant execute on function public.pdf_template_is_valid(jsonb) to authenticated, service_role;

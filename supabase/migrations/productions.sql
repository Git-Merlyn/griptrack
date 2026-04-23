-- Productions (Show workspace) — Model A
-- Each production has its own isolated equipment list.
-- equipment_items rows belong to a production via production_id (null = General pool).

-- 1. Productions table
create table if not exists productions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  status       text not null default 'active' check (status in ('active', 'archived')),
  start_date   date,
  end_date     date,
  created_by   text,
  created_at   timestamptz not null default now()
);

-- Index for fast per-org queries
create index if not exists productions_org_id_idx on productions (org_id);

-- 2. Add production_id FK to equipment_items (nullable — null = General pool)
alter table equipment_items
  add column if not exists production_id uuid references productions(id) on delete set null;

-- Index so filtering by production is fast
create index if not exists equipment_items_production_id_idx on equipment_items (production_id);

-- 3. Row-level security (mirror equipment_items policy pattern)
alter table productions enable row level security;

-- Org members can read their own productions
create policy "org members can read productions"
  on productions for select
  using (
    org_id in (
      select organization_id from profiles where id = auth.uid()
    )
  );

-- Admins and owners can insert/update/delete
create policy "admins can manage productions"
  on productions for all
  using (
    org_id in (
      select organization_id from profiles
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- Equipment Requests table
-- Run this in the Supabase SQL editor (Dashboard → SQL editor → New query).

create table if not exists equipment_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  requested_by    uuid references auth.users(id) on delete set null,
  requester_name  text not null default '',
  item_name       text not null,
  quantity        int  not null default 1 check (quantity > 0),
  notes           text,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'denied')),
  reviewed_by     text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- Index for the most common query pattern: all requests for an org, newest first
create index if not exists equipment_requests_org_created
  on equipment_requests (org_id, created_at desc);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table equipment_requests enable row level security;

-- Helper: look up the caller's org_id from their profile row.
-- Avoids repeating a subquery in every policy.
create or replace function auth_org_id()
returns uuid
language sql
stable
security definer
as $$
  select org_id from profiles where id = auth.uid() limit 1;
$$;

-- Org members can read all requests for their org
create policy "org members can read requests"
  on equipment_requests for select
  using (org_id = auth_org_id());

-- Any org member can submit a request
create policy "org members can insert requests"
  on equipment_requests for insert
  with check (org_id = auth_org_id());

-- Org members can update requests (approve/deny gated in app layer by role check)
create policy "org members can update requests"
  on equipment_requests for update
  using (org_id = auth_org_id());

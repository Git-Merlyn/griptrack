


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."accept_org_invite_for_user"() RETURNS TABLE("accepted_org_id" "uuid", "accepted_role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
  v_org uuid;
  v_role text;
begin
  -- Prefer canonical auth.users email, fallback to JWT email
  select lower(u.email)
  into v_email
  from auth.users u
  where u.id = auth.uid();

  v_email := lower(coalesce(v_email, auth.jwt() ->> 'email', ''));

  if v_email = '' then
    return;
  end if;

  -- Find newest pending invite
  select i.org_id, i.role
  into v_org, v_role
  from public.org_invites i
  where lower(i.email) = v_email
    and i.status = 'pending'
  order by i.created_at desc
  limit 1;

  if v_org is null then
    return;
  end if;

  -- Attach signed-in user to invited org
  insert into public.organization_members (org_id, user_id, role, status)
  values (v_org, auth.uid(), coalesce(v_role, 'staff'), 'active')
  on conflict (org_id, user_id) do update
    set role = excluded.role,
        status = 'active';

  -- Mark invite accepted
  update public.org_invites i
  set status = 'accepted',
      accepted_at = now()
  where i.org_id = v_org
    and lower(i.email) = v_email
    and i.status = 'pending';

  return query
  select v_org, coalesce(v_role, 'staff');
end;
$$;


ALTER FUNCTION "public"."accept_org_invite_for_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select org_id from organization_members where user_id = auth.uid() limit 1;
$$;


ALTER FUNCTION "public"."auth_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_free_subscription"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO subscriptions (org_id) VALUES (NEW.id) ON CONFLICT (org_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_free_subscription"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_org_for_user"() RETURNS TABLE("org_id" "uuid", "role" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  existing_org uuid;
  new_org uuid;
begin
  select m.org_id into existing_org
  from public.organization_members m
  where m.user_id = auth.uid()
  limit 1;

  if existing_org is not null then
    return query
    select existing_org, m.role
    from public.organization_members m
    where m.user_id = auth.uid()
      and m.org_id = existing_org;
    return;
  end if;

  insert into public.organizations (name)
  values ('New Company')
  returning id into new_org;

  insert into public.organization_members (org_id, user_id, role, status)
  values (new_org, auth.uid(), 'owner', 'active');

  return query select new_org, 'owner';
end;
$$;


ALTER FUNCTION "public"."ensure_org_for_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_equipment_quantity"("item_id" "uuid", "delta" integer, "updated_by_val" "text", "updated_at_val" timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE equipment_items
  SET
    quantity   = GREATEST(0, quantity + delta),
    updated_by = updated_by_val,
    updated_at = updated_at_val
  WHERE id = item_id;
END;
$$;


ALTER FUNCTION "public"."increment_equipment_quantity"("item_id" "uuid", "delta" integer, "updated_by_val" "text", "updated_at_val" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_member"("_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = _org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_active_member"("_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_member_of_org"("target_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_active_member_of_org"("target_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.organization_members m
    where m.org_id = _org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','admin')
  );
$$;


ALTER FUNCTION "public"."is_org_admin"("_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_equipment_audit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  act text;
begin
  if (tg_op = 'INSERT') then
    act := 'create';

    insert into public.equipment_audit (
      equipment_id, action, actor,
      snapshot_after
    ) values (
      new.id,
      act,
      new.updated_by,
      to_jsonb(new)
    );

    return new;
  end if;

  if (tg_op = 'UPDATE') then
    -- classify moves vs generic update
    if (new.location is distinct from old.location) then
      act := 'move';
    else
      act := 'update';
    end if;

    insert into public.equipment_audit (
      equipment_id, action, actor,
      from_location, to_location,
      delta_qty,
      snapshot_before, snapshot_after
    ) values (
      new.id,
      act,
      new.updated_by,
      old.location,
      new.location,
      (coalesce(new.quantity,0) - coalesce(old.quantity,0)),
      to_jsonb(old),
      to_jsonb(new)
    );

    return new;
  end if;

  if (tg_op = 'DELETE') then
    act := 'delete';

    insert into public.equipment_audit (
      equipment_id, action, actor,
      from_location,
      snapshot_before
    ) values (
      old.id,
      act,
      old.updated_by,
      old.location,
      to_jsonb(old)
    );

    return old;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."log_equipment_audit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_equipment_audit_dev"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  act text;
begin
  if (tg_op = 'INSERT') then
    act := 'create';

    insert into public.equipment_audit (equipment_id, action, actor, meta)
    values (new.id, act, new.updated_by, jsonb_build_object('snapshot_after', to_jsonb(new)));

    return new;
  end if;

  if (tg_op = 'UPDATE') then
    if (new.location is distinct from old.location) then
      act := 'move';
    else
      act := 'update';
    end if;

    insert into public.equipment_audit (equipment_id, action, actor, meta)
    values (
      new.id,
      act,
      new.updated_by,
      jsonb_build_object(
        'from', old.location,
        'to', new.location,
        'delta_qty', (coalesce(new.quantity,0) - coalesce(old.quantity,0)),
        'snapshot_before', to_jsonb(old),
        'snapshot_after', to_jsonb(new)
      )
    );

    return new;
  end if;

  if (tg_op = 'DELETE') then
    act := 'delete';

    insert into public.equipment_audit (equipment_id, action, actor, meta)
    values (
      old.id,
      act,
      old.updated_by,
      jsonb_build_object(
        'from', old.location,
        'snapshot_before', to_jsonb(old)
      )
    );

    return old;
  end if;

  return null;
end;
$$;


ALTER FUNCTION "public"."log_equipment_audit_dev"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_test_user"("test_email" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin

delete from public.organization_members
where user_id = (select id from auth.users where lower(email)=lower(test_email));

delete from public.profiles
where id = (select id from auth.users where lower(email)=lower(test_email));

delete from public.org_invites
where lower(email)=lower(test_email);

delete from auth.users
where lower(email)=lower(test_email);

end;
$$;


ALTER FUNCTION "public"."reset_test_user"("test_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."beta_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'bug'::"text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "title" "text",
    "description" "text" NOT NULL,
    "steps" "text",
    "page_url" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid"
);


ALTER TABLE "public"."beta_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "equipment_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor" "text",
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "from_location" "text",
    "to_location" "text",
    "delta_qty" integer,
    "snapshot_before" "jsonb",
    "snapshot_after" "jsonb",
    "meta" "jsonb",
    "org_id" "uuid",
    "user_id" "uuid"
);


ALTER TABLE "public"."equipment_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "text",
    "name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "location" "text" NOT NULL,
    "status" "text" DEFAULT 'Available'::"text" NOT NULL,
    "updated_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text",
    "source" "text",
    "reserve_min" integer DEFAULT 0 NOT NULL,
    "org_id" "uuid",
    "production_id" "uuid",
    "team_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "equipment_items_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."equipment_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipment_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "requested_by" "uuid",
    "requester_name" "text" DEFAULT ''::"text" NOT NULL,
    "item_name" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "notes" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "text",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "equipment_requests_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "equipment_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'denied'::"text"])))
);


ALTER TABLE "public"."equipment_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_at" timestamp with time zone,
    CONSTRAINT "org_invites_email_chk" CHECK ((POSITION(('@'::"text") IN ("email")) > 1))
);


ALTER TABLE "public"."org_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "org_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'owner'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_id" "uuid",
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'department_head'::"text", 'crew'::"text"]))),
    CONSTRAINT "organization_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'New Company'::"text" NOT NULL,
    "billing_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "trial_ends_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval),
    "features" "jsonb" DEFAULT '{"teams_enabled": false, "requests_enabled": false}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."productions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "created_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "productions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."productions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "phone" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "plan" "text" DEFAULT 'free'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "max_seats" integer DEFAULT 10 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "teams_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_audit"
    ADD CONSTRAINT "equipment_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_items"
    ADD CONSTRAINT "equipment_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipment_requests"
    ADD CONSTRAINT "equipment_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_org_id_name_key" UNIQUE ("org_id", "name");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("org_id", "user_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."productions"
    ADD CONSTRAINT "productions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_org_id_key" UNIQUE ("org_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



CREATE INDEX "equipment_audit_user_id_idx" ON "public"."equipment_audit" USING "btree" ("user_id");



CREATE INDEX "equipment_items_category_idx" ON "public"."equipment_items" USING "btree" ("category");



CREATE INDEX "equipment_items_location_idx" ON "public"."equipment_items" USING "btree" ("location");



CREATE INDEX "equipment_items_name_idx" ON "public"."equipment_items" USING "btree" ("name");



CREATE INDEX "equipment_items_production_id_idx" ON "public"."equipment_items" USING "btree" ("production_id");



CREATE INDEX "equipment_items_team_id_idx" ON "public"."equipment_items" USING "btree" ("team_id");



CREATE INDEX "equipment_requests_org_created" ON "public"."equipment_requests" USING "btree" ("org_id", "created_at" DESC);



CREATE UNIQUE INDEX "org_invites_org_email_unique" ON "public"."org_invites" USING "btree" ("org_id", "email");



CREATE INDEX "org_invites_org_id_idx" ON "public"."org_invites" USING "btree" ("org_id");



CREATE INDEX "org_members_team_id_idx" ON "public"."organization_members" USING "btree" ("team_id");



CREATE UNIQUE INDEX "organization_members_one_org_per_user" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "productions_org_id_idx" ON "public"."productions" USING "btree" ("org_id");



CREATE INDEX "teams_org_id_idx" ON "public"."teams" USING "btree" ("org_id");



CREATE OR REPLACE TRIGGER "equipment_audit_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."equipment_items" FOR EACH ROW EXECUTE FUNCTION "public"."log_equipment_audit"();



CREATE OR REPLACE TRIGGER "equipment_items_set_updated_at" BEFORE INSERT OR UPDATE ON "public"."equipment_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "on_org_created" AFTER INSERT ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."create_free_subscription"();



ALTER TABLE ONLY "public"."beta_feedback"
    ADD CONSTRAINT "beta_feedback_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."equipment_audit"
    ADD CONSTRAINT "equipment_audit_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."equipment_audit"
    ADD CONSTRAINT "equipment_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_items"
    ADD CONSTRAINT "equipment_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."equipment_items"
    ADD CONSTRAINT "equipment_items_production_id_fkey" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_items"
    ADD CONSTRAINT "equipment_items_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_requests"
    ADD CONSTRAINT "equipment_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."equipment_audit"
    ADD CONSTRAINT "fk_equipment_audit_equipment" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."org_invites"
    ADD CONSTRAINT "org_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."productions"
    ADD CONSTRAINT "productions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "admins can manage" ON "public"."locations" USING (("org_id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "admins can manage invites" ON "public"."org_invites" USING (("org_id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "admins can manage productions" ON "public"."productions" USING (("org_id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "admins can manage teams" ON "public"."teams" USING (("org_id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "anyone can read invite by token" ON "public"."org_invites" FOR SELECT USING (true);



CREATE POLICY "audit: members insert" ON "public"."equipment_audit" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_member"("org_id"));



CREATE POLICY "audit: members read" ON "public"."equipment_audit" FOR SELECT USING ("public"."is_active_member"("org_id"));



CREATE POLICY "authenticated users can insert audit records" ON "public"."equipment_audit" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."beta_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipment delete by role" ON "public"."equipment_items" FOR DELETE USING (("org_id" IN ( SELECT "om"."org_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "equipment insert by role" ON "public"."equipment_items" FOR INSERT WITH CHECK (("org_id" IN ( SELECT "om"."org_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND (("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (("om"."role" = 'department_head'::"text") AND ("om"."team_id" = "equipment_items"."team_id")))))));



CREATE POLICY "equipment read by role" ON "public"."equipment_items" FOR SELECT USING (("org_id" IN ( SELECT "om"."org_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND (("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (("om"."role" = ANY (ARRAY['crew'::"text", 'department_head'::"text"])) AND ("om"."team_id" = "equipment_items"."team_id")))))));



CREATE POLICY "equipment update by role" ON "public"."equipment_items" FOR UPDATE USING (("org_id" IN ( SELECT "om"."org_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND (("om"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (("om"."role" = ANY (ARRAY['department_head'::"text", 'crew'::"text"])) AND ("om"."team_id" = "equipment_items"."team_id")))))));



CREATE POLICY "equipment: admins delete" ON "public"."equipment_items" FOR DELETE USING ("public"."is_org_admin"("org_id"));



CREATE POLICY "equipment: members insert" ON "public"."equipment_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_active_member"("org_id"));



CREATE POLICY "equipment: members read" ON "public"."equipment_items" FOR SELECT USING ("public"."is_active_member"("org_id"));



CREATE POLICY "equipment: members update" ON "public"."equipment_items" FOR UPDATE USING ("public"."is_active_member"("org_id")) WITH CHECK ("public"."is_active_member"("org_id"));



ALTER TABLE "public"."equipment_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipment_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members can view" ON "public"."locations" FOR SELECT USING (("org_id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "members can view subscription" ON "public"."subscriptions" FOR SELECT USING (("org_id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "members_insert_self" ON "public"."organization_members" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "members_select_self" ON "public"."organization_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "members_update_admin" ON "public"."organization_members" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "me"
  WHERE (("me"."org_id" = "organization_members"."org_id") AND ("me"."user_id" = "auth"."uid"()) AND ("me"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "me"
  WHERE (("me"."org_id" = "organization_members"."org_id") AND ("me"."user_id" = "auth"."uid"()) AND ("me"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "org admins can remove members of their org" ON "public"."organization_members" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "me"
  WHERE (("me"."org_id" = "organization_members"."org_id") AND ("me"."user_id" = "auth"."uid"()) AND ("me"."status" = 'active'::"text") AND ("me"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "org members can insert requests" ON "public"."equipment_requests" FOR INSERT WITH CHECK (("org_id" = "public"."auth_org_id"()));



CREATE POLICY "org members can read audit records" ON "public"."equipment_audit" FOR SELECT USING (("org_id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "org members can read productions" ON "public"."productions" FOR SELECT USING (("org_id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "org members can read requests" ON "public"."equipment_requests" FOR SELECT USING (("org_id" = "public"."auth_org_id"()));



CREATE POLICY "org members can read teams" ON "public"."teams" FOR SELECT USING (("org_id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "org members can update requests" ON "public"."equipment_requests" FOR UPDATE USING (("org_id" = "public"."auth_org_id"()));



CREATE POLICY "org members can view members of their org" ON "public"."organization_members" FOR SELECT USING ("public"."is_active_member_of_org"("org_id"));



CREATE POLICY "org members can view profiles of their org" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."user_id" = "profiles"."id") AND "public"."is_active_member_of_org"("m"."org_id")))));



CREATE POLICY "org_insert_authenticated" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK (true);



ALTER TABLE "public"."org_invites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_select_member" ON "public"."organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."org_id" = "organizations"."id") AND ("m"."user_id" = "auth"."uid"())))));



CREATE POLICY "org_update_admin" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."org_id" = "organizations"."id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members" "m"
  WHERE (("m"."org_id" = "organizations"."id") AND ("m"."user_id" = "auth"."uid"()) AND ("m"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owners can update their organization" ON "public"."organizations" FOR UPDATE USING (("id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'owner'::"text"))))) WITH CHECK (("id" IN ( SELECT "organization_members"."org_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'owner'::"text")))));



ALTER TABLE "public"."productions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users can read own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."equipment_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."equipment_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."locations";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."accept_org_invite_for_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."accept_org_invite_for_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_org_invite_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_free_subscription"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_free_subscription"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_free_subscription"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_org_for_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_org_for_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_org_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_equipment_quantity"("item_id" "uuid", "delta" integer, "updated_by_val" "text", "updated_at_val" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."increment_equipment_quantity"("item_id" "uuid", "delta" integer, "updated_by_val" "text", "updated_at_val" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_equipment_quantity"("item_id" "uuid", "delta" integer, "updated_by_val" "text", "updated_at_val" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_member"("_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_member"("_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_member"("_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_active_member_of_org"("target_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_member_of_org"("target_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_member_of_org"("target_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin"("_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_equipment_audit"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_equipment_audit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_equipment_audit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_equipment_audit_dev"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_equipment_audit_dev"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_equipment_audit_dev"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_test_user"("test_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_test_user"("test_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_test_user"("test_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";


















GRANT ALL ON TABLE "public"."beta_feedback" TO "anon";
GRANT ALL ON TABLE "public"."beta_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."beta_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_audit" TO "anon";
GRANT ALL ON TABLE "public"."equipment_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_audit" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_items" TO "anon";
GRANT ALL ON TABLE "public"."equipment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_items" TO "service_role";



GRANT ALL ON TABLE "public"."equipment_requests" TO "anon";
GRANT ALL ON TABLE "public"."equipment_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."equipment_requests" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."org_invites" TO "anon";
GRANT ALL ON TABLE "public"."org_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."org_invites" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."productions" TO "anon";
GRANT ALL ON TABLE "public"."productions" TO "authenticated";
GRANT ALL ON TABLE "public"."productions" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();



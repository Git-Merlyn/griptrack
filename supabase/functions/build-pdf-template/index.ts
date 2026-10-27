/**
 * build-pdf-template — Supabase Edge Function (WP26 Phase 4, TODO 9.21)
 *
 * "Set up this layout for me": suggests the column layout of a supplier's
 * rental PDF when GripTrack doesn't know it yet. The client sends the text
 * items of the first pages (not the file); Claude answers with the same
 * choices a person makes in "teach it"; the choices are checked against the
 * pages and returned. Nothing is saved here: the client opens the teach
 * screen pre-filled, and the user checks the rows and saves.
 *
 * Request body: { pages: { str, transform, width }[][] }  (1 to 3 pages)
 * Response:     200 { choice, rows }
 *               400/413 bad body
 *               401 not signed in
 *               402 Free plan: { error, code: "plan_limit:pdf_layout" } (neutral text: shown in the apps)
 *               403 role cannot import
 *               428 the account hasn't agreed yet: { error, code: "consent_required" }
 *                   (profiles.layout_setup_consent_at, set by record_layout_setup_consent)
 *               422 no usable suggestion: { error, code: "no_suggestion" }
 *               429 daily limit (5 per organization): { error, code: "daily_limit" }
 *               503 not configured (no ANTHROPIC_API_KEY)
 * Secrets: ANTHROPIC_API_KEY; ANTHROPIC_WORKSPACE_ID only when the key is
 *          not scoped to a workspace (sent as anthropic-workspace-id).
 *               500 anything else (generic message)
 *
 * Privacy: page text goes to Anthropic only from here, and is never logged
 * or stored. The build log (pdf_template_builds) holds who and when.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { requireUser } from '../_shared/auth.ts';
import { createClient } from '../_shared/deps.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { BuildError, DAILY_LIMIT, parsePagesBody, suggestLayout } from './logic.ts';

const IMPORT_ROLES = new Set(['owner', 'admin', 'department_head']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Plan gate: Pro and Team (WP26 Decision 3A). Fails closed: this
    // request costs money and sends text to an outside service.
    const { data: plan, error: planErr } = await admin.rpc('user_effective_plan', { p_user: user.id });
    if (planErr) throw planErr;
    if (plan === 'free') {
      return json(
        { error: "Plan limit: layout setup is not included in this organization's plan.", code: 'plan_limit:pdf_layout' },
        402,
      );
    }

    const { data: member, error: memberErr } = await admin
      .from('organization_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (memberErr) throw memberErr;
    const m = member as { org_id: string; role: string } | null;
    if (!m || !IMPORT_ROLES.has(m.role)) {
      return json({ error: 'Only owners, admins and department heads can set up layouts.' }, 403);
    }

    // The account must have agreed (once) that page text goes to Anthropic.
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('layout_setup_consent_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!(profile as { layout_setup_consent_at?: string | null } | null)?.layout_setup_consent_at) {
      return json(
        { error: 'Confirm that GripTrack may send this text to Anthropic first.', code: 'consent_required' },
        428,
      );
    }

    const pages = parsePagesBody(await req.text());

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return json({ error: 'Layout setup is not available yet. Teach the layout yourself instead.' }, 503);
    }

    const { data: allowed, error: limitErr } = await admin.rpc('record_pdf_template_build', {
      p_org: m.org_id,
      p_user: user.id,
      p_limit: DAILY_LIMIT,
    });
    if (limitErr) throw limitErr;
    if (allowed !== true) {
      return json(
        {
          error: `Your organization has used today's ${DAILY_LIMIT} layout setups. Teach this layout yourself, or try again tomorrow.`,
          code: 'daily_limit',
        },
        429,
      );
    }

    // A key that isn't scoped to a workspace must name one per request
    // (Anthropic answers 400 otherwise). ANTHROPIC_WORKSPACE_ID is optional:
    // a workspace-scoped key needs nothing.
    const workspaceId = Deno.env.get('ANTHROPIC_WORKSPACE_ID');
    const client = new Anthropic({
      apiKey,
      ...(workspaceId ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } } : {}),
    });
    const result = await suggestLayout(client, pages);
    return json(result);
  } catch (err) {
    if (err instanceof BuildError) {
      return json(err.code ? { error: err.message, code: err.code } : { error: err.message }, err.status);
    }
    // Never log the request body (page text).
    console.error('build-pdf-template error:', err instanceof Error ? err.name + ': ' + err.message : 'unknown');
    return json({ error: "Couldn't set up this layout. Please try again, or teach it yourself." }, 500);
  }
});

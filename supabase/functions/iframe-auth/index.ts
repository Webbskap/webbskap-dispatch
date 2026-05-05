// Iframe auth handshake from Webbskap
// Webbskap calls: GET /iframe-auth?eid=<externalCustomerId>&wid=<websiteId>&em=<email>&nm=<name>&sub=<subdomain>&ts=<unix>&sig=<hmac>
// HMAC = HMAC-SHA256(IFRAME_HMAC_SECRET, `${eid}.${wid}.${ts}`) hex
// Returns: { access_token, refresh_token, tenant_id }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IFRAME_SECRET = Deno.env.get("IFRAME_HMAC_SECRET") ?? "PLACEHOLDER_CHANGE_ME";
const MAX_AGE_SEC = 300; // 5 min token validity

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const p = url.searchParams;
    const eid = p.get("eid"); // externalCustomerId
    const wid = p.get("wid") ?? ""; // websiteId
    const ts = p.get("ts");
    const sig = p.get("sig");
    const email = p.get("em") ?? "";
    const name = p.get("nm") ?? "";
    const subdomain = p.get("sub") ?? "";

    if (!eid || !ts || !sig) {
      return new Response(JSON.stringify({ error: "missing_params" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const age = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(age) || age > MAX_AGE_SEC) {
      return new Response(JSON.stringify({ error: "expired_token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expected = await hmacHex(IFRAME_SECRET, `${eid}.${wid}.${ts}`);
    if (!timingSafeEq(expected, sig.toLowerCase())) {
      return new Response(JSON.stringify({ error: "bad_signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Upsert tenant
    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .upsert(
        {
          external_customer_id: eid,
          website_id: wid || null,
          subdomain: subdomain || null,
          owner_email: email || null,
          owner_name: name || null,
          display_name: subdomain || name || eid,
        },
        { onConflict: "external_customer_id,website_id" },
      )
      .select()
      .single();
    if (tErr || !tenant) throw tErr ?? new Error("tenant_upsert_failed");

    // Find/create auth user (deterministic email so we can re-auth same user)
    const userEmail = email || `wb-${eid}-${wid || "x"}@webbskap.local`;

    // Try find existing user
    let userId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === userEmail.toLowerCase());
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: userEmail,
        email_confirm: true,
        user_metadata: { external_customer_id: eid, website_id: wid, name },
      });
      if (cErr || !created.user) throw cErr ?? new Error("user_create_failed");
      userId = created.user.id;
    }

    // Ensure role mapping
    await admin.from("user_roles").upsert(
      { user_id: userId, tenant_id: tenant.id, role: "owner" },
      { onConflict: "user_id,tenant_id,role" },
    );

    // Generate magic link → extract tokens
    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    });
    if (lErr) throw lErr;

    return new Response(
      JSON.stringify({
        tenant_id: tenant.id,
        email: userEmail,
        // Hashed token used by client to call /verify
        action_link: link.properties?.action_link,
        hashed_token: link.properties?.hashed_token,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("iframe-auth error", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

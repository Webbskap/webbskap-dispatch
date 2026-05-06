// Auto-provisions a tenant + owner role for a freshly signed-up user.
// Idempotent: if user already has a tenant, returns it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const sb = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub;
    const email = claims?.claims?.email as string | undefined;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Existing tenant?
    const { data: existing } = await admin
      .from("user_roles")
      .select("tenant_id, tenants:tenant_id (id, display_name, subdomain, external_customer_id, website_id)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if ((existing as any)?.tenants) {
      return json({ tenant: (existing as any).tenants });
    }

    // Create new tenant — external_customer_id defaults to user id, can be linked later
    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .insert({
        external_customer_id: userId,
        display_name: email ?? "Min butik",
        owner_email: email ?? null,
      })
      .select()
      .single();
    if (tErr || !tenant) throw tErr ?? new Error("tenant_insert_failed");

    const { error: rErr } = await admin
      .from("user_roles")
      .insert({ user_id: userId, tenant_id: tenant.id, role: "owner" });
    if (rErr) throw rErr;

    return json({ tenant });
  } catch (e: any) {
    console.error("provision-tenant error", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

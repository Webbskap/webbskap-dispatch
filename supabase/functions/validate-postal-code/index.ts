// Validate a postal code against PostNord. Used inline in settings to
// catch typos like "111 32" vs "11132" before they reach a booking.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { postnordBase } from "../_shared/postnord.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const POSTNORD_KEY_LIVE = Deno.env.get("POSTNORD_API_KEY") ?? "";
const POSTNORD_KEY_SANDBOX = Deno.env.get("POSTNORD_API_KEY_SANDBOX") ?? "";

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return jsonResp({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return jsonResp({ error: "unauthorized" }, 401);

    const { postalCode, countryCode } = await req.json();
    if (!postalCode) return jsonResp({ error: "missing_postal_code" }, 400);
    const cc = (countryCode ?? "SE").toUpperCase();
    const cleaned = String(postalCode).replace(/\s+/g, "");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: role } = await admin
      .from("user_roles").select("tenant_id").eq("user_id", u.user.id).limit(1).maybeSingle();
    if (!role?.tenant_id) return jsonResp({ error: "tenant_not_found" }, 404);

    const { data: pnCfg } = await admin
      .from("tenant_postnord_config").select("api_key, environment")
      .eq("tenant_id", role.tenant_id).maybeSingle();
    const env = (pnCfg?.environment ?? "sandbox") as "sandbox" | "live";
    const apiKey = pnCfg?.api_key || (env === "live" ? POSTNORD_KEY_LIVE : POSTNORD_KEY_SANDBOX);
    if (!apiKey) return jsonResp({ error: "postnord_not_configured" }, 400);

    const url = `${postnordBase(env)}/rest/shipment/v1/validate/postalcode?apikey=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ postalCode: cleaned, countryCode: cc }]),
    });
    const txt = await r.text();
    let body: any = null;
    try { body = JSON.parse(txt); } catch { /* */ }

    if (!r.ok) {
      console.error("postal code validate failed", r.status, txt.slice(0, 300));
      return jsonResp({ valid: false, error: "postnord_failed", body }, 200);
    }

    // PostNord returns either an array of results or { compositeFault: {...} }
    // A valid postal code yields an entry with status "OK" or similar.
    const first = Array.isArray(body) ? body[0] : body?.[0];
    const status = first?.status ?? first?.validationResult ?? null;
    const valid = !!(status && /ok|valid/i.test(status)) || (!body?.compositeFault && r.status === 200 && !!first);

    return jsonResp({ valid, cleaned, country: cc, raw: body });
  } catch (e: any) {
    console.error("validate-postal-code error", e);
    return jsonResp({ error: String(e?.message ?? e) }, 500);
  }
});

// Find nearest PostNord service points by address.
// Wraps /rest/businesslocation/v5/servicepoints/nearest/byaddress so the
// browser doesn't need to hold a PostNord API key.
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

    const { postalCode, countryCode, city, streetName, streetNumber, count } = await req.json();
    if (!postalCode) return jsonResp({ error: "missing_postal_code" }, 400);
    const cc = (countryCode ?? "SE").toUpperCase();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: role } = await admin
      .from("user_roles")
      .select("tenant_id")
      .eq("user_id", u.user.id)
      .limit(1)
      .maybeSingle();
    if (!role?.tenant_id) return jsonResp({ error: "tenant_not_found" }, 404);

    const { data: pnCfg } = await admin
      .from("tenant_postnord_config")
      .select("api_key, environment")
      .eq("tenant_id", role.tenant_id)
      .maybeSingle();
    const env = (pnCfg?.environment ?? "sandbox") as "sandbox" | "live";
    const apiKey = pnCfg?.api_key || (env === "live" ? POSTNORD_KEY_LIVE : POSTNORD_KEY_SANDBOX);
    if (!apiKey) return jsonResp({ error: "postnord_not_configured" }, 400);

    const params = new URLSearchParams({
      apikey: apiKey,
      returnType: "json",
      countryCode: cc,
      postalCode: String(postalCode).replace(/\s+/g, ""),
      numberOfServicePoints: String(Math.max(1, Math.min(20, Number(count ?? 10)))),
      srId: "EPSG:4326",
      responseFilter: "public",
    });
    if (city) params.set("city", city);
    if (streetName) params.set("streetName", streetName);
    if (streetNumber) params.set("streetNumber", streetNumber);

    const url = `${postnordBase(env)}/rest/businesslocation/v5/servicepoints/nearest/byaddress?${params.toString()}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const txt = await r.text();
    let body: any = null;
    try { body = JSON.parse(txt); } catch { /* leave null */ }

    if (!r.ok) {
      console.error("service points fetch failed", r.status, txt.slice(0, 500));
      return jsonResp({ error: "postnord_failed", status: r.status, body }, 400);
    }

    // PostNord can return HTTP 200 with a compositeFault wrapper instead of
    // results. Check before assuming the array is just empty.
    const wrapper = body?.servicePointInformationResponse;
    const faults: any[] = wrapper?.compositeFault?.faults ?? [];
    if (faults.length > 0) {
      const message = faults[0]?.explanationText ?? wrapper?.message ?? "Okänt fel från PostNord";
      const code = faults[0]?.faultCode ?? null;
      console.error("service points returned fault", { code, message, faults });
      return jsonResp({ error: "postnord_fault", message, code, faults }, 400);
    }

    // Normalise the array (servicePoints is the field name on success)
    const list: any[] = wrapper?.servicePoints ?? [];
    const normalized = list.map((sp) => ({
      id: sp.servicePointId,
      name: sp.name,
      delivery_address: sp.deliveryAddress,
      visiting_address: sp.visitingAddress,
      distance: sp.routeDistance ?? null,
      opening_hours: sp.openingHours?.postalServices ?? [],
      type: sp.type?.groupTypeName ?? null,
    }));
    return jsonResp({ ok: true, servicePoints: normalized });
  } catch (e: any) {
    console.error("find-service-points error", e);
    return jsonResp({ error: String(e?.message ?? e) }, 500);
  }
});

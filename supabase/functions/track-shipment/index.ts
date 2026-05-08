// Refresh shipment tracking status
// POST /track-shipment { shipment_id }  (authenticated user, must have tenant access)
// Or scheduled run with header X-Cron-Secret: <CRON_SECRET> and empty body
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const POSTNORD_PARTNER_KEY_LIVE = Deno.env.get("POSTNORD_API_KEY") ?? "";
const POSTNORD_PARTNER_KEY_SANDBOX = Deno.env.get("POSTNORD_API_KEY_SANDBOX") ?? "";

const TRACK_BASE_LIVE = "https://api2.postnord.com/rest/shipment/v5/trackandtrace/findByIdentifier.json";
const TRACK_BASE_SANDBOX = "https://atapi2.postnord.com/rest/shipment/v5/trackandtrace/findByIdentifier.json";

function mapStatus(s: string | null | undefined): string {
  const v = (s ?? "").toUpperCase();
  // Order matters: check negations / specific terms before generic substrings
  if (v.includes("CANCEL")) return "cancelled";
  if (v.includes("RETURN")) return "returned";
  if (v.includes("NOT_DELIVERED") || v.includes("NOTDELIVERED") || v.includes("FAILED")) return "in_transit";
  if (v.includes("DELIVERED")) return "delivered";
  if (v.includes("TRANSIT") || v.includes("EN_ROUTE") || v.includes("INFORMED")) return "in_transit";
  if (v.includes("BOOKED") || v.includes("CREATED")) return "booked";
  return "unknown";
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const cronHeader = req.headers.get("x-cron-secret");
    const isCron = !!CRON_SECRET && cronHeader === CRON_SECRET;

    let shipmentIds: string[] = [];

    if (isCron) {
      // Internal scheduled run — operate on recent active shipments
      const { data } = await admin
        .from("shipments")
        .select("id")
        .in("status", ["booked", "in_transit", "unknown"])
        .order("booked_at", { ascending: false })
        .limit(50);
      shipmentIds = (data ?? []).map((r) => r.id);
    } else {
      // Authenticated user request — must specify a shipment they have access to
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return jsonResp({ error: "unauthorized" }, 401);
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: userData, error: uErr } = await userClient.auth.getUser();
      if (uErr || !userData?.user) {
        return jsonResp({ error: "unauthorized" }, 401);
      }
      const userId = userData.user.id;

      if (!body?.shipment_id) {
        return jsonResp({ error: "shipment_id required" }, 400);
      }

      // Verify tenant access
      const { data: shipment } = await admin
        .from("shipments")
        .select("tenant_id")
        .eq("id", body.shipment_id)
        .maybeSingle();
      if (!shipment) return jsonResp({ error: "not_found" }, 404);

      const { data: access } = await admin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("tenant_id", shipment.tenant_id)
        .maybeSingle();
      if (!access) return jsonResp({ error: "forbidden" }, 403);

      shipmentIds = [body.shipment_id];
    }

    const results: any[] = [];
    for (const id of shipmentIds) {
      const { data: s } = await admin.from("shipments").select("*").eq("id", id).single();
      if (!s?.tracking_no) continue;
      const { data: pn } = await admin
        .from("tenant_postnord_config")
        .select("api_key, environment")
        .eq("tenant_id", s.tenant_id)
        .single();

      const env = (pn?.environment ?? "sandbox") as "sandbox" | "live";
      const partnerKey = env === "live" ? POSTNORD_PARTNER_KEY_LIVE : POSTNORD_PARTNER_KEY_SANDBOX;
      const apiKey = pn?.api_key || partnerKey;
      if (!apiKey) continue;
      const trackBase = env === "live" ? TRACK_BASE_LIVE : TRACK_BASE_SANDBOX;

      const u = `${trackBase}?id=${encodeURIComponent(s.tracking_no)}&locale=sv&apikey=${encodeURIComponent(apiKey)}`;
      const r = await fetch(u);
      const j = await r.json().catch(() => null);
      const events = j?.TrackingInformationResponse?.shipments?.[0]?.items?.[0]?.events ?? [];
      const latest = events[events.length - 1] ?? null;
      const status = mapStatus(latest?.eventCode ?? latest?.status);

      await admin.from("shipments").update({
        status, last_status_check: new Date().toISOString(),
        status_history: [...(s.status_history ?? []), { at: new Date().toISOString(), status, raw: latest }],
      }).eq("id", id);
      results.push({ id, status });
    }

    return jsonResp({ ok: true, results });
  } catch (e: any) {
    return jsonResp({ error: String(e?.message ?? e) }, 500);
  }
});

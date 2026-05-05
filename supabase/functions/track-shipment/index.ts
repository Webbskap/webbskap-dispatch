// Refresh shipment tracking status
// POST /track-shipment { shipment_id }  (or scheduled run when called with {})
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TRACK_BASE = "https://api2.postnord.com/rest/shipment/v5/trackandtrace/findByIdentifier.json";

function mapStatus(s: string | null | undefined): string {
  const v = (s ?? "").toUpperCase();
  if (v.includes("DELIVERED")) return "delivered";
  if (v.includes("RETURN")) return "returned";
  if (v.includes("CANCEL")) return "cancelled";
  if (v.includes("TRANSIT") || v.includes("EN_ROUTE") || v.includes("INFORMED")) return "in_transit";
  if (v.includes("BOOKED") || v.includes("CREATED")) return "booked";
  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  let shipmentIds: string[] = [];

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (body?.shipment_id) {
      shipmentIds = [body.shipment_id];
    } else {
      // Pick recent active shipments
      const { data } = await admin
        .from("shipments")
        .select("id")
        .in("status", ["booked", "in_transit", "unknown"])
        .order("booked_at", { ascending: false })
        .limit(50);
      shipmentIds = (data ?? []).map((r) => r.id);
    }

    const results: any[] = [];
    for (const id of shipmentIds) {
      const { data: s } = await admin.from("shipments").select("*").eq("id", id).single();
      if (!s?.tracking_no) continue;
      const { data: pn } = await admin
        .from("tenant_postnord_config")
        .select("api_key")
        .eq("tenant_id", s.tenant_id)
        .single();
      if (!pn?.api_key) continue;

      const u = `${TRACK_BASE}?id=${encodeURIComponent(s.tracking_no)}&locale=sv&apikey=${pn.api_key}`;
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

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

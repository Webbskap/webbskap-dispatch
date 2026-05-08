// Validate PostNord customer number
// POST { customer_number, country_code? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const POSTNORD_PARTNER_KEY = Deno.env.get("POSTNORD_API_KEY") ?? "";
const POSTNORD_PARTNER_KEY_SANDBOX = Deno.env.get("POSTNORD_API_KEY_SANDBOX") ?? "";
const PN_LIVE = "https://api2.postnord.com";
const PN_SANDBOX = "https://atapi2.postnord.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: uErr } = await sb.auth.getUser();
  if (uErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const customerNumber = String(body.customer_number ?? "").trim();
  const countryCode = String(body.country_code ?? "SE").trim().toUpperCase();
  const env = (body.environment ?? "sandbox") as "sandbox" | "live";
  const apiKey = body.api_key
    || (env === "live" ? POSTNORD_PARTNER_KEY : POSTNORD_PARTNER_KEY_SANDBOX);

  if (!customerNumber) {
    return new Response(JSON.stringify({ error: "missing_customer_number" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "missing_api_key" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const base = env === "live" ? PN_LIVE : PN_SANDBOX;
  const url = `${base}/rest/shipment/v1/validate/customernumber?apikey=${encodeURIComponent(apiKey)}&customerNumber=${encodeURIComponent(customerNumber)}&countryCode=${encodeURIComponent(countryCode)}`;

  try {
    const r = await fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
    const text = await r.text();
    return new Response(JSON.stringify({
      ok: r.ok,
      status: r.status,
      valid: r.ok,
      details: text || null,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Webbskap site webhook ingest
// URL pattern: POST /webhook-ingest/<tenant_id>
// Verifies X-Webhook-Signature (HMAC-SHA512 hex digest of raw body using tenant webhook_secret)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function hmacSha512Hex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const url = new URL(req.url);
  // path: /webhook-ingest/<tenant_id>
  const parts = url.pathname.split("/").filter(Boolean);
  const tenantId = parts[parts.length - 1];

  const topic = req.headers.get("X-Webhook-Topic") ?? "unknown";
  const sig = req.headers.get("X-Webhook-Signature") ?? "";
  const raw = await req.text();

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let payload: any = null;
  try { payload = JSON.parse(raw); } catch { /* keep null */ }

  // Look up tenant + secret
  const { data: cfg } = await admin
    .from("tenant_webbskap_config")
    .select("webhook_secret")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  let verified = false;
  if (cfg?.webhook_secret) {
    const expected = await hmacSha512Hex(cfg.webhook_secret, raw);
    verified = timingSafeEq(expected, sig.toLowerCase());
  }

  // Always log the event
  await admin.from("webhook_events").insert({
    tenant_id: tenantId,
    source: "webbskap_site",
    topic,
    payload,
    signature: sig,
    verified,
    processed: false,
  });

  if (!verified) {
    return new Response(JSON.stringify({ error: "invalid_signature" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (topic === "order_created" || topic === "order_updated") {
      const o = payload ?? {};
      await admin.from("orders").upsert(
        {
          tenant_id: tenantId,
          webbskap_order_id: String(o.id ?? o.invoiceNo ?? crypto.randomUUID()),
          invoice_no: o.invoiceNo ? String(o.invoiceNo) : null,
          customer_name: o.customerName ?? null,
          customer_email: o.customerEmail ?? null,
          shipping_address: o.shippingAddress ?? null,
          billing_address: o.billingAddress ?? null,
          items: o.items ?? [],
          weight: o.weight ?? null,
          weight_unit: o.weightUnit ?? "kg",
          sub_total: o.subTotal ?? null,
          total: o.total ?? null,
          shipping_name: o.shippingName ?? null,
          shipping_amount: o.shippingAmount ?? null,
          paid: !!o.paid,
          status: (o.status ? String(o.status).toLowerCase() : "pending"),
          raw: o,
          webbskap_created_at: o.created ? new Date(o.created * 1000).toISOString() : null,
        },
        { onConflict: "tenant_id,webbskap_order_id" },
      );
    }
  } catch (e) {
    console.error("processing error", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
